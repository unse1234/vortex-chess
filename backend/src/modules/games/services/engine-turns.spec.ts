import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  configStub,
  firstLegalMove,
  heldReply,
  reply,
  ScriptedEngine,
  waitUntil,
} from '../../../../test/support/engine-doubles';
import { BLACK, FakeClock, MemoryRepository, START, WHITE } from '../../../../test/support/game-doubles';
import { EngineError } from '../../engines/engine-errors';
import { EngineMetrics } from '../../engines/engine-metrics';
import { EnginesService } from '../../engines/engines.service';
import type { RealtimePublisher } from '../../realtime/realtime-publisher.service';
import type { ServerClock } from '../clocks/server-clock';
import { STANDARD_START_FEN } from '../rules/chess-rules';
import { EngineTurnService } from './engine-turns.service';
import { GameCommandsService } from './game-commands.service';
import { GameMetrics } from './game-metrics';
import type { GameRepository } from './game-repository';
import { engineTurnRequestId } from './game-state';
import { GameStore } from './game-store';

type Event = { channel: string; type: string; payload: unknown };

describe('Engine turns: server-owned engine moves through the shared pipeline', () => {
  let repository: MemoryRepository;
  let clock: FakeClock;
  let engine: ScriptedEngine;
  let events: Event[];
  /** Simulated socket-lookup latency per publish. */
  let publishDelay: () => number;
  let instances: { store: GameStore; commands: GameCommandsService; turns: EngineTurnService }[];

  /** One server instance over the shared repository; a second call simulates a restart. */
  function instance(config: Parameters<typeof configStub>[0] = {}) {
    const publisher = {
      toChannelViewers: async (channel: string, type: string, build: (userId: string) => unknown) => {
        const delay = publishDelay();
        if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
        events.push({ channel, type, payload: build(WHITE) ?? build(BLACK) });
      },
    } as unknown as RealtimePublisher;
    const store = new GameStore(repository as unknown as GameRepository, clock as unknown as ServerClock);
    const commands = new GameCommandsService(
      store,
      repository as unknown as GameRepository,
      publisher,
      clock as unknown as ServerClock,
      new GameMetrics(),
    );
    const engines = new EnginesService(engine, configStub(config), new EngineMetrics());
    const turns = new EngineTurnService(
      commands,
      repository as unknown as GameRepository,
      engines,
      clock as unknown as ServerClock,
      publisher,
      configStub(config),
    );
    turns.onModuleInit();
    const created = { store, commands, turns };
    instances.push(created);
    return created;
  }

  beforeEach(() => {
    repository = new MemoryRepository();
    clock = new FakeClock();
    engine = new ScriptedEngine();
    events = [];
    publishDelay = () => 0;
    instances = [];
  });
  afterEach(() => {
    for (const { store, turns } of instances) {
      turns.onModuleDestroy();
      store.onModuleDestroy();
    }
  });

  const stored = (id: string) => repository.games.get(id)!;
  const settled = (turns: EngineTurnService, id: string) => waitUntil(() => turns.view(id) === null);
  const humanMove = (commands: GameCommandsService, actor: string, id: string, uci: string, ms: number) => {
    clock.value = START + ms;
    return commands.move(
      actor,
      id,
      {
        requestId: randomUUID(),
        expectedRevision: stored(id).state.revision,
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        ...(uci[4] ? { promotion: uci[4] as 'q' } : {}),
      },
      { receivedAt: START + ms, receivedPerf: 0 },
    );
  };

  it('plays the opening move when the engine has White, as the engine and never as an account', async () => {
    const { turns } = instance();
    const id = repository.seedEngineGame('w');
    await turns.recover([id]);
    await waitUntil(() => stored(id).moves.length === 1);
    const [move] = stored(id).moves;
    expect(move).toMatchObject({
      ply: 1,
      color: 'w',
      actorId: null,
      uci: firstLegalMove(STANDARD_START_FEN),
      requestId: engineTurnRequestId(id, 1),
    });
    expect(engine.calls).toHaveLength(1);
    expect(engine.calls[0]).toMatchObject({ fen: STANDARD_START_FEN, movetime: 200 });
    expect(stored(id).state).toMatchObject({ revision: 2, ply: 1, status: 'active' });
    // Thinking is announced before the search; the move is broadcast only after its commit.
    const types = events.map((e) => e.type);
    expect(types.indexOf('game.engine')).toBeLessThan(types.indexOf('game.updated'));
    expect(events.find((e) => e.type === 'game.engine')!.payload).toMatchObject({ revision: 1, engineTurn: { phase: 'queued', color: 'w' } });
  });

  it('publishes engine phases in the order they happened, even when socket lookups finish out of order', async () => {
    const { turns } = instance();
    const delays = [40, 20, 0];
    publishDelay = () => delays.shift() ?? 0;
    const id = repository.seedEngineGame('w');
    const held = heldReply();
    engine.queue.push(held.reply);
    await turns.recover([id]);
    await waitUntil(() => events.filter((e) => e.type === 'game.engine').length === 3);
    const phases = events
      .filter((e) => e.type === 'game.engine')
      .map((e) => (e.payload as { engineTurn: { phase: string } | null }).engineTurn?.phase);
    expect(phases).toEqual(['queued', 'queued', 'thinking']);
    held.release(reply('e2e4'));
    await waitUntil(() => stored(id).moves.length === 1);
  });

  it('waits for the first accepted human move when the human has White, and applies only the best move', async () => {
    const { commands, turns } = instance();
    const id = repository.seedEngineGame('b');
    await turns.recover([id]);
    expect(engine.calls).toHaveLength(0);
    engine.queue.push(reply('e7e5', { ponder: 'g1f3', pv: ['e7e5', 'g1f3', 'b8c6'] }));
    expect(await humanMove(commands, WHITE, id, 'e2e4', 3_000)).toMatchObject({ ok: true });
    await waitUntil(() => stored(id).moves.length === 2);
    await settled(turns, id);
    expect(stored(id).moves.map((m) => m.uci)).toEqual(['e2e4', 'e7e5']);
    expect(stored(id).state.fen.split(' ')[1]).toBe('w');
    // The engine was charged from the human move's receipt, not from game start.
    expect(stored(id).moves[1].elapsedMs).toBe(0);
    expect(engine.calls[0].fen).toBe(stored(id).moves[0].fenAfter);
  });

  it('validates engine promotions with chess.js, suffix included', async () => {
    const { turns } = instance();
    const fen = 'k7/8/8/8/8/8/1p6/7K b - - 0 1';
    const id = repository.seedEngineGame('b', { initialFen: fen, fen });
    engine.queue.push(reply('b2b1q'));
    await turns.recover([id]);
    await waitUntil(() => stored(id).moves.length === 1);
    expect(stored(id).moves[0]).toMatchObject({ uci: 'b2b1q', san: 'b1=Q+', promotion: 'q' });

    const missingSuffix = repository.seedEngineGame('b', { initialFen: fen, fen });
    engine.queue.push(reply('b2b1'));
    await turns.recover([missingSuffix]);
    await waitUntil(() => stored(missingSuffix).state.status === 'finished');
    expect(stored(missingSuffix).moves).toHaveLength(0);
    expect(stored(missingSuffix).state.outcome).toEqual({ winner: null, termination: 'engine-failure' });
  });

  it('treats a null best move in a non-terminal position as an engine error, not a result', async () => {
    const { turns } = instance();
    const id = repository.seedEngineGame('w');
    engine.queue.push(reply(null, { depth: 0, nodes: 0 }));
    await turns.recover([id]);
    await waitUntil(() => stored(id).state.status === 'finished');
    expect(stored(id).state.outcome).toEqual({ winner: null, termination: 'engine-failure' });
    expect(stored(id).state.pgn).toContain('[Result "*"]');
    expect(stored(id).moves).toHaveLength(0);
  });

  it.each([
    ['a contract violation', new EngineError('contract_violation', 'bad body')],
    ['an illegal move', reply('e2e5')],
    ["a move of the human's piece", reply('e7e5')],
    ['a move that is not UCI', reply('castle')],
  ])('aborts after %s without changing the position or retrying', async (_name, response) => {
    const { turns } = instance();
    const id = repository.seedEngineGame('w');
    engine.queue.push(response);
    await turns.recover([id]);
    await waitUntil(() => stored(id).state.status === 'finished');
    expect(stored(id).moves).toHaveLength(0);
    expect(stored(id).state.fen).toBe(STANDARD_START_FEN);
    expect(stored(id).state.outcome?.termination).toBe('engine-failure');
    expect(engine.calls).toHaveLength(1);
  });

  it('retries a busy or unavailable service within the clock, then succeeds', async () => {
    const { turns } = instance();
    const id = repository.seedEngineGame('w');
    engine.queue.push(new EngineError('busy', '409'), new EngineError('unavailable', '503'));
    await turns.recover([id]);
    await waitUntil(() => stored(id).moves.length === 1);
    expect(engine.calls).toHaveLength(3);
    expect(events.some((e) => e.type === 'game.engine' && (e.payload as { engineTurn: { phase: string } | null }).engineTurn?.phase === 'retrying')).toBe(true);
  });

  it('aborts after the bounded attempts when the service stays down; no win is awarded', async () => {
    const { turns } = instance();
    const id = repository.seedEngineGame('w');
    engine.queue.push(...[1, 2, 3].map(() => new EngineError('unavailable', '503')));
    await turns.recover([id]);
    await waitUntil(() => stored(id).state.status === 'finished');
    expect(engine.calls).toHaveLength(3);
    expect(stored(id).state.outcome).toEqual({ winner: null, termination: 'engine-failure' });
    // Clocks are frozen at the abort, not reset.
    expect(stored(id).state.clock.remainingMs).toEqual({ w: 60_000, b: 60_000 });
  });

  it.each([
    ['our own deadline', new EngineError('deadline_exceeded', 'late')],
    ['the service timeout', new EngineError('upstream_timeout', '504')],
    ['timed_out: true', new EngineError('search_timed_out', 'safety timeout')],
  ])('does not retry %s while the original search may still occupy the service', async (_name, error) => {
    const { turns } = instance();
    const id = repository.seedEngineGame('w');
    engine.queue.push(error);
    await turns.recover([id]);
    await waitUntil(() => stored(id).state.status === 'finished');
    expect(engine.calls).toHaveLength(1);
    expect(stored(id).state.outcome?.termination).toBe('engine-failure');
  });

  it('shortens the search to the clock and leaves an unaffordable search to timeout adjudication', async () => {
    const { commands, turns } = instance();
    const short = repository.seedEngineGame('w', { clock: { remainingMs: { w: 1_750, b: 60_000 }, turnStartedAt: START } });
    await turns.recover([short]);
    await waitUntil(() => stored(short).moves.length === 1);
    expect(engine.calls[0]).toMatchObject({ movetime: 100, timeoutMs: 1_600 });

    const id = repository.seedEngineGame('w', { clock: { remainingMs: { w: 1_000, b: 60_000 }, turnStartedAt: START } });
    await turns.recover([id]);
    await turns.recover([id]);
    expect(engine.calls).toHaveLength(1);
    expect(stored(id).state.status).toBe('active');
    clock.value = START + 1_000;
    await commands.checkTimeout(id);
    expect(stored(id).state.outcome).toEqual({ winner: 'b', termination: 'timeout' });
  });

  it('discards a reply that arrives after the human resigned', async () => {
    const { commands, turns } = instance();
    const id = repository.seedEngineGame('w');
    const held = heldReply();
    engine.queue.push(held.reply);
    await turns.recover([id]);
    await waitUntil(() => engine.calls.length === 1);
    // Resignation is not blocked by the pending search.
    const resigned = await commands.resign(BLACK, id, { requestId: randomUUID() }, { receivedAt: START + 500, receivedPerf: 0 });
    expect(resigned).toMatchObject({ ok: true, game: { status: { phase: 'finished' } } });
    held.release(reply('e2e4'));
    await settled(turns, id);
    expect(stored(id).moves).toHaveLength(0);
    expect(stored(id).state.outcome).toEqual({ winner: 'w', termination: 'resignation' });
  });

  it('lets the official clock flag the engine during a pending search, then discards the reply', async () => {
    const { commands, turns } = instance();
    const id = repository.seedEngineGame('w');
    const held = heldReply();
    engine.queue.push(held.reply);
    await turns.recover([id]);
    await waitUntil(() => engine.calls.length === 1);
    clock.value = START + 60_000;
    await commands.checkTimeout(id);
    expect(stored(id).state.outcome).toEqual({ winner: 'b', termination: 'timeout' });
    held.release(reply('e2e4'));
    await settled(turns, id);
    expect(stored(id).moves).toHaveLength(0);
  });

  it('discards a reply for an older revision even though it is legal now, then searches the new one', async () => {
    const { store, turns } = instance();
    const id = repository.seedEngineGame('w');
    const held = heldReply();
    engine.queue.push(held.reply);
    await turns.recover([id]);
    await waitUntil(() => engine.calls.length === 1);
    repository.bumpRevision(id);
    store.evict(id);
    held.release(reply('e2e4'));
    await settled(turns, id);
    expect(stored(id).moves).toHaveLength(0);
    await turns.recover();
    await waitUntil(() => stored(id).moves.length === 1);
    expect(stored(id).moves[0]).toMatchObject({ uci: firstLegalMove(STANDARD_START_FEN), requestId: engineTurnRequestId(id, 2) });
  });

  it('runs one search per turn however often it is scheduled', async () => {
    const { store, turns } = instance();
    const id = repository.seedEngineGame('w');
    const held = heldReply();
    engine.queue.push(held.reply);
    await Promise.all([turns.recover([id]), turns.recover([id]), turns.recover()]);
    const runtime = await store.get(id);
    for (let i = 0; i < 5; i += 1) turns.consider(runtime!.state);
    await turns.recover();
    expect(engine.calls).toHaveLength(1);
    held.release(reply('g1f3'));
    await waitUntil(() => stored(id).moves.length === 1);
    await settled(turns, id);
    await turns.recover();
    expect(engine.calls).toHaveLength(1);
    expect(stored(id).moves).toHaveLength(1);
  });

  it('keeps concurrent games apart when replies return out of order', async () => {
    const { turns } = instance({ ENGINE_MAX_CONCURRENT_SEARCHES: 2 });
    const other = '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1';
    const a = repository.seedEngineGame('w');
    const b = repository.seedEngineGame('w', { initialFen: other, fen: other });
    const slowFirst = (delay: number) => async (call: { fen: string }) => {
      await new Promise((resolve) => setTimeout(resolve, delay));
      return reply(firstLegalMove(call.fen));
    };
    engine.queue.push(slowFirst(60), slowFirst(0));
    await turns.recover([a, b]);
    await waitUntil(() => stored(a).moves.length === 1 && stored(b).moves.length === 1);
    expect(stored(a).moves[0].uci).toBe(firstLegalMove(STANDARD_START_FEN));
    expect(stored(b).moves[0].uci).toBe(firstLegalMove(other));
  });

  it('retries a failed save of the engine move without applying it twice', async () => {
    const { turns } = instance();
    const id = repository.seedEngineGame('w');
    repository.failNext = 'before';
    await turns.recover([id]);
    await waitUntil(() => stored(id).moves.length === 1);
    await settled(turns, id);

    const lost = repository.seedEngineGame('w');
    repository.failNext = 'after';
    events.length = 0;
    await turns.recover([lost]);
    await waitUntil(() => events.some((e) => e.type === 'game.updated'));
    await settled(turns, lost);
    expect(stored(lost).moves).toHaveLength(1);
    expect(repository.writes).toBe(2);
    // The committed move whose reply was lost is still published.
    expect(events.filter((e) => e.type === 'game.updated')).toHaveLength(1);
  });

  it('reports a failing repair pass readably and once, then its recovery', async () => {
    const { turns } = instance();
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const original = repository.activeEngineGameIds.bind(repository);
    // Prisma's messages start with a blank line.
    const failure = Object.assign(
      new Error('\nInvalid `prisma.game.findMany()` invocation:\n\nThe column `Game.mode` does not exist'),
      { code: 'P2022' },
    );
    repository.activeEngineGameIds = async () => {
      throw failure;
    };
    try {
      await turns.recover();
      await turns.recover();
      await turns.recover();
      const repairWarnings = warn.mock.calls.map(([m]) => String(m)).filter((m) => m.startsWith('Engine turn repair failed'));
      expect(repairWarnings).toEqual(['Engine turn repair failed: P2022: Invalid `prisma.game.findMany()` invocation:']);
      repository.activeEngineGameIds = original;
      await turns.recover();
      expect(log.mock.calls.map(([m]) => m)).toContain('Engine turn repair recovered');
    } finally {
      warn.mockRestore();
      log.mockRestore();
    }
  });

  it('after a restart, schedules the pending turn once; the old instance’s late reply changes nothing', async () => {
    const before = instance();
    const id = repository.seedEngineGame('w');
    const held = heldReply();
    engine.queue.push(held.reply);
    await before.turns.recover([id]);
    await waitUntil(() => engine.calls.length === 1);
    // Restart: a new instance resumes clocks (another revision) and recovers turns.
    repository.bumpRevision(id);
    const after = instance();
    await after.turns.recover();
    await waitUntil(() => stored(id).moves.length === 1);
    held.release(reply('e2e4'));
    await settled(before.turns, id);
    expect(stored(id).moves).toHaveLength(1);
    expect(stored(id).moves[0].requestId).toBe(engineTurnRequestId(id, 2));
  });
});
