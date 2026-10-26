import { randomUUID } from 'node:crypto';
import type { RealtimePublisher } from '../../realtime/realtime-publisher.service';
import type { ServerClock } from '../clocks/server-clock';
import { STANDARD_START_FEN } from '../rules/chess-rules';
import { GameCommandsService, type CommandResult } from './game-commands.service';
import { GameMetrics } from './game-metrics';
import type { GameRepository } from './game-repository';
import { reconstruct } from './game-state';
import { GameStore } from './game-store';
import { BLACK, FakeClock, MemoryRepository, START, WHITE } from '../../../../test/support/game-doubles';

describe('Game command pipeline', () => {
  let repository: MemoryRepository;
  let clock: FakeClock;
  let store: GameStore;
  let commands: GameCommandsService;
  let broadcasts: { channel: string; type: string; payloads: unknown[] }[];

  beforeEach(() => {
    repository = new MemoryRepository();
    clock = new FakeClock();
    broadcasts = [];
    const publisher = {
      toChannelViewers: async (channel: string, type: string, build: (userId: string) => unknown) => {
        broadcasts.push({ channel, type, payloads: [build(WHITE), build(BLACK)] });
      },
    } as unknown as RealtimePublisher;
    store = new GameStore(repository as unknown as GameRepository, clock as unknown as ServerClock);
    commands = new GameCommandsService(
      store,
      repository as unknown as GameRepository,
      publisher,
      clock as unknown as ServerClock,
      new GameMetrics(),
    );
  });
  afterEach(() => store.onModuleDestroy());

  const at = (ms: number) => ({ receivedAt: START + ms, receivedPerf: 0 });
  const move = (actor: string, gameId: string, uci: string, expectedRevision: number, requestId = randomUUID(), ms = 1_000) =>
    commands.move(
      actor,
      gameId,
      {
        requestId,
        expectedRevision,
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        ...(uci[4] ? { promotion: uci[4] as 'q' } : {}),
      },
      at(ms),
    );
  const ok = (result: CommandResult) => {
    if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
    return result.game;
  };

  it('accepts a legal move, charges the mover, adds the increment once and broadcasts after commit', async () => {
    const id = repository.seed();
    const game = ok(await move(WHITE, id, 'e2e4', 1, undefined, 5_000));
    expect(game).toMatchObject({ revision: 2, ply: 1, status: { phase: 'in-progress', turn: 'b' } });
    expect(game.move).toMatchObject({ san: 'e4', remainingMs: { w: 57_000, b: 60_000 }, elapsedMs: 5_000 });
    expect(game.clocks).toMatchObject({ runningSide: 'b' });
    expect(repository.games.get(id)!.moves).toHaveLength(1);
    expect(broadcasts).toHaveLength(1);
    const [forWhite, forBlack] = broadcasts[0].payloads as { legalMoves: object; move: { requestId: string | null } }[];
    expect(Object.keys(forWhite.legalMoves)).toHaveLength(0);
    expect(Object.keys(forBlack.legalMoves).length).toBeGreaterThan(0);
    expect(forBlack.move.requestId).toBeNull();
    expect(forWhite.move.requestId).not.toBeNull();
  });

  it('rejects out-of-turn, stale, illegal and unauthorized commands without changing anything', async () => {
    const id = repository.seed();
    const expectCode = async (result: Promise<CommandResult>, code: string) =>
      expect(await result).toMatchObject({ ok: false, error: { code } });
    await expectCode(move(BLACK, id, 'e7e5', 1), 'not_your_turn');
    await expectCode(move(WHITE, id, 'e2e5', 1), 'illegal_move');
    await expectCode(move(WHITE, id, 'e2e4', 7), 'stale_revision');
    await expectCode(move(randomUUID(), id, 'e2e4', 1), 'game_not_found');
    await expectCode(move(WHITE, randomUUID(), 'e2e4', 1), 'game_not_found');
    expect(repository.writes).toBe(0);
    expect(broadcasts).toHaveLength(0);
  });

  it('answers a retry from the ledger and refuses a request id reused for another command', async () => {
    const id = repository.seed();
    const requestId = randomUUID();
    ok(await move(WHITE, id, 'e2e4', 1, requestId));
    const retry = await move(WHITE, id, 'e2e4', 1, requestId);
    expect(retry).toMatchObject({ ok: true, duplicate: true, game: { revision: 2, ply: 1 } });
    expect(await move(WHITE, id, 'd2d4', 1, requestId)).toMatchObject({ ok: false, error: { code: 'request_id_reused' } });
    expect(repository.writes).toBe(1);
    expect(broadcasts).toHaveLength(1);
    // Also after the warm state is gone, e.g. after a restart.
    store.evict(id);
    expect(await move(WHITE, id, 'e2e4', 1, requestId)).toMatchObject({ ok: true, duplicate: true });
  });

  it('serializes competing moves: exactly one wins the revision', async () => {
    const id = repository.seed();
    const results = await Promise.all([move(WHITE, id, 'e2e4', 1), move(WHITE, id, 'd2d4', 1), move(WHITE, id, 'g1f3', 1)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok).map((r) => !r.ok && r.error.code)).toEqual(['stale_revision', 'stale_revision']);
    expect(repository.games.get(id)!.moves).toHaveLength(1);
  });

  it('never publishes a move whose save failed, and the same request can be retried', async () => {
    const id = repository.seed();
    const requestId = randomUUID();
    repository.failNext = 'before';
    const failed = await move(WHITE, id, 'e2e4', 1, requestId);
    expect(failed).toMatchObject({ ok: false, error: { code: 'command_not_saved', retryable: true }, game: { revision: 1, ply: 0 } });
    expect(broadcasts).toHaveLength(0);
    expect(repository.games.get(id)!.moves).toHaveLength(0);
    const retried = ok(await move(WHITE, id, 'e2e4', 1, requestId));
    expect(retried).toMatchObject({ revision: 2, ply: 1 });
    expect(broadcasts).toHaveLength(1);
  });

  it('resolves a write whose reply was lost from the persisted ledger, never applying it twice', async () => {
    const id = repository.seed();
    const requestId = randomUUID();
    repository.failNext = 'after';
    expect(await move(WHITE, id, 'e2e4', 1, requestId)).toMatchObject({ ok: false, error: { retryable: true } });
    expect(broadcasts).toHaveLength(0);
    const retry = await move(WHITE, id, 'e2e4', 1, requestId);
    expect(retry).toMatchObject({ ok: true, duplicate: true, game: { revision: 2, ply: 1 } });
    expect(repository.games.get(id)!.moves).toHaveLength(1);
    // The next player continues from the committed position.
    ok(await move(BLACK, id, 'e7e5', 2));
  });

  it('decides move-versus-timeout by server receipt time', async () => {
    const id = repository.seed();
    // Received 1 ms before the deadline: accepted even though processed later.
    clock.value = START + 70_000;
    ok(await move(WHITE, id, 'e2e4', 1, undefined, 59_999));
    // Black's deadline: 59_999 + 60_000. A move received at the deadline loses on time.
    const late = await move(BLACK, id, 'e7e5', 2, undefined, 59_999 + 60_000);
    expect(late).toMatchObject({
      ok: false,
      error: { code: 'game_finished' },
      game: { status: { phase: 'finished', result: { outcome: 'white', reason: 'timeout' } } },
    });
    expect(late.game?.clocks.remainingMs.b).toBe(0);
    const stored = repository.games.get(id)!.state;
    expect(stored).toMatchObject({ status: 'finished', outcome: { winner: 'w', termination: 'timeout' } });
    expect(stored.pgn).toContain('[Result "1-0"]');
  });

  it('finalizes a timeout from a late timer, and only reschedules an early one', async () => {
    const id = repository.seed();
    await commands.runtime(id);
    clock.value = START + 59_000;
    await commands.checkTimeout(id);
    expect(repository.games.get(id)!.state.status).toBe('active');
    clock.value = START + 75_000; // timer ran 15 s late
    await commands.checkTimeout(id);
    expect(repository.games.get(id)!.state).toMatchObject({ status: 'finished', endedAt: START + 75_000 });
    expect(broadcasts.at(-1)!.payloads[0]).toMatchObject({ status: { phase: 'finished', result: { reason: 'timeout' } } });
    // A command arriving afterwards cannot change the result.
    expect(await commands.resign(BLACK, id, { requestId: randomUUID() }, at(80_000))).toMatchObject({
      ok: false,
      error: { code: 'game_finished' },
    });
    expect(repository.writes).toBe(1);
  });

  it('draws on time when the player still on the clock has only a king', async () => {
    const id = repository.seed({ fen: '8/8/8/8/8/2k5/8/K1R5 b - - 0 1', initialFen: '8/8/8/8/8/2k5/8/K1R5 b - - 0 1' });
    await commands.runtime(id);
    clock.value = START + 61_000;
    await commands.checkTimeout(id);
    // Black ran out; White has a rook, so White wins.
    expect(repository.games.get(id)!.state.outcome).toEqual({ winner: 'w', termination: 'timeout' });
    // White runs out against a lone king: Black can never mate, so it is a draw.
    const drawn = repository.seed({ fen: '8/8/8/8/8/2k5/8/K1R5 w - - 0 1', initialFen: '8/8/8/8/8/2k5/8/K1R5 w - - 0 1' });
    await commands.runtime(drawn);
    await commands.checkTimeout(drawn);
    expect(repository.games.get(drawn)!.state.outcome).toEqual({ winner: null, termination: 'timeout-vs-insufficient-material' });
  });

  it('handles draw offers: decline with cooldown, implicit decline by moving, acceptance', async () => {
    const id = repository.seed();
    const offer = (actor: string) => commands.offerDraw(actor, id, { requestId: randomUUID() }, at(1_000));
    const respond = (actor: string, response: 'accept' | 'decline') =>
      commands.respondToDraw(actor, id, { requestId: randomUUID(), response }, at(1_000));

    expect(ok(await offer(WHITE))).toMatchObject({ drawOffer: { by: 'w', state: 'pending' }, viewer: { canOfferDraw: false } });
    expect(ok(await offer(WHITE)).revision).toBe(2); // repeating changes nothing
    expect(await offer(BLACK)).toMatchObject({ ok: false, error: { code: 'draw_offer_pending' } });
    expect(await respond(WHITE, 'accept')).toMatchObject({ ok: false, error: { code: 'no_draw_offer' } });
    expect(ok(await respond(BLACK, 'decline'))).toMatchObject({ drawOffer: { by: 'w', state: 'declined' } });
    expect(await offer(WHITE)).toMatchObject({ ok: false, error: { code: 'draw_offer_cooldown' } });

    ok(await move(WHITE, id, 'e2e4', 3));
    ok(await offer(WHITE)); // allowed again after moving
    // Black moves instead of answering: that declines it.
    const reply = ok(await move(BLACK, id, 'e7e5', 5));
    expect(reply.drawOffer).toEqual({ by: 'w', state: 'declined' });

    ok(await offer(BLACK));
    const accepted = ok(await respond(WHITE, 'accept'));
    expect(accepted.status).toEqual({ phase: 'finished', result: { outcome: 'draw', reason: 'agreement' } });
    expect(accepted.drawOffer).toBeNull();
  });

  it('finalizes once: resignation ends the game and later commands are refused', async () => {
    const id = repository.seed();
    const [resign, competing] = await Promise.all([
      commands.resign(BLACK, id, { requestId: randomUUID() }, at(3_000)),
      move(WHITE, id, 'e2e4', 1, undefined, 3_001),
    ]);
    expect(ok(resign).status).toEqual({ phase: 'finished', result: { outcome: 'white', reason: 'resignation' } });
    // White's clock ran 3 s, charged at the resignation.
    expect(ok(resign).clocks.remainingMs).toEqual({ w: 57_000, b: 60_000 });
    expect(competing).toMatchObject({ ok: false, error: { code: 'game_finished' } });
    expect(repository.writes).toBe(1);
  });

  it('ends the game on checkmate and threefold repetition with a final PGN', async () => {
    const mate = repository.seed();
    let revision = 1;
    for (const [actor, uci] of [[WHITE, 'f2f3'], [BLACK, 'e7e5'], [WHITE, 'g2g4'], [BLACK, 'd8h4']] as const) {
      const game = ok(await move(actor, mate, uci, revision));
      revision = game.revision;
    }
    expect(repository.games.get(mate)!.state).toMatchObject({ status: 'finished', outcome: { winner: 'b', termination: 'checkmate' } });

    const repeat = repository.seed();
    revision = 1;
    const shuffle = [[WHITE, 'g1f3'], [BLACK, 'g8f6'], [WHITE, 'f3g1'], [BLACK, 'f6g8']] as const;
    let last;
    for (const [actor, uci] of [...shuffle, ...shuffle]) {
      last = ok(await move(actor, repeat, uci, revision));
      revision = last.revision;
    }
    // The start position occurred for the third time after the eighth half-move.
    expect(last!.status).toEqual({ phase: 'finished', result: { outcome: 'draw', reason: 'threefold-repetition' } });
  });

  it('reconstructs the same state from history and rejects tampered history', async () => {
    const id = repository.seed();
    let revision = 1;
    for (const [actor, uci] of [[WHITE, 'e2e4'], [BLACK, 'd7d5'], [WHITE, 'e4d5'], [BLACK, 'd8d5']] as const)
      revision = ok(await move(actor, id, uci, revision)).revision;
    const warm = store.peek(id)!;
    const loaded = (await repository.load(id))!;
    const rebuilt = reconstruct(loaded.state, loaded.moves, loaded.commands, START);
    expect(rebuilt.state.fen).toBe(warm.state.fen);
    expect([...rebuilt.repetitions]).toEqual([...warm.repetitions]);
    loaded.moves[2].fenAfter = STANDARD_START_FEN;
    expect(() => reconstruct(loaded.state, loaded.moves, loaded.commands, START)).toThrow(/position mismatch at ply 3/);
  });
});
