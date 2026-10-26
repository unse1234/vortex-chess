import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Chess } from 'chess.js';
import { randomBytes, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import type { PrismaService as PrismaServiceType } from '../src/database/prisma.service';
import type { GameCommandsService as CommandsType } from '../src/modules/games/services/game-commands.service';
import { analyzeError, analyzeOk, EngineServiceDouble } from './support/engine-service-double';

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const origin = 'http://localhost:3000';
const password = 'correct-password-123';
const blitz = { initialMs: 180_000, incrementMs: 2_000 };
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
/** Server-wide active engine games; every test removes its own games afterwards. */
const ADMISSION_LIMIT = 4;

type Account = { id: string; username: string; token: string };
type Envelope = { channel: string; type: string; payload: any };
type Ack = { ok: boolean; duplicate?: boolean; error?: { code: string; retryable: boolean }; game: any };

async function waitFor<T>(check: () => T | Promise<T>, timeout = 5000) {
  const started = Date.now();
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() - started > timeout) throw new Error('Timed out waiting');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Server time under the test's control. */
class FakeClock {
  value = Date.now();
  now() {
    return this.value;
  }
  advance(ms: number) {
    this.value += ms;
  }
}

suite('Engine games: HTTP engine adapter, server-owned turns, clocks and recovery (PostgreSQL)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaServiceType;
  let commands: CommandsType;
  let baseUrl: string;
  let clock: FakeClock;
  let engine: EngineServiceDouble;
  const createdIds = new Set<string>();
  const sockets: Socket[] = [];
  const server = () => app.getHttpServer();

  async function startApp() {
    Object.assign(process.env, {
      NODE_ENV: 'test',
      DATABASE_URL: databaseUrl,
      JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET ?? randomBytes(48).toString('hex'),
      CORS_ORIGINS: origin,
      COOKIE_SECURE: 'false',
      COOKIE_SAME_SITE: 'lax',
      EXPIRY_SWEEP_INTERVAL_SECONDS: '0',
      MAIL_WORKER_INTERVAL_SECONDS: '0',
      ENGINE_BASE_URL: engine.url,
      ENGINE_SEARCH_MOVETIME_MS: '200',
      ENGINE_TRANSPORT_RESERVE_MS: '1500',
      ENGINE_COMMIT_RESERVE_MS: '150',
      ENGINE_REQUEST_TIMEOUT_MS: '4000',
      ENGINE_MAX_CONCURRENT_SEARCHES: '2',
      ENGINE_MAX_ACTIVE_GAMES: String(ADMISSION_LIMIT),
      ENGINE_RETRY_BASE_MS: '20',
      ENGINE_ABORT_QUARANTINE_MS: '0',
      ENGINE_RECOVERY_INTERVAL_SECONDS: '0',
    });
    const { AppModule } = require('../dist/app.module') as typeof import('../src/app.module');
    const { PrismaService } = require('../dist/database/prisma.service') as typeof import('../src/database/prisma.service');
    const { configureApp } = require('../dist/configure-app') as typeof import('../src/configure-app');
    const { ServerClock } = require('../dist/modules/games/clocks/server-clock') as typeof import('../src/modules/games/clocks/server-clock');
    const { GameCommandsService } = require('../dist/modules/games/services/game-commands.service') as typeof import('../src/modules/games/services/game-commands.service');
    const fixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ServerClock)
      .useValue(clock)
      .compile();
    app = fixture.createNestApplication<NestExpressApplication>({ bodyParser: false });
    configureApp(app);
    await app.listen(0, '127.0.0.1');
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
    prisma = app.get(PrismaService);
    commands = app.get(GameCommandsService);
  }

  async function account(): Promise<Account> {
    const id = randomUUID().slice(0, 8);
    const response = await request(server())
      .post('/api/auth/sign-up')
      .set('Origin', origin)
      .set('X-Vortix-CSRF', '1')
      .send({ username: `Eg_${id}`, email: `${id}@vortix-engine.invalid`, password, confirmPassword: password, acceptTerms: true })
      .expect(201);
    createdIds.add(response.body.user.id);
    return { id: response.body.user.id, username: `Eg_${id}`, token: response.body.accessToken };
  }
  const as = (user: Account) => ({
    get: (path: string) => request(server()).get(`/api${path}`).set('Authorization', `Bearer ${user.token}`),
    post: (path: string, body: object = {}) =>
      request(server()).post(`/api${path}`).set('Authorization', `Bearer ${user.token}`).send(body),
  });

  function connect(user: Account) {
    const socket = io(baseUrl, {
      path: '/api/socket.io',
      auth: { token: user.token },
      transports: ['websocket'],
      extraHeaders: { Origin: origin },
      forceNew: true,
      reconnection: false,
    });
    sockets.push(socket);
    const events: Envelope[] = [];
    socket.on('event', (event: Envelope) => events.push(event));
    return {
      socket,
      events,
      ready: new Promise<void>((resolve, reject) => {
        socket.once('connect', () => resolve());
        socket.once('connect_error', reject);
      }),
      next: (type: string, filter: (e: Envelope) => boolean = () => true) =>
        waitFor(() => events.find((e) => e.type === type && filter(e))),
      send: (event: string, payload: object) => socket.timeout(4000).emitWithAck(event, payload) as Promise<Ack>,
      join: (channel: string) => socket.timeout(4000).emitWithAck('channel.join', { channel }),
    };
  }

  /** Game states a client has seen: its join snapshot, then every compact update. */
  const states = (client: ReturnType<typeof connect>) =>
    client.events
      .filter((e) => e.type === 'game.snapshot' || e.type === 'game.updated')
      .map((e) => (e.type === 'game.snapshot' ? e.payload.game : e.payload));
  /** Waits until the client has seen a state matching `check`, whether before or after it joined. */
  const reached = (client: ReturnType<typeof connect>, check: (state: any) => boolean) =>
    waitFor(() => states(client).find(check));

  async function player(user: Account, gameId: string) {
    const client = connect(user);
    await client.ready;
    await client.join(`game:${gameId}`);
    await client.next('game.snapshot');
    return client;
  }

  async function engineGame(user: Account, colorPreference: 'white' | 'black', timeControl = blitz) {
    const response = await as(user).post('/engine-games', { timeControl, colorPreference }).expect(201);
    return response.body.game;
  }

  const move = (gameId: string, uci: string, expectedRevision: number, requestId = randomUUID()) => ({
    gameId,
    requestId,
    expectedRevision,
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    ...(uci[4] ? { promotion: uci[4] } : {}),
  });

  /** Replies with scripted moves in order; each is checked against the requested position first. */
  function scriptMoves(...ucis: string[]) {
    for (const uci of ucis)
      engine.script.push((body) => {
        const legal = new Chess(body.fen).moves({ verbose: true }).some((m) => m.lan === uci);
        if (!legal) throw new Error(`scripted ${uci} is not legal in ${body.fen}`);
        return analyzeOk(uci);
      });
  }

  const gameRow = (id: string) => prisma.game.findUniqueOrThrow({ where: { id } });
  const movesOf = (id: string) => prisma.gameMove.findMany({ where: { gameId: id }, orderBy: { ply: 'asc' } });

  // Configuration is validated once per process (when the compiled module is
  // first loaded), so one double serves the whole file and is reset per test.
  beforeAll(async () => {
    engine = new EngineServiceDouble();
    await engine.start();
  });
  afterAll(() => engine.stop());

  beforeEach(async () => {
    clock = new FakeClock();
    engine.reset();
    await startApp();
  });

  afterEach(async () => {
    for (const socket of sockets.splice(0)) socket.disconnect();
    if (prisma) {
      const ids = [...createdIds];
      await prisma.game.deleteMany({ where: { participants: { some: { userId: { in: ids } } } } });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }
    createdIds.clear();
    await app?.close();
  });

  it('reports engine availability to signed-in players only, from the service health', async () => {
    const user = await account();
    await request(server()).get('/api/engine-games/status').expect(401);
    expect((await as(user).get('/engine-games/status').expect(200)).body).toEqual({
      available: true,
      configured: true,
      engine: 'double-engine',
    });
  });

  it('engine as White: persists one player and one engine seat, then plays the opening move after commit', async () => {
    const user = await account();
    const game = await engineGame(user, 'black');
    expect(game).toMatchObject({
      mode: 'engine',
      viewer: { color: 'b', canMove: false, canOfferDraw: false },
      players: { w: { kind: 'engine', username: 'double-engine', id: 'engine' }, b: { kind: 'human', id: user.id } },
    });
    const client = await player(user, game.id);
    const state = await reached(client, (g) => g.ply === 1);
    expect(state).toMatchObject({ revision: 2, ply: 1, viewer: { canMove: true }, status: { phase: 'in-progress', turn: 'b' } });
    expect(Object.keys(state.legalMoves).length).toBeGreaterThan(0);
    const engineMove = 'moves' in state ? state.moves[0] : state.move;
    expect(engineMove).toMatchObject({ color: 'w', requestId: null });

    const seats = await prisma.gameParticipant.findMany({ where: { gameId: game.id }, orderBy: { color: 'asc' } });
    expect(seats.map((s) => [s.color, s.kind, s.userId, s.engineName])).toEqual([
      ['WHITE', 'ENGINE', null, 'double-engine'],
      ['BLACK', 'PLAYER', user.id, null],
    ]);
    expect(await prisma.user.count({ where: { username: 'double-engine' } })).toBe(0);
    const [first] = await movesOf(game.id);
    expect(first).toMatchObject({ ply: 1, color: 'WHITE', actorId: null });
    // Exactly one documented limit: the clock-aware movetime.
    expect(engine.analyzeRequests.map((r) => r.body)).toEqual([{ fen: START_FEN, limits: { movetime: 200 } }]);
    // Readiness was checked before the clock started.
    expect(engine.requests[0].path).toBe('/health');
  });

  it('player as White: no search until the first accepted move; the engine reply arrives over realtime', async () => {
    const user = await account();
    const game = await engineGame(user, 'white');
    const client = await player(user, game.id);
    await pause(150);
    expect(engine.analyzeRequests).toHaveLength(0);
    scriptMoves('e7e5');
    clock.advance(4_000);
    expect(await client.send('game.move', move(game.id, 'e2e4', 1))).toMatchObject({ ok: true, game: { revision: 2 } });
    const thinking = await client.next('game.engine', (e) => e.payload.revision === 2 && e.payload.engineTurn?.phase === 'thinking');
    expect(thinking.payload.engineTurn).toMatchObject({ color: 'b' });
    const reply = await client.next('game.updated', (e) => e.payload.revision === 3);
    expect(reply.payload.move).toMatchObject({ san: 'e5', color: 'b' });
    expect(engine.analyzeRequests[0].body!.fen).toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
  });

  it('plays a complete timed game to checkmate through the shared pipeline, with history and replay', async () => {
    const user = await account();
    const game = await engineGame(user, 'white');
    const client = await player(user, game.id);
    // The double "thinks" 400 ms of server time per move.
    scriptMoves('e7e5', 'd8h4');
    const scripted = engine.script.splice(0);
    for (const handler of scripted)
      engine.script.push((body) => {
        clock.advance(400);
        return handler(body);
      });
    let revision = 1;
    for (const [uci, think] of [['f2f3', 3_000], ['g2g4', 5_000]] as const) {
      clock.advance(think);
      const ack = await client.send('game.move', move(game.id, uci, revision));
      expect(ack.ok).toBe(true);
      const reply = await client.next('game.updated', (e) => e.payload.revision === ack.game.revision + 1);
      revision = reply.payload.revision;
    }
    const final = client.events.find((e) => e.type === 'game.updated' && e.payload.revision === revision)!.payload;
    expect(final.status).toEqual({ phase: 'finished', result: { outcome: 'black', reason: 'checkmate' } });

    const row = await gameRow(game.id);
    expect(row).toMatchObject({ status: 'FINISHED', result: 'BLACK_WINS', termination: 'CHECKMATE', mode: 'ENGINE', ply: 4 });
    expect(row.pgn).toContain('[Black "double-engine"]');
    expect(row.pgn).toContain('2. g4 Qh4# 0-1');
    const moves = await movesOf(game.id);
    // Official clocks: the player is charged their thinking, the engine its 400 ms, increments once each.
    expect(moves.map((m) => [m.uci, m.elapsedMs, m.whiteRemainingMs, m.blackRemainingMs, m.actorId === null])).toEqual([
      ['f2f3', 3_000, 179_000, 180_000, false],
      ['e7e5', 400, 179_000, 181_600, true],
      ['g2g4', 5_000, 176_000, 181_600, false],
      ['d8h4', 400, 176_000, 183_200, true],
    ]);

    const history = (await as(user).get('/games?limit=5').expect(200)).body.items;
    expect(history[0]).toMatchObject({ id: game.id, mode: 'engine', result: 'loss', side: 'w', opponent: { kind: 'engine', username: 'double-engine' } });
    const snapshot = (await as(user).get(`/games/${game.id}`).expect(200)).body.game;
    expect(snapshot.moves.map((m: { san: string }) => m.san)).toEqual(['f3', 'e5', 'g4', 'Qh4#']);
    expect(snapshot).toMatchObject({ mode: 'engine', engineTurn: null, pgn: row.pgn });
    // Temporary manual analysis stays independent of the engine.
    const before = engine.requests.length;
    await as(user).post(`/games/${game.id}/analysis/preview`, { basePly: 2, path: ['d2d4'] }).expect(200);
    expect(engine.requests.length).toBe(before);
  });

  it('validates engine promotions with the suffix and refuses draw offers in engine games', async () => {
    const user = await account();
    // Queued first: with the engine as White, its opening search starts at creation.
    scriptMoves('e2e4', 'e4d5', 'd5c6', 'c6b7', 'b7a8q');
    const game = await engineGame(user, 'black');
    const client = await player(user, game.id);
    let revision = (await reached(client, (g) => g.ply === 1)).revision;
    for (const uci of ['d7d5', 'c7c6', 'g8f6', 'b8d7']) {
      const ack = await client.send('game.move', move(game.id, uci, revision));
      expect(ack.ok).toBe(true);
      revision = (await client.next('game.updated', (e) => e.payload.revision === ack.game.revision + 1)).payload.revision;
    }
    const moves = await movesOf(game.id);
    expect(moves.at(-1)).toMatchObject({ uci: 'b7a8q', san: 'bxa8=Q', actorId: null });
    expect(await client.send('game.draw.offer', { gameId: game.id, requestId: randomUUID() })).toMatchObject({
      ok: false,
      error: { code: 'draw_offers_unavailable' },
    });
    expect((await gameRow(game.id)).revision).toBe(revision);
  });

  it.each([
    ['503 three times', () => [analyzeError(503, 'Engine unavailable'), analyzeError(503, 'Engine unavailable'), analyzeError(503, 'Engine unavailable')], 3],
    ['400 invalid FEN', () => [analyzeError(400, 'Invalid FEN')], 1],
    ['422 validation', () => [{ status: 422, body: { detail: [{ type: 'greater_than_equal' }] } }], 1],
    ['504 analysis timeout', () => [analyzeError(504, 'Analysis timed out')], 1],
    ['timed_out: true', () => [analyzeOk('e2e4', { timed_out: true })], 1],
    ['a malformed body', () => [{ status: 200, body: { success: true, bestmove: 'e2-e4' } }], 1],
    ['a null move in the start position', () => [analyzeOk(null)], 1],
    ['an illegal move', () => [analyzeOk('e2e5')], 1],
  ])('aborts the game, without a winner, after %s', async (_name, responses, expectedRequests) => {
    const user = await account();
    for (const response of responses()) engine.script.push(() => response);
    const game = await engineGame(user, 'black');
    const client = await player(user, game.id);
    const ended = await reached(client, (g) => g.status.phase === 'finished');
    expect(ended.status).toEqual({ phase: 'finished', result: { outcome: 'aborted', reason: 'engine-failure' } });
    expect(await gameRow(game.id)).toMatchObject({ result: 'ABORTED', termination: 'ENGINE_FAILURE', ply: 0, whiteRemainingMs: 180_000 });
    expect(await prisma.gameMove.count({ where: { gameId: game.id } })).toBe(0);
    expect(engine.analyzeRequests).toHaveLength(expectedRequests);
    const history = (await as(user).get('/games?limit=5').expect(200)).body.items;
    expect(history[0]).toMatchObject({ id: game.id, result: 'aborted', mode: 'engine' });
  });

  it('retries a busy service and an unanswered connection within the clock, then plays on', async () => {
    const user = await account();
    engine.script.push(() => analyzeError(409, 'Engine busy'), () => 'drop');
    const game = await engineGame(user, 'black');
    const client = await player(user, game.id);
    await reached(client, (g) => g.ply === 1);
    expect(engine.analyzeRequests).toHaveLength(3);
    expect((await gameRow(game.id)).status).toBe('ACTIVE');
  });

  it('stays responsive during a pending search: resignation wins the race and the late reply is discarded', async () => {
    const user = await account();
    const held = engine.hold();
    const game = await engineGame(user, 'black');
    const client = await player(user, game.id);
    await waitFor(() => engine.analyzeRequests.length === 1);
    const started = Date.now();
    const ack = await client.send('game.resign', { gameId: game.id, requestId: randomUUID() });
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(ack).toMatchObject({ ok: true, game: { status: { phase: 'finished', result: { outcome: 'white', reason: 'resignation' } } } });
    held.release(analyzeOk('e2e4'));
    await pause(300);
    expect(await prisma.gameMove.count({ where: { gameId: game.id } })).toBe(0);
    expect(await gameRow(game.id)).toMatchObject({ termination: 'RESIGNATION', ply: 0 });
  });

  it('flags the engine by the official clock while a search is pending; the reply is stale', async () => {
    const user = await account();
    const held = engine.hold();
    const game = await engineGame(user, 'black', { initialMs: 60_000, incrementMs: 0 });
    const client = await player(user, game.id);
    await waitFor(() => engine.analyzeRequests.length === 1);
    clock.advance(60_000);
    await commands.checkTimeout(game.id);
    const ended = await client.next('game.updated', (e) => e.payload.status.phase === 'finished');
    expect(ended.payload.status.result).toEqual({ outcome: 'black', reason: 'timeout' });
    held.release(analyzeOk('e2e4'));
    await pause(300);
    expect(await gameRow(game.id)).toMatchObject({ termination: 'TIMEOUT', result: 'BLACK_WINS', ply: 0 });
  });

  it('keeps concurrent engine games apart when replies return out of order', async () => {
    const [a, b] = [await account(), await account()];
    const gameA = await engineGame(a, 'white');
    const gameB = await engineGame(b, 'white');
    const clientA = await player(a, gameA.id);
    const clientB = await player(b, gameB.id);
    // Black's legal replies are the same in both positions, so each reply is
    // chosen from the FEN it was asked about: a mix-up would show in the move.
    // The first request (game A) is answered last.
    const byPosition = (fen: string) => (fen.includes('4P3/8/PPPP1PPP') ? 'e7e5' : 'd7d5');
    engine.script.push(
      (body) => ({ ...analyzeOk(byPosition(body.fen)), delayMs: 300 }),
      (body) => analyzeOk(byPosition(body.fen)),
    );
    await clientA.send('game.move', move(gameA.id, 'e2e4', 1));
    await waitFor(() => engine.analyzeRequests.length === 1);
    await clientB.send('game.move', move(gameB.id, 'd2d4', 1));
    await clientB.next('game.updated', (e) => e.payload.revision === 3);
    await clientA.next('game.updated', (e) => e.payload.revision === 3);
    expect((await movesOf(gameA.id)).map((m) => m.uci)).toEqual(['e2e4', 'e7e5']);
    expect((await movesOf(gameB.id)).map((m) => m.uci)).toEqual(['d2d4', 'd7d5']);
    expect(engine.analyzeRequests.map((r) => r.body!.fen.split(' ')[0])).toEqual([
      'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR',
      'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR',
    ]);
  });

  it('never starts a search from refreshes, reconnects or extra tabs; all tabs get the move once', async () => {
    const user = await account();
    const held = engine.hold();
    const game = await engineGame(user, 'black');
    const tabs = [await player(user, game.id), await player(user, game.id)];
    await waitFor(() => engine.analyzeRequests.length === 1);
    for (let i = 0; i < 3; i += 1) {
      const snapshot = (await as(user).get(`/games/${game.id}`).expect(200)).body.game;
      expect(snapshot.engineTurn).toMatchObject({ revision: 1, color: 'w', phase: 'thinking' });
    }
    tabs[0].socket.disconnect();
    tabs[0] = await player(user, game.id);
    expect(tabs[0].events.find((e) => e.type === 'game.snapshot')!.payload.game.engineTurn).toMatchObject({ phase: 'thinking' });
    await pause(200);
    expect(engine.analyzeRequests).toHaveLength(1);
    held.release(analyzeOk('e2e4'));
    for (const tab of tabs) await tab.next('game.updated', (e) => e.payload.ply === 1);
    await pause(200);
    expect(engine.analyzeRequests).toHaveLength(1);
    expect(await prisma.gameMove.count({ where: { gameId: game.id } })).toBe(1);
  });

  it('recovers a pending engine turn after a restart and applies it exactly once', async () => {
    const user = await account();
    const held = engine.hold();
    const game = await engineGame(user, 'black');
    await waitFor(() => engine.analyzeRequests.length === 1);
    const before = (await gameRow(game.id)).revision;
    await app.close();
    held.release(analyzeOk('e2e4'));
    clock.advance(30_000);
    await startApp();
    await waitFor(async () => (await prisma.gameMove.count({ where: { gameId: game.id } })) === 1);
    const row = await gameRow(game.id);
    // Restart policy: downtime is not charged; the search restarted at the resumed revision.
    expect(row).toMatchObject({ ply: 1, status: 'ACTIVE', revision: before + 2, whiteRemainingMs: 182_000 });
    expect(engine.analyzeRequests).toHaveLength(2);
    const client = await player(user, game.id);
    expect(client.events.find((e) => e.type === 'game.snapshot')!.payload.game).toMatchObject({ ply: 1, viewer: { canMove: true } });
    await pause(200);
    expect(engine.analyzeRequests).toHaveLength(2);
  });

  it('checks readiness and admission before any clock starts', async () => {
    const [user, other] = [await account(), await account()];
    engine.health = { status: 200, body: { status: 'starting', engine: 'double-engine', ready: false } };
    expect((await as(user).post('/engine-games', { timeControl: blitz, colorPreference: 'white' }).expect(503)).body).toMatchObject({
      code: 'engine_unavailable',
      retryable: true,
    });
    engine.health = { status: 503, body: { detail: 'down' } };
    await as(user).post('/engine-games', { timeControl: blitz, colorPreference: 'white' }).expect(503);
    expect(await prisma.game.count({ where: { participants: { some: { userId: user.id } } } })).toBe(0);
    engine.health = { status: 200, body: { status: 'ok', engine: 'double-engine', ready: true } };
    await as(user).post('/engine-games', { timeControl: { initialMs: 1_000, incrementMs: 0 }, colorPreference: 'white' }).expect(400);
    const game = await engineGame(user, 'white');
    expect((await as(user).post('/engine-games', { timeControl: blitz, colorPreference: 'black' }).expect(409)).body).toMatchObject({
      code: 'engine_game_active',
      gameId: game.id,
    });
    // The server-wide admission limit, counted under a lock: one game is active, three seats remain.
    // (Sign-up allows five accounts per minute, which bounds the contenders.)
    expect(await prisma.game.count({ where: { mode: 'ENGINE', status: 'ACTIVE' } })).toBe(1);
    const contenders = [other, await account(), await account(), await account()];
    const results = await Promise.all(
      contenders.map((u) => as(u).post('/engine-games', { timeControl: blitz, colorPreference: 'white' })),
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 201, 201, 503]);
    expect(results.find((r) => r.status === 503)!.body).toMatchObject({ code: 'engine_capacity_reached', retryable: true });
    expect(await prisma.game.count({ where: { mode: 'ENGINE', status: 'ACTIVE' } })).toBe(ADMISSION_LIMIT);
  });
});
