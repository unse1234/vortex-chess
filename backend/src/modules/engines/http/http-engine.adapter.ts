import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import axios, { isAxiosError, type AxiosInstance, type AxiosResponse } from 'axios';
import { Agent as HttpAgent } from 'node:http';
import { Agent as HttpsAgent } from 'node:https';
import { performance } from 'node:perf_hooks';
import { EngineError } from '../engine-errors';
import {
  LIMIT_RANGES,
  type CallOptions,
  type ChessEngineProvider,
  type EngineHealth,
  type SearchRequest,
  type SearchResult,
} from '../engine.types';
import {
  analyzeResponseSchema,
  describeErrorBody,
  healthResponseSchema,
  type AnalyzeRequestBody,
} from './engine-http.contract';

/** Errors raised before the request could have reached the service: retrying cannot double a search. */
const NOT_SENT = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ENETUNREACH', 'EHOSTUNREACH']);
const MAX_RESPONSE_BYTES = 64 * 1024;

export type HttpEngineOptions = {
  baseUrl: string;
  /** Sockets kept open per origin; at least the search concurrency. */
  maxSockets: number;
};

/**
 * HTTP/JSON adapter for the engine service. It sends one documented request,
 * validates the response against the contract and normalizes every failure
 * into an EngineError. It does not retry, queue or interpret game state.
 */
@Injectable()
export class HttpEngineAdapter implements ChessEngineProvider, OnModuleDestroy {
  private readonly http: AxiosInstance;
  private readonly agents: [HttpAgent, HttpsAgent];

  constructor(options: HttpEngineOptions) {
    // Keep-alive avoids a new TCP and TLS handshake on every move.
    const agentOptions = { keepAlive: true, maxSockets: options.maxSockets, keepAliveMsecs: 15_000 };
    this.agents = [new HttpAgent(agentOptions), new HttpsAgent(agentOptions)];
    this.http = axios.create({
      baseURL: options.baseUrl.replace(/\/+$/, ''),
      httpAgent: this.agents[0],
      httpsAgent: this.agents[1],
      // Status codes are classified here, and bodies parsed strictly below.
      validateStatus: () => true,
      responseType: 'text',
      transformResponse: [(data: unknown) => data],
      maxContentLength: MAX_RESPONSE_BYTES,
      maxRedirects: 0,
      headers: { Accept: 'application/json' },
    });
  }

  onModuleDestroy() {
    for (const agent of this.agents) agent.destroy();
  }

  async health(options: CallOptions): Promise<EngineHealth> {
    const started = performance.now();
    const response = await this.send((signal) => this.http.get<string>('/health', { signal }), options);
    if (response.status !== 200) throw this.statusError(response);
    const parsed = healthResponseSchema.safeParse(this.json(response));
    if (!parsed.success) throw new EngineError('contract_violation', 'Health response does not match the contract', 200);
    return { ...parsed.data, roundTripMs: performance.now() - started };
  }

  async analyze(request: SearchRequest, options: CallOptions): Promise<SearchResult> {
    const body = toRequestBody(request);
    const started = performance.now();
    const response = await this.send(
      (signal) =>
        this.http.post<string>('/analyze', body, {
          signal,
          headers: { 'Content-Type': 'application/json' },
        }),
      options,
    );
    if (response.status !== 200) throw this.statusError(response);
    const parsed = analyzeResponseSchema.safeParse(this.json(response));
    if (!parsed.success)
      throw new EngineError('contract_violation', 'Analyze response does not match the contract', 200);
    const data = parsed.data;
    if (data.timed_out)
      throw new EngineError('search_timed_out', 'The engine service reported its safety timeout', 200);
    return {
      bestMove: data.bestmove,
      ponder: data.ponder,
      score: data.score,
      depth: data.depth,
      nodes: data.nodes,
      nps: data.nps,
      engineTimeMs: data.time_ms,
      pv: data.pv,
      roundTripMs: performance.now() - started,
    };
  }

  /** Runs one call under its own deadline, distinguishing our timeout from the caller's cancellation. */
  private async send(
    call: (signal: AbortSignal) => Promise<AxiosResponse<string>>,
    options: CallOptions,
  ) {
    const controller = new AbortController();
    let expired = false;
    const timer = setTimeout(() => {
      expired = true;
      controller.abort();
    }, Math.max(1, options.timeoutMs));
    const cancel = () => controller.abort();
    if (options.signal?.aborted) controller.abort();
    options.signal?.addEventListener('abort', cancel, { once: true });
    try {
      return await call(controller.signal);
    } catch (error) {
      if (expired) throw new EngineError('deadline_exceeded', `No response within ${options.timeoutMs} ms`);
      if (controller.signal.aborted) throw new EngineError('cancelled', 'The request was cancelled');
      const code = isAxiosError(error) ? (error.code ?? '') : '';
      if (NOT_SENT.has(code)) throw new EngineError('unavailable', `Engine service unreachable (${code})`);
      if (code === 'ERR_BAD_RESPONSE' || code === 'ERR_FR_MAX_CONTENT_LENGTH_EXCEEDED')
        throw new EngineError('contract_violation', 'Unreadable response');
      throw new EngineError('connection_lost', `Connection failed after sending (${code || 'unknown'})`);
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', cancel);
    }
  }

  private json(response: AxiosResponse<string>): unknown {
    try {
      return JSON.parse(response.data);
    } catch {
      throw new EngineError('contract_violation', 'Response is not JSON', response.status);
    }
  }

  private statusError(response: AxiosResponse<string>) {
    let summary = 'no body';
    try {
      summary = describeErrorBody(JSON.parse(response.data)).slice(0, 120);
    } catch {
      // Gateways answer with HTML; the status decides.
    }
    const status = response.status;
    const message = `Engine service answered ${status} (${summary})`;
    switch (status) {
      case 400:
        return new EngineError('invalid_position', message, status);
      case 422:
        return new EngineError('invalid_request', message, status);
      case 409:
        return new EngineError('busy', message, status);
      // 502 is what the hosting gateway answers while the service is down.
      case 502:
      case 503:
        return new EngineError('unavailable', message, status);
      case 504:
        return new EngineError('upstream_timeout', message, status);
      default:
        return new EngineError('contract_violation', message, status);
    }
  }
}

/** Builds the documented request; values outside the documented ranges are never sent. */
export function toRequestBody(request: SearchRequest): AnalyzeRequestBody {
  if (request.fen.trim().split(/\s+/).length !== 6)
    throw new EngineError('invalid_request', 'FEN must have six fields');
  const { limit } = request;
  const [value, range] =
    limit.kind === 'movetime'
      ? [limit.ms, LIMIT_RANGES.movetime]
      : limit.kind === 'depth'
        ? [limit.plies, LIMIT_RANGES.depth]
        : [limit.count, LIMIT_RANGES.nodes];
  if (!Number.isInteger(value) || value < range.min || value > range.max)
    throw new EngineError('invalid_request', `${limit.kind} ${value} is outside ${range.min}–${range.max}`);
  const limits =
    limit.kind === 'movetime'
      ? { movetime: limit.ms }
      : limit.kind === 'depth'
        ? { depth: limit.plies }
        : { nodes: limit.count };
  return { fen: request.fen, limits };
}
