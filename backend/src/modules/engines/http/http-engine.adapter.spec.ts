import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { EngineError } from '../engine-errors';
import { HttpEngineAdapter, toRequestBody } from './http-engine.adapter';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

type Handler = (req: IncomingMessage, body: string, res: ServerResponse) => void;

const ok = (overrides: object = {}) => ({
  success: true,
  bestmove: 'e2e4',
  ponder: 'e7e5',
  score: { type: 'cp', value: 20 },
  depth: 7,
  nodes: 40_000,
  nps: 800_000,
  time_ms: 48,
  pv: ['e2e4', 'e7e5'],
  timed_out: false,
  ...overrides,
});

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
}

describe('HTTP engine adapter (contract and failure normalization)', () => {
  let server: Server;
  let handler: Handler;
  let adapter: HttpEngineAdapter;
  const requests: { method: string; url: string; body: string }[] = [];

  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        requests.push({ method: req.method!, url: req.url!, body });
        handler(req, body, res);
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    adapter = new HttpEngineAdapter({
      baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}/`,
      maxSockets: 2,
    });
  });
  afterAll(async () => {
    adapter.onModuleDestroy();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  beforeEach(() => {
    requests.length = 0;
  });

  const analyze = (timeoutMs = 2_000) =>
    adapter.analyze({ fen: START, limit: { kind: 'movetime', ms: 200 } }, { timeoutMs });
  const failure = async (promise: Promise<unknown>) => {
    try {
      await promise;
    } catch (error) {
      if (error instanceof EngineError) return error;
      throw error;
    }
    throw new Error('expected an EngineError');
  };

  it('sends exactly one documented limit and maps a valid reply, keeping ponder and PV informational', async () => {
    handler = (_req, _body, res) => json(res, 200, ok());
    const result = await analyze();
    expect(JSON.parse(requests[0].body)).toEqual({ fen: START, limits: { movetime: 200 } });
    expect(requests[0]).toMatchObject({ method: 'POST', url: '/analyze' });
    expect(result).toMatchObject({ bestMove: 'e2e4', ponder: 'e7e5', depth: 7, engineTimeMs: 48, pv: ['e2e4', 'e7e5'] });
    expect(result.roundTripMs).toBeGreaterThan(0);
  });

  it('accepts promotion suffixes and a null best move', async () => {
    handler = (_req, _body, res) => json(res, 200, ok({ bestmove: 'a7a8q', ponder: null, pv: ['a7a8q', 'a2b3'] }));
    expect((await analyze()).bestMove).toBe('a7a8q');
    handler = (_req, _body, res) => json(res, 200, ok({ bestmove: null, ponder: null, score: null, depth: 0, nodes: 0, pv: [] }));
    expect((await analyze()).bestMove).toBeNull();
  });

  it.each([
    ['upper-case move', { bestmove: 'E2E4' }],
    ['king promotion', { bestmove: 'a7a8k' }],
    ['SAN instead of UCI', { bestmove: 'Nf3' }],
    ['malformed PV entry', { pv: ['e2e4', 'castle'] }],
    ['malformed ponder', { ponder: 'e7' }],
    ['missing field', { depth: undefined }],
    ['negative counter', { nodes: -1 }],
    ['unknown score type', { score: { type: 'wdl', value: 1 } }],
    ['success false with 200', { success: false }],
  ])('rejects a reply with %s as a contract violation', async (_name, overrides) => {
    handler = (_req, _body, res) => json(res, 200, ok(overrides));
    expect(await failure(analyze())).toMatchObject({ kind: 'contract_violation', retryable: false });
  });

  it('rejects a body that is not JSON', async () => {
    handler = (_req, _body, res) => res.writeHead(200, { 'Content-Type': 'text/html' }).end('<html>proxy</html>');
    expect(await failure(analyze())).toMatchObject({ kind: 'contract_violation' });
  });

  it('treats timed_out: true as a failed search, never as a move', async () => {
    handler = (_req, _body, res) => json(res, 200, ok({ timed_out: true }));
    expect(await failure(analyze())).toMatchObject({ kind: 'search_timed_out', retryable: false, mayStillRun: false });
  });

  it.each([
    [400, { detail: { success: false, error: 'Invalid FEN', detail: 'bad turn' } }, 'invalid_position', false],
    [422, { detail: [{ type: 'greater_than_equal', loc: ['body', 'limits', 'movetime'] }] }, 'invalid_request', false],
    [409, { success: false, error: 'Engine busy', detail: null }, 'busy', true],
    [503, { detail: { success: false, error: 'Engine unavailable' } }, 'unavailable', true],
    [502, '<html>Application failed to respond</html>', 'unavailable', true],
    [504, { detail: { success: false, error: 'Analysis timed out' } }, 'upstream_timeout', false],
    [500, { detail: 'Internal Server Error' }, 'contract_violation', false],
  ])('normalizes HTTP %i (documented and nested error bodies)', async (status, body, kind, retryable) => {
    handler = (_req, _body, res) =>
      typeof body === 'string' ? res.writeHead(status).end(body) : json(res, status, body);
    expect(await failure(analyze())).toMatchObject({ kind, retryable, status });
  });

  it('aborts at its deadline and reports that the remote search may still run', async () => {
    handler = (_req, _body, res) => setTimeout(() => json(res, 200, ok()), 400);
    expect(await failure(analyze(80))).toMatchObject({ kind: 'deadline_exceeded', mayStillRun: true, retryable: false });
  });

  it('distinguishes cancellation by the caller from its own deadline', async () => {
    handler = (_req, _body, res) => setTimeout(() => json(res, 200, ok()), 400);
    const controller = new AbortController();
    const pending = adapter.analyze({ fen: START, limit: { kind: 'movetime', ms: 200 } }, { timeoutMs: 2_000, signal: controller.signal });
    setTimeout(() => controller.abort(), 30);
    expect(await failure(pending)).toMatchObject({ kind: 'cancelled' });
  });

  it('reports a connection broken after sending as connection_lost (retryable, may still run)', async () => {
    handler = (req) => req.socket.destroy();
    expect(await failure(analyze())).toMatchObject({ kind: 'connection_lost', retryable: true, mayStillRun: true });
  });

  it('reports a refused connection as unavailable: nothing reached the service', async () => {
    const closed = new HttpEngineAdapter({ baseUrl: 'http://127.0.0.1:1', maxSockets: 1 });
    try {
      expect(await failure(closed.analyze({ fen: START, limit: { kind: 'movetime', ms: 50 } }, { timeoutMs: 2_000 }))).toMatchObject({
        kind: 'unavailable',
        mayStillRun: false,
      });
    } finally {
      closed.onModuleDestroy();
    }
  });

  it('validates the health contract', async () => {
    handler = (_req, _body, res) => json(res, 200, { status: 'ok', engine: 'lightweight-chess-engine', ready: true });
    expect(await adapter.health({ timeoutMs: 1_000 })).toMatchObject({ engine: 'lightweight-chess-engine', ready: true });
    handler = (_req, _body, res) => json(res, 200, { status: 'ok' });
    expect(await failure(adapter.health({ timeoutMs: 1_000 }))).toMatchObject({ kind: 'contract_violation' });
  });

  it('never sends limits outside the documented ranges or a FEN without six fields', () => {
    expect(() => toRequestBody({ fen: START, limit: { kind: 'movetime', ms: 9 } })).toThrow(EngineError);
    expect(() => toRequestBody({ fen: START, limit: { kind: 'movetime', ms: 30_001 } })).toThrow(EngineError);
    expect(() => toRequestBody({ fen: START, limit: { kind: 'depth', plies: 21 } })).toThrow(EngineError);
    expect(() => toRequestBody({ fen: START, limit: { kind: 'nodes', count: 0 } })).toThrow(EngineError);
    expect(() => toRequestBody({ fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w', limit: { kind: 'movetime', ms: 50 } })).toThrow(
      EngineError,
    );
    expect(toRequestBody({ fen: START, limit: { kind: 'depth', plies: 6 } })).toEqual({ fen: START, limits: { depth: 6 } });
  });
});
