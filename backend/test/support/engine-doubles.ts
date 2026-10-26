import { Chess } from 'chess.js';
import type { ConfigService } from '@nestjs/config';
import { EngineError } from '../../src/modules/engines/engine-errors';
import type {
  CallOptions,
  ChessEngineProvider,
  EngineHealth,
  SearchRequest,
  SearchResult,
} from '../../src/modules/engines/engine.types';

export type EngineCall = { fen: string; movetime: number | null; timeoutMs: number; at: number };
export type Reply = SearchResult | EngineError | ((call: EngineCall) => Promise<SearchResult> | SearchResult);

/** The first legal move in sorted UCI order: deterministic and engine-independent. */
export function firstLegalMove(fen: string) {
  const moves = new Chess(fen).moves({ verbose: true }).map((m) => m.lan);
  return moves.sort()[0] ?? null;
}

export function reply(bestMove: string | null, overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    bestMove,
    ponder: null,
    score: { type: 'cp', value: 0 },
    depth: 6,
    nodes: 10_000,
    nps: 500_000,
    engineTimeMs: 20,
    pv: bestMove ? [bestMove, 'a7a6'] : [],
    roundTripMs: 5,
    ...overrides,
  };
}

/**
 * Controlled stand-in for the engine service. Each analyze call takes the next
 * queued reply (a result, an error, or a function), or by default answers the
 * first legal move. Cancellation is honoured like the real adapter.
 */
export class ScriptedEngine implements ChessEngineProvider {
  calls: EngineCall[] = [];
  queue: Reply[] = [];
  ready = true;
  name = 'scripted-engine';

  async health(): Promise<EngineHealth> {
    return { status: 'ok', engine: this.name, ready: this.ready, roundTripMs: 1 };
  }

  async analyze(request: SearchRequest, options: CallOptions): Promise<SearchResult> {
    const call: EngineCall = {
      fen: request.fen,
      movetime: request.limit.kind === 'movetime' ? request.limit.ms : null,
      timeoutMs: options.timeoutMs,
      at: Date.now(),
    };
    this.calls.push(call);
    const next = this.queue.shift() ?? reply(firstLegalMove(request.fen));
    if (next instanceof EngineError) throw next;
    const result = typeof next === 'function' ? next(call) : next;
    if (!options.signal) return result;
    return Promise.race([
      Promise.resolve(result),
      new Promise<never>((_, reject) => {
        const abort = () => reject(new EngineError('cancelled', 'cancelled'));
        if (options.signal!.aborted) abort();
        options.signal!.addEventListener('abort', abort, { once: true });
      }),
    ]);
  }
}

/** A reply the test releases explicitly, to hold a search "in flight". */
export function heldReply() {
  let release!: (result: SearchResult) => void;
  const promise = new Promise<SearchResult>((resolve) => (release = resolve));
  return { reply: () => promise, release };
}

export const ENGINE_TEST_CONFIG = {
  ENGINE_SEARCH_MOVETIME_MS: 200,
  ENGINE_TRANSPORT_RESERVE_MS: 1_500,
  ENGINE_COMMIT_RESERVE_MS: 150,
  ENGINE_REQUEST_TIMEOUT_MS: 10_000,
  ENGINE_HEALTH_TIMEOUT_MS: 1_000,
  ENGINE_MAX_CONCURRENT_SEARCHES: 1,
  ENGINE_MAX_QUEUED_SEARCHES: 16,
  ENGINE_MAX_ACTIVE_GAMES: 4,
  ENGINE_MAX_ATTEMPTS: 3,
  ENGINE_RETRY_BASE_MS: 1,
  ENGINE_ABORT_QUARANTINE_MS: 0,
  ENGINE_RECOVERY_INTERVAL_SECONDS: 0,
};

export function configStub(overrides: Partial<typeof ENGINE_TEST_CONFIG> = {}) {
  const values: Record<string, unknown> = { ...ENGINE_TEST_CONFIG, ...overrides };
  return { get: (key: string) => values[key] } as unknown as ConfigService<never, true>;
}

export async function waitUntil<T>(check: () => T | Promise<T>, timeout = 3_000) {
  const started = Date.now();
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() - started > timeout) throw new Error('Timed out waiting');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
