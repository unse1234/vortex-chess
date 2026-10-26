import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { performance } from 'node:perf_hooks';
import type { Environment } from '../../config/environment';
import { EngineError, isEngineError, type EngineErrorKind } from './engine-errors';
import { EngineMetrics } from './engine-metrics';
import {
  CHESS_ENGINE_PROVIDER,
  type ChessEngineProvider,
  type SearchResult,
} from './engine.types';
import { SearchGate } from './search-gate';

/** What the clock allows for one attempt: the movetime to request and the hard HTTP limit. */
export type SearchBudget = { searchMs: number; timeoutMs: number };

export type SearchProgress = {
  phase: 'queued' | 'thinking' | 'retrying';
  attempt: number;
  /** For `retrying`: why the previous attempt failed. */
  lastError?: EngineErrorKind;
};

export type MoveSearch = {
  fen: string;
  /**
   * Recomputed before every attempt (and after queueing) from the engine's
   * official clock, so waiting and retries are paid from the same allowance.
   * Null when no search fits any more.
   */
  budget: () => SearchBudget | null;
  signal?: AbortSignal;
  onProgress?: (progress: SearchProgress) => void;
  /** For logs only. */
  label?: string;
};

export type MoveSearchOutcome =
  | { ok: true; result: SearchResult; attempts: number }
  | { ok: false; error: EngineError; attempts: number };

export type EngineAvailability = {
  configured: boolean;
  ready: boolean;
  engine: string | null;
};

const STATUS_TTL_MS = 5_000;

/**
 * The engine boundary used by the Games application layer. It owns the
 * bounded upstream concurrency, the retry policy and health reads; it never
 * touches game state. Only failures that cannot have started a search, or
 * that the service reports as busy/unavailable, are retried, and only while
 * the caller's budget allows. Timeouts are not retried: the original search
 * may still occupy the service, so its slot is quarantined instead.
 */
@Injectable()
export class EnginesService {
  private readonly logger = new Logger(EnginesService.name);
  private readonly gate: SearchGate;
  private readonly maxAttempts: number;
  private readonly retryBaseMs: number;
  private readonly quarantineMs: number;
  private readonly healthTimeoutMs: number;
  private status?: { at: number; value: Promise<EngineAvailability> };

  constructor(
    @Optional() @Inject(CHESS_ENGINE_PROVIDER) private readonly provider: ChessEngineProvider | null,
    config: ConfigService<Environment, true>,
    private readonly metrics: EngineMetrics,
  ) {
    this.gate = new SearchGate({
      concurrency: config.get('ENGINE_MAX_CONCURRENT_SEARCHES', { infer: true }),
      queue: config.get('ENGINE_MAX_QUEUED_SEARCHES', { infer: true }),
    });
    this.maxAttempts = config.get('ENGINE_MAX_ATTEMPTS', { infer: true });
    this.retryBaseMs = config.get('ENGINE_RETRY_BASE_MS', { infer: true });
    this.quarantineMs = config.get('ENGINE_ABORT_QUARANTINE_MS', { infer: true });
    this.healthTimeoutMs = config.get('ENGINE_HEALTH_TIMEOUT_MS', { infer: true });
  }

  get configured() {
    return this.provider !== null;
  }

  get load() {
    return this.gate.stats;
  }

  /**
   * Readiness for display (briefly cached, single flight). Health is not a
   * reservation: it does not prove there is capacity for another search.
   */
  availability(): Promise<EngineAvailability> {
    if (!this.provider) return Promise.resolve({ configured: false, ready: false, engine: null });
    const now = Date.now();
    if (!this.status || now - this.status.at > STATUS_TTL_MS)
      this.status = {
        at: now,
        value: this.provider
          .health({ timeoutMs: this.healthTimeoutMs })
          .then((h) => ({ configured: true, ready: h.ready, engine: h.engine }))
          .catch(() => ({ configured: true, ready: false, engine: null })),
      };
    return this.status.value;
  }

  /** A fresh readiness check, used before a game's clock starts. */
  async requireReady(): Promise<{ engine: string }> {
    if (!this.provider) throw new EngineError('not_configured', 'Engine play is not configured');
    const health = await this.provider.health({ timeoutMs: this.healthTimeoutMs });
    this.status = { at: Date.now(), value: Promise.resolve({ configured: true, ready: health.ready, engine: health.engine }) };
    if (!health.ready) throw new EngineError('unavailable', 'The engine service reports it is not ready');
    return { engine: health.engine };
  }

