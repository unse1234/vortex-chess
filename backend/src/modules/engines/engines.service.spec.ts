import { configStub, reply, ScriptedEngine } from '../../../test/support/engine-doubles';
import { EngineError } from './engine-errors';
import { EngineMetrics } from './engine-metrics';
import { EnginesService, type SearchProgress } from './engines.service';
import { SearchGate } from './search-gate';

const FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const budget = () => ({ searchMs: 200, timeoutMs: 5_000 });

describe('Search gate', () => {
  it('bounds concurrency, queues in order and hands slots over', async () => {
    const gate = new SearchGate({ concurrency: 1, queue: 2 });
    const first = await gate.acquire({ timeoutMs: 1_000 });
    const order: number[] = [];
    const second = gate.acquire({ timeoutMs: 1_000 }).then((p) => (order.push(2), p));
    const third = gate.acquire({ timeoutMs: 1_000 }).then((p) => (order.push(3), p));
    await expect(gate.acquire({ timeoutMs: 1_000 })).rejects.toMatchObject({ kind: 'capacity_exhausted' });
    expect(gate.stats).toEqual({ active: 1, queued: 2 });
    first.release();
    (await second).release();
    (await third).release();
    expect(order).toEqual([2, 3]);
    expect(gate.stats).toEqual({ active: 0, queued: 0 });
  });

  it('gives up waiting at the deadline or on cancellation without taking a slot', async () => {
    const gate = new SearchGate({ concurrency: 1, queue: 5 });
    const held = await gate.acquire({ timeoutMs: 1_000 });
    await expect(gate.acquire({ timeoutMs: 20 })).rejects.toMatchObject({ kind: 'capacity_exhausted' });
    const controller = new AbortController();
    const cancelled = gate.acquire({ timeoutMs: 1_000, signal: controller.signal });
    controller.abort();
    await expect(cancelled).rejects.toMatchObject({ kind: 'cancelled' });
    expect(gate.stats).toEqual({ active: 1, queued: 0 });
    held.release();
    expect(gate.stats.active).toBe(0);
  });

  it('keeps a quarantined slot reserved until the hold expires', async () => {
    const gate = new SearchGate({ concurrency: 1, queue: 5 });
    (await gate.acquire({ timeoutMs: 1_000 })).release(60);
    const started = Date.now();
    (await gate.acquire({ timeoutMs: 1_000 })).release();
    expect(Date.now() - started).toBeGreaterThanOrEqual(50);
  });
});

describe('Engines service: retry policy within the budget', () => {
  let engine: ScriptedEngine;
  let metrics: EngineMetrics;
  const service = (overrides = {}) => new EnginesService(engine, configStub(overrides), metrics);
  beforeEach(() => {
    engine = new ScriptedEngine();
    metrics = new EngineMetrics();
  });

  it('requests the clock-aware movetime and reports progress', async () => {
    const progress: SearchProgress[] = [];
    const outcome = await service().findMove({ fen: FEN, budget: () => ({ searchMs: 120, timeoutMs: 900 }), onProgress: (p) => progress.push(p) });
    expect(outcome).toMatchObject({ ok: true, attempts: 1 });
    expect(engine.calls[0]).toMatchObject({ movetime: 120, timeoutMs: 900 });
    expect(progress.map((p) => p.phase)).toEqual(['queued', 'thinking']);
  });

  it.each(['busy', 'unavailable', 'connection_lost'] as const)('retries %s and succeeds within the attempt limit', async (kind) => {
    engine.queue.push(new EngineError(kind, kind), reply('e2e4'));
    const progress: SearchProgress[] = [];
    const outcome = await service().findMove({ fen: FEN, budget, onProgress: (p) => progress.push(p) });
    expect(outcome).toMatchObject({ ok: true, attempts: 2, result: { bestMove: 'e2e4' } });
    expect(progress.find((p) => p.phase === 'retrying')).toMatchObject({ attempt: 2, lastError: kind });
  });

  it('stops after the configured attempts', async () => {
    engine.queue.push(...[1, 2, 3, 4].map(() => new EngineError('unavailable', 'down')));
    const outcome = await service().findMove({ fen: FEN, budget });
    expect(outcome).toMatchObject({ ok: false, attempts: 3, error: { kind: 'unavailable' } });
    expect(engine.calls).toHaveLength(3);
  });

  it.each(['deadline_exceeded', 'upstream_timeout', 'search_timed_out', 'invalid_position', 'invalid_request', 'contract_violation'] as const)(
    'does not retry %s',
    async (kind) => {
      engine.queue.push(new EngineError(kind, kind));
      const outcome = await service().findMove({ fen: FEN, budget });
      expect(outcome).toMatchObject({ ok: false, attempts: 1, error: { kind } });
      expect(engine.calls).toHaveLength(1);
    },
  );

  it('never sends a request when the budget has no room, and stops retrying once it runs out', async () => {
    expect(await service().findMove({ fen: FEN, budget: () => null })).toMatchObject({ ok: false, attempts: 0, error: { kind: 'no_time' } });
    expect(engine.calls).toHaveLength(0);
    let calls = 0;
    engine.queue.push(new EngineError('busy', 'busy'), new EngineError('busy', 'busy'));
    const outcome = await service().findMove({ fen: FEN, budget: () => (calls++ < 2 ? budget() : null) });
    expect(outcome).toMatchObject({ ok: false, attempts: 1, error: { kind: 'busy' } });
  });

  it('quarantines the slot after a request that may still be running', async () => {
    const svc = service({ ENGINE_ABORT_QUARANTINE_MS: 80, ENGINE_MAX_ATTEMPTS: 1 });
    engine.queue.push(new EngineError('deadline_exceeded', 'late'));
    await svc.findMove({ fen: FEN, budget: () => ({ searchMs: 10, timeoutMs: 5_000 }) });
    expect(svc.load.active).toBe(1);
    const started = Date.now();
    await svc.findMove({ fen: FEN, budget });
    expect(Date.now() - started).toBeGreaterThanOrEqual(70);
  });

  it('records round trip, engine time and unsearched replies separately', async () => {
    engine.queue.push(reply('a2a3', { depth: 0, nodes: 0, engineTimeMs: 0, roundTripMs: 812 }));
    await service().findMove({ fen: FEN, budget });
    expect(metrics.summary()).toMatchObject({ requests: 1, unsearched: 1, roundTrip: { p50: 812 }, engineTime: { p50: 0 } });
  });

  it('reports a missing configuration without calling anything', async () => {
    const svc = new EnginesService(null, configStub(), metrics);
    expect(await svc.findMove({ fen: FEN, budget })).toMatchObject({ ok: false, error: { kind: 'not_configured' } });
    await expect(svc.requireReady()).rejects.toMatchObject({ kind: 'not_configured' });
    expect(await svc.availability()).toEqual({ configured: false, ready: false, engine: null });
  });

  it('requires a ready engine before a game starts', async () => {
    engine.ready = false;
    await expect(service().requireReady()).rejects.toMatchObject({ kind: 'unavailable' });
    engine.ready = true;
    await expect(service().requireReady()).resolves.toEqual({ engine: 'scripted-engine' });
  });
});
