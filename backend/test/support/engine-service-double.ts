import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { firstLegalMove } from './engine-doubles';

export type AnalyzeBody = { fen: string; limits: Record<string, number> };
export type DoubleResponse = { status: number; body: unknown; delayMs?: number } | 'drop';
export type AnalyzeHandler = (body: AnalyzeBody) => DoubleResponse | Promise<DoubleResponse>;

export const analyzeOk = (bestmove: string | null, overrides: object = {}) => ({
  status: 200,
  body: {
    success: true,
    bestmove,
    ponder: null,
    score: bestmove ? { type: 'cp', value: 12 } : null,
    depth: bestmove ? 6 : 0,
    nodes: bestmove ? 25_000 : 0,
    nps: 600_000,
    time_ms: 40,
    pv: bestmove ? [bestmove] : [],
    timed_out: false,
    ...overrides,
  },
});

/** FastAPI's HTTPException shape, as the deployed service returns it. */
export const analyzeError = (status: number, error: string) => ({
  status,
  body: { detail: { success: false, error, detail: null } },
});

const HEALTHY: DoubleResponse = { status: 200, body: { status: 'ok', engine: 'double-engine', ready: true } };
const defaultReply: AnalyzeHandler = (body) => analyzeOk(firstLegalMove(body.fen));

/**
 * HTTP stand-in for the engine service (FastAPI): the documented endpoints,
 * scripted replies per request and full request capture. By default it
 * answers the first legal move of the requested position.
 */
export class EngineServiceDouble {
  readonly requests: { path: string; body: AnalyzeBody | null; at: number }[] = [];
  readonly script: AnalyzeHandler[] = [];
  health: DoubleResponse = HEALTHY;
  fallback: AnalyzeHandler = defaultReply;
  private server?: Server;

  /** Back to a healthy service answering first legal moves, with no history. */
  reset() {
    this.requests.length = 0;
    this.script.length = 0;
    this.health = HEALTHY;
    this.fallback = defaultReply;
  }

  get url() {
    return `http://127.0.0.1:${(this.server!.address() as AddressInfo).port}`;
  }

  get analyzeRequests() {
    return this.requests.filter((r) => r.path === '/analyze');
  }

  async start() {
    this.server = createServer((req, res) => void this.handle(req, res));
    await new Promise<void>((resolve) => this.server!.listen(0, '127.0.0.1', resolve));
  }

  async stop() {
    this.server?.closeAllConnections();
    await new Promise((resolve) => this.server?.close(resolve));
  }

  /** The next analyze request waits until released, holding a search "in flight". */
  hold(): { release: (response?: DoubleResponse) => void } {
    let release!: (response?: DoubleResponse) => void;
    const gate = new Promise<DoubleResponse | undefined>((resolve) => (release = resolve));
    this.script.push(async (body) => (await gate) ?? (await this.fallback(body)));
    return { release };
  }

  private async handle(req: IncomingMessage, res: ServerResponse) {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const path = req.url ?? '';
    const body = path === '/analyze' ? (JSON.parse(raw) as AnalyzeBody) : null;
    this.requests.push({ path, body, at: Date.now() });
    const response =
      path === '/health'
        ? this.health
        : path === '/analyze'
          ? await (this.script.shift() ?? this.fallback)(body!)
          : { status: 404, body: { detail: 'Not Found' } };
    if (response === 'drop') return req.socket.destroy();
    if (response.delayMs) await new Promise((resolve) => setTimeout(resolve, response.delayMs));
    if (res.destroyed) return;
    if (typeof response.body === 'string') res.writeHead(response.status, { 'Content-Type': 'text/html' }).end(response.body);
    else res.writeHead(response.status, { 'Content-Type': 'application/json' }).end(JSON.stringify(response.body));
  }
}