  /** Asks for one move with a clock-aware movetime. Never throws. */
  async findMove(search: MoveSearch): Promise<MoveSearchOutcome> {
    if (!this.provider)
      return { ok: false, error: new EngineError('not_configured', 'Engine play is not configured'), attempts: 0 };
    let attempts = 0;
    let lastError: EngineError | null = null;
    let requestedMs = 0;
    const done = (outcome: MoveSearchOutcome, sample: { queueMs: number; result?: SearchResult }) => {
      const result = outcome.ok ? outcome.result : null;
      this.metrics.record({
        outcome: outcome.ok ? 'ok' : outcome.error.kind,
        attempts,
        queueMs: sample.queueMs,
        requestedMs,
        roundTripMs: result?.roundTripMs ?? null,
        engineTimeMs: result?.engineTimeMs ?? null,
        unsearched: !!result && result.bestMove !== null && result.depth === 0 && result.nodes === 0,
      });
      if (result && result.bestMove !== null && result.depth === 0 && result.nodes === 0)
        this.logger.warn(`${search.label ?? 'search'}: reply reports no search (depth 0, 0 nodes)`);
      return outcome;
    };
    let queueMs = 0;
    while (attempts < this.maxAttempts) {
      const before = search.budget();
      if (!before) return done(this.fail(lastError ?? noTime(), attempts), { queueMs });
      search.onProgress?.({ phase: 'queued', attempt: attempts + 1 });
      const queuedAt = performance.now();
      let permit;
      try {
        permit = await this.gate.acquire({ timeoutMs: before.timeoutMs, signal: search.signal });
      } catch (error) {
        return done(this.fail(asEngineError(error), attempts), { queueMs: performance.now() - queuedAt });
      }
      queueMs += performance.now() - queuedAt;
      // Queueing was paid from the same clock; recompute before sending.
      const budget = search.budget();
      if (!budget) {
        permit.release();
        return done(this.fail(noTime(), attempts), { queueMs });
      }
      attempts += 1;
      requestedMs = budget.searchMs;
      search.onProgress?.({ phase: 'thinking', attempt: attempts });
      try {
        const result = await this.provider.analyze(
          { fen: search.fen, limit: { kind: 'movetime', ms: budget.searchMs } },
          { timeoutMs: budget.timeoutMs, signal: search.signal },
        );
        permit.release();
        this.logger.debug(
          `${search.label ?? 'search'}: ${result.bestMove ?? 'null'} in ${Math.round(result.roundTripMs)} ms round trip ` +
            `(engine ${result.engineTimeMs} ms, depth ${result.depth}, requested ${budget.searchMs} ms)`,
        );
        return done({ ok: true, result, attempts }, { queueMs });
      } catch (error) {
        lastError = asEngineError(error);
        permit.release(lastError.mayStillRun ? budget.searchMs + this.quarantineMs : 0);
        this.logger.warn(`${search.label ?? 'search'}: attempt ${attempts} failed: ${lastError.message}`);
      }
      if (!lastError.retryable || attempts >= this.maxAttempts || search.signal?.aborted) break;
      const delay = this.retryBaseMs * 2 ** (attempts - 1) * (0.5 + Math.random() / 2);
      const remaining = search.budget();
      if (!remaining || delay >= remaining.timeoutMs) break;
      search.onProgress?.({ phase: 'retrying', attempt: attempts + 1, lastError: lastError.kind });
      if (!(await sleep(delay, search.signal))) break;
    }
    return done(this.fail(lastError ?? noTime(), attempts), { queueMs });
  }

  private fail(error: EngineError, attempts: number): MoveSearchOutcome {
    return { ok: false, error, attempts };
  }
}

const noTime = () => new EngineError('no_time', 'The engine clock leaves no room for a search');

function asEngineError(error: unknown) {
  return isEngineError(error)
    ? error
    : new EngineError('contract_violation', error instanceof Error ? error.message : 'Unknown engine failure');
}

/** Resolves false when cancelled. */
function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<boolean>((resolve) => {
    if (signal?.aborted) return resolve(false);
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve(true);
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve(false);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
