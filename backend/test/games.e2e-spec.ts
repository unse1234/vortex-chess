import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomBytes, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import type { PrismaService as PrismaServiceType } from '../src/database/prisma.service';
import type { GameCommandsService as CommandsType } from '../src/modules/games/services/game-commands.service';

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const origin = 'http://localhost:3000';
const password = 'correct-password-123';
const blitz = { initialMs: 180_000, incrementMs: 2_000 };

type Account = { id: string; username: string; token: string };
type Envelope = { channel: string; type: string; payload: any };
type Ack = { ok: boolean; duplicate?: boolean; error?: { code: string; retryable: boolean }; game: any };

async function waitFor<T>(check: () => T | Promise<T>, timeout = 4000) {
  const started = Date.now();
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() - started > timeout) throw new Error('Timed out waiting');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

/** Server time under the test's control; timers are driven explicitly. */
class FakeClock {
  value = Date.now();
  now() {
    return this.value;
  }
  advance(ms: number) {
    this.value += ms;
  }
}

suite('Gameplay: room start, authoritative moves, clocks and recovery (PostgreSQL)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaServiceType;
  let commands: CommandsType;
  let baseUrl: string;
  let clock: FakeClock;
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
      .send({
        username: `Gm_${id}`,
        email: `${id}@vortix-games.invalid`,
        password,
        confirmPassword: password,
        acceptTerms: true,
      })
      .expect(201);
    createdIds.add(response.body.user.id);
    return { id: response.body.user.id, username: `Gm_${id}`, token: response.body.accessToken };
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
    const client = {
      socket,
      events,
      ready: new Promise<void>((resolve, reject) => {
        socket.once('connect', () => resolve());
        socket.once('connect_error', reject);
      }),
      next: (type: string, filter: (e: Envelope) => boolean = () => true) =>
        waitFor(() => events.find((e) => e.type === type && filter(e))),
      send: (event: string, payload: object) =>
        socket.timeout(4000).emitWithAck(event, payload) as Promise<Ack>,
      join: (channel: string) => socket.timeout(4000).emitWithAck('channel.join', { channel }),
    };
    return client;
  }

  /** Room with both players seated and ready, as the waiting room leaves it. */
  async function readyRoom(host: Account, guest: Account, colorPreference = 'white') {
    const room = (await as(host).post('/rooms', { timeControl: blitz, colorPreference }).expect(201)).body.room;
    const invitation = (await as(host).post(`/rooms/${room.id}/invitations`, { recipient: guest.username }).expect(201)).body
      .invitation;
    await as(guest).post(`/invitations/${invitation.id}/accept`).expect(200);
    let revision = (await as(host).get(`/rooms/${room.id}`).expect(200)).body.room.revision;
    revision = (await as(host).post(`/rooms/${room.id}/ready`, { expectedRevision: revision, ready: true }).expect(200)).body.room
      .revision;
    const ready = (await as(guest).post(`/rooms/${room.id}/ready`, { expectedRevision: revision, ready: true }).expect(200)).body
      .room;
    expect(ready.status).toBe('ready');
    return ready;
  }

  async function startedGame(colorPreference = 'white') {
    const [host, guest] = [await account(), await account()];
    const room = await readyRoom(host, guest, colorPreference);
    const started = (await as(host).post(`/rooms/${room.id}/start`, { expectedRevision: room.revision }).expect(200)).body.room;
    const [white, black] = colorPreference === 'white' ? [host, guest] : [guest, host];
    return { host, guest, white, black, room: started, gameId: started.gameId as string };
  }

  /** Both players connected and subscribed to the game channel. */
  async function seated(gameId: string, white: Account, black: Account) {
    const w = connect(white);
    const b = connect(black);
    await Promise.all([w.ready, b.ready]);
    expect(await w.join(`game:${gameId}`)).toEqual({ ok: true });
    expect(await b.join(`game:${gameId}`)).toEqual({ ok: true });
    await w.next('game.snapshot');
    await b.next('game.snapshot');
    return { w, b };
  }

  const moveCommand = (gameId: string, uci: string, expectedRevision: number, requestId: string = randomUUID()) => ({
    gameId,
    requestId,
    expectedRevision,
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    ...(uci[4] ? { promotion: uci[4] } : {}),
  });

  /** Plays a sequence through the realtime path, alternating players; returns the last acknowledgement. */
  async function playMoves(gameId: string, players: { w: ReturnType<typeof connect>; b: ReturnType<typeof connect> }, moves: string[], startRevision: number, firstSide: 'w' | 'b' = 'w') {
    let revision = startRevision;
    let side = firstSide;
    let last: Ack | undefined;
    for (const uci of moves) {
      last = await players[side].send('game.move', moveCommand(gameId, uci, revision));
      if (!last.ok) throw new Error(`${uci}: ${last.error?.code}`);
      revision = last.game.revision;
      side = side === 'w' ? 'b' : 'w';
    }
    return last!;
  }

  beforeEach(async () => {
    clock = new FakeClock();
    await startApp();
  });
  afterEach(async () => {
    for (const socket of sockets.splice(0)) socket.disconnect();
    if (prisma) {
      const ids = [...createdIds];
      await prisma.game.deleteMany({ where: { participants: { some: { userId: { in: ids } } } } });
      // Rooms first: nulling a ready challenger seat would violate the readiness constraint.
      await prisma.room.deleteMany({ where: { hostId: { in: ids } } });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }
    createdIds.clear();
    await app?.close();
  });

  it('paginates only the viewer finished games, filters on the server and previews without writes or events', async () => {
    const { gameId, white, black } = await startedGame();
    const stranger = await account();
    const clients = await seated(gameId, white, black);
    const initial = (await as(white).get(`/games/${gameId}`)).body.game;
    await playMoves(gameId, clients, ['e2e4', 'e7e5', 'g1f3'], initial.revision);
    await as(black).post(`/games/${gameId}/resign`, { requestId: randomUUID() }).expect(200);
    const before = await prisma.game.findUnique({ where: { id: gameId }, include: { moves: true, commands: true } });
    const eventCount = clients.w.events.filter((e) => e.type === 'game.updated').length;
    for (const input of [{ basePly: 0, path: [] }, { basePly: 1, path: ['c7c5', 'g1f3'] }, { basePly: 1, path: ['e7e6', 'd2d4'] }]) {
      const result = await as(white).post(`/games/${gameId}/analysis/preview`, input).expect(200);
      expect(result.body.fen).toBeTruthy();
      expect(result.body.legalMoves).toBeTruthy();
    }
    await as(white).post(`/games/${gameId}/analysis/preview`, { basePly: 0, path: ['e2e5'] }).expect(422);
    await as(white).post(`/games/${gameId}/analysis/preview`, { basePly: 4, path: [] }).expect(400);
    await as(white).post(`/games/${gameId}/analysis/preview`, { basePly: 0, path: [], fen: 'forged' }).expect(400);
    await as(stranger).post(`/games/${gameId}/analysis/preview`, { basePly: 0, path: [] }).expect(404);
    await request(server()).post(`/api/games/${gameId}/analysis/preview`).send({ basePly: 0, path: [] }).expect(401);
    expect(await prisma.game.findUnique({ where: { id: gameId }, include: { moves: true, commands: true } })).toEqual(before);
    expect(clients.w.events.filter((e) => e.type === 'game.updated')).toHaveLength(eventCount);
    const first = (await as(white).get('/games?limit=1&result=win&side=w').expect(200)).body;
    expect(first.items).toHaveLength(1);
    expect(first.items[0]).toMatchObject({ id: gameId, side: 'w', result: 'win', mode: 'friends', opponent: { id: black.id }, timeControl: blitz });
    expect(JSON.stringify(first)).not.toContain('email');
    expect((await as(white).get('/games?result=loss')).body.items).toEqual([]);
    expect((await as(stranger).get('/games')).body.items).toEqual([]);
    const secondGame = await prisma.game.create({ data: {
      initialFen: before!.initialFen, fen: before!.initialFen, initialMs: 180000, incrementMs: 2000,
      whiteRemainingMs: 180000, blackRemainingMs: 180000, startedAt: before!.startedAt,
      status: 'FINISHED', result: 'DRAW', termination: 'AGREEMENT', endedAt: before!.endedAt, pgn: '1/2-1/2',
      participants: { create: [{ color: 'WHITE', userId: white.id }, { color: 'BLACK', userId: black.id }] },
    } });
    const page = (await as(white).get('/games?limit=1')).body;
    expect(page.nextCursor).toBeTruthy();
    const next = (await as(white).get(`/games?limit=1&cursor=${page.nextCursor}`)).body;
    expect(next.nextCursor).toBeNull();
    expect(new Set([page.items[0].id, next.items[0].id])).toEqual(new Set([gameId, secondGame.id]));
    expect((await as(white).get('/games/recent?limit=1').expect(200)).body.items).toHaveLength(1);
    await as(white).get('/games?cursor=bad').expect(400);
    const malformedIdCursor = Buffer.from(`${new Date().toISOString()}|${'-'.repeat(36)}`).toString('base64url');
    await as(white).get(`/games?cursor=${malformedIdCursor}`).expect(400);
    await as(white).get('/games?limit=51').expect(400);
    await request(server()).get('/api/games').expect(401);
  });

  it('refuses direct analysis of an active game without affecting its records', async () => {
    const { gameId, white } = await startedGame();
    const before = await prisma.game.findUnique({ where: { id: gameId }, include: { moves: true } });
    expect((await as(white).get('/games')).body.items).toEqual([]);
    expect((await as(white).post(`/games/${gameId}/analysis/preview`, { basePly: 0, path: ['e2e4'] }).expect(409)).body.code).toBe('analysis_requires_finished_game');
    expect(await prisma.game.findUnique({ where: { id: gameId }, include: { moves: true } })).toEqual(before);
  });

  it('starts exactly one game from a ready room, even under concurrent and repeated starts', async () => {
    const [host, guest, other, stranger] = [await account(), await account(), await account(), await account()];
    const room = (await as(host).post('/rooms', { timeControl: blitz, colorPreference: 'black' }).expect(201)).body.room;
    // Not startable before a challenger is seated and both are ready.
    expect((await as(host).post(`/rooms/${room.id}/start`, { expectedRevision: room.revision }).expect(409)).body.code).toBe(
      'room_not_ready',
    );
    const invite = async (recipient: Account) =>
      (await as(host).post(`/rooms/${room.id}/invitations`, { recipient: recipient.username }).expect(201)).body.invitation;
    const [accepted, stillPending] = [await invite(guest), await invite(other)];
    await as(guest).post(`/invitations/${accepted.id}/accept`).expect(200);
    let revision = (await as(host).get(`/rooms/${room.id}`).expect(200)).body.room.revision;
    revision = (await as(host).post(`/rooms/${room.id}/ready`, { expectedRevision: revision, ready: true }).expect(200)).body.room.revision;
    const ready = (await as(guest).post(`/rooms/${room.id}/ready`, { expectedRevision: revision, ready: true }).expect(200)).body.room;
    expect(ready.viewer.canStart).toBe(false);
    expect((await as(host).get(`/rooms/${room.id}`).expect(200)).body.room.viewer.canStart).toBe(true);
    const hostSocket = connect(host);
    const guestSocket = connect(guest);
    await Promise.all([hostSocket.ready, guestSocket.ready]);
    await hostSocket.join(`room:${ready.id}`);
    await guestSocket.join(`room:${ready.id}`);

    expect((await as(guest).post(`/rooms/${ready.id}/start`, { expectedRevision: ready.revision }).expect(403)).body.code).toBe(
      'not_room_host',
    );
    expect((await as(stranger).post(`/rooms/${ready.id}/start`, { expectedRevision: ready.revision }).expect(404)).body.code).toBe(
      'room_not_found',
    );
    expect(
      (await as(host).post(`/rooms/${ready.id}/start`, { expectedRevision: ready.revision - 1 }).expect(409)).body.code,
    ).toBe('room_revision_conflict');

    const starts = await Promise.all(
      Array.from({ length: 5 }, () => as(host).post(`/rooms/${ready.id}/start`, { expectedRevision: ready.revision })),
    );
    expect(starts.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
    const gameIds = new Set(starts.map((r) => r.body.room.gameId));
    expect(gameIds.size).toBe(1);
    const [gameId] = gameIds;
    expect(await prisma.game.count({ where: { roomId: ready.id } })).toBe(1);
    const roomRow = await prisma.room.findUniqueOrThrow({ where: { id: ready.id } });
    expect(roomRow).toMatchObject({ status: 'STARTED', revision: ready.revision + 1 });

    // Both players are told after commit; the event carries the game reference.
    const pushed = await guestSocket.next('room.updated', (e) => e.payload.room.status === 'started');
    expect(pushed.payload.room).toMatchObject({ gameId, viewer: { canStart: false, canSetReady: false } });
    // Reloading the room recovers the game; settings are now final.
    const reloaded = (await as(guest).get(`/rooms/${ready.id}`).expect(200)).body.room;
    expect(reloaded).toMatchObject({ status: 'started', gameId });
    const settings = await request(server())
      .patch(`/api/rooms/${ready.id}/settings`)
      .set('Authorization', `Bearer ${host.token}`)
      .send({ expectedRevision: reloaded.revision, colorPreference: 'white' })
      .expect(409);
    expect(settings.body.code).toBe('room_started');

    // Colours follow the preference (host chose black); settings are copied immutably.
    const game = (await as(host).get(`/games/${gameId}`).expect(200)).body.game;
    expect(game).toMatchObject({
      roomId: ready.id,
      revision: 1,
      ply: 0,
      players: { w: { id: guest.id }, b: { id: host.id } },
      timeControl: blitz,
      status: { phase: 'in-progress', turn: 'w' },
      viewer: { color: 'b', canMove: false },
      clocks: { runningSide: 'w', remainingMs: { w: 180_000, b: 180_000 } },
      moves: [],
    });
    expect((await as(stranger).get(`/games/${gameId}`).expect(404)).body.code).toBe('game_not_found');
    // Pending invitations close with the start; the accepted one keeps leading to the room.
    expect((await prisma.invitation.findUniqueOrThrow({ where: { id: stillPending.id } })).status).toBe('CANCELLED');
    expect((await as(guest).get(`/invitations/${accepted.id}`).expect(200)).body.invitation.room.availability).toBe('joined');
  });

  it('plays a complete game with castling, en passant and underpromotion, and ends in checkmate', async () => {
    const { gameId, white, black } = await startedGame();
    const players = await seated(gameId, white, black);
    const special = ['e2e4', 'd7d5', 'e4e5', 'f7f5', 'e5f6', 'b8c6', 'f6g7', 'c8e6', 'g7h8n', 'd8d7', 'g1f3', 'e8c8', 'f1e2', 'c8b8', 'e1g1'];
    await playMoves(gameId, players, special, 1);
    const snapshot = (await as(white).get(`/games/${gameId}`).expect(200)).body.game;
    expect(snapshot.moves.map((m: { san: string }) => m.san)).toEqual([
      'e4', 'd5', 'e5', 'f5', 'exf6', 'Nc6', 'fxg7', 'Be6', 'gxh8=N', 'Qd7', 'Nf3', 'O-O-O', 'Be2', 'Kb8', 'O-O',
    ]);
    expect(snapshot).toMatchObject({ ply: 15, revision: 16, fen: '1k1r1bnN/pppqp2p/2n1b3/3p4/8/5N2/PPPPBPPP/RNBQ1RK1 b - - 6 8' });
    // The opponent received each move as a compact update, never the history.
    const updates = players.b.events.filter((e) => e.type === 'game.updated');
    expect(updates).toHaveLength(15);
    expect(updates.every((e) => !('moves' in e.payload) && !('players' in e.payload))).toBe(true);
    expect(updates.map((e) => e.payload.revision)).toEqual(Array.from({ length: 15 }, (_, i) => i + 2));

    const mate = await startedGame();
    const mated = await seated(mate.gameId, mate.white, mate.black);
    const last = await playMoves(mate.gameId, mated, ['f2f3', 'e7e5', 'g2g4', 'd8h4'], 1);
    expect(last.game).toMatchObject({
      status: { phase: 'finished', result: { outcome: 'black', reason: 'checkmate' } },
      checkSquare: 'e1',
      clocks: { runningSide: null },
    });
    const row = await prisma.game.findUniqueOrThrow({ where: { id: mate.gameId } });
    expect(row).toMatchObject({ status: 'FINISHED', result: 'BLACK_WINS', termination: 'CHECKMATE', turnStartedAt: null });
    expect(row.endedAt).not.toBeNull();
    expect(row.pgn).toContain('1. f3 e5 2. g4 Qh4# 0-1');
    const after = await mated.w.send('game.move', moveCommand(mate.gameId, 'a2a3', last.game.revision));
    expect(after).toMatchObject({ ok: false, error: { code: 'game_finished' } });
  });

  it('rejects unauthorized, illegal, out-of-turn and stale commands without persisting anything', async () => {
    const { gameId, white, black } = await startedGame();
    const stranger = await account();
    const players = await seated(gameId, white, black);
    const outsider = connect(stranger);
    await outsider.ready;
    expect(await outsider.join(`game:${gameId}`)).toMatchObject({ ok: false, error: { code: 'forbidden' } });
    expect(await outsider.send('game.move', moveCommand(gameId, 'e2e4', 1))).toMatchObject({
      ok: false,
      error: { code: 'game_not_found' },
      game: null,
    });
    expect(await players.b.send('game.move', moveCommand(gameId, 'e7e5', 1))).toMatchObject({ ok: false, error: { code: 'not_your_turn' } });
    expect(await players.b.send('game.move', moveCommand(gameId, 'e2e4', 1))).toMatchObject({ ok: false, error: { code: 'not_your_turn' } });
    expect(await players.w.send('game.move', moveCommand(gameId, 'e2e5', 1))).toMatchObject({ ok: false, error: { code: 'illegal_move' } });
    expect(await players.w.send('game.move', moveCommand(gameId, 'e2e4', 3))).toMatchObject({ ok: false, error: { code: 'stale_revision' } });
    expect(await players.w.send('game.move', { gameId, from: 'e2', to: 'e4' })).toMatchObject({ ok: false, error: { code: 'invalid_request' } });
    // A client cannot name a different actor: there is no such field, and extra fields are refused.
    expect(await players.w.send('game.move', { ...moveCommand(gameId, 'e7e5', 1), actorId: black.id })).toMatchObject({
      ok: false,
      error: { code: 'invalid_request' },
    });
    await request(server()).post(`/api/games/${gameId}/moves`).send(moveCommand(gameId, 'e2e4', 1)).expect(401);
    expect((await as(stranger).post(`/games/${gameId}/resign`, { requestId: randomUUID() }).expect(404)).body.code).toBe('game_not_found');
    expect(await prisma.gameMove.count({ where: { gameId } })).toBe(0);
    expect((await prisma.game.findUniqueOrThrow({ where: { id: gameId } })).revision).toBe(1);
  });

  it('applies a retried move once, refuses a reused request id, and lets one of two competing moves win', async () => {
    const { gameId, white, black } = await startedGame();
    const players = await seated(gameId, white, black);
    const requestId = randomUUID();
    const [first, retry] = await Promise.all([
      players.w.send('game.move', moveCommand(gameId, 'e2e4', 1, requestId)),
      players.w.send('game.move', moveCommand(gameId, 'e2e4', 1, requestId)),
    ]);
    expect([first.duplicate, retry.duplicate].sort()).toEqual([false, true]);
    expect(first.game.revision).toBe(2);
    expect(retry.game.revision).toBe(2);
    expect(await players.w.send('game.move', moveCommand(gameId, 'd2d4', 1, requestId))).toMatchObject({
      ok: false,
      error: { code: 'request_id_reused' },
    });
    // The same retry over HTTP (e.g. after a reconnect) is answered from the ledger.
    const { gameId: _inPath, ...httpBody } = moveCommand(gameId, 'e2e4', 1, requestId);
    const http = await as(white).post(`/games/${gameId}/moves`, httpBody).expect(200);
    expect(http.body).toMatchObject({ duplicate: true, game: { revision: 2 } });

    // Black's two tabs send different moves for the same revision.
    const blackTab = connect(black);
    await blackTab.ready;
    const competing = await Promise.all([
      players.b.send('game.move', moveCommand(gameId, 'e7e5', 2)),
      blackTab.send('game.move', moveCommand(gameId, 'c7c5', 2)),
    ]);
    expect(competing.filter((a) => a.ok)).toHaveLength(1);
    expect(competing.find((a) => !a.ok)!.error!.code).toBe('stale_revision');
    const moves = await prisma.gameMove.findMany({ where: { gameId }, orderBy: { ply: 'asc' } });
    expect(moves.map((m) => m.ply)).toEqual([1, 2]);
    expect(await prisma.gameCommand.count({ where: { gameId } })).toBe(2);
  });

  it('runs the official clock on the server: increments, move-versus-timeout ordering and late timers', async () => {
    const { gameId, white, black } = await startedGame();
    const players = await seated(gameId, white, black);
    clock.advance(7_000);
    const e4 = await players.w.send('game.move', moveCommand(gameId, 'e2e4', 1));
    expect(e4.game.move).toMatchObject({ elapsedMs: 7_000, remainingMs: { w: 175_000, b: 180_000 } });
    // The opponent's event carries the same authoritative clocks.
    const seen = await players.b.next('game.updated', (e) => e.payload.revision === 2);
    expect(seen.payload.clocks).toMatchObject({ runningSide: 'b', remainingMs: { w: 175_000, b: 180_000 } });

    // A browser timestamp is not part of the command; only server receipt counts.
    clock.advance(179_999);
    const inTime = await players.b.send('game.move', moveCommand(gameId, 'e7e5', 2));
    expect(inTime.game.move.remainingMs.b).toBe(2_001);

    // White's flag falls; the scheduled timer has not run. A move at the deadline loses.
    clock.advance(175_000);
    const late = await players.w.send('game.move', moveCommand(gameId, 'g1f3', 3));
    expect(late).toMatchObject({
      ok: false,
      error: { code: 'game_finished' },
      game: { status: { phase: 'finished', result: { outcome: 'black', reason: 'timeout' } }, clocks: { remainingMs: { w: 0 } } },
    });
    const finished = await players.b.next('game.updated', (e) => e.payload.status.phase === 'finished');
    expect(finished.payload.status.result.reason).toBe('timeout');
    const row = await prisma.game.findUniqueOrThrow({ where: { id: gameId } });
    expect(row).toMatchObject({ termination: 'TIMEOUT', result: 'BLACK_WINS', whiteRemainingMs: 0, blackRemainingMs: 2_001 });
    expect(await prisma.gameMove.count({ where: { gameId } })).toBe(2);

    // Timer path: a game nobody touches is ended by the (late) timer check.
    const idle = await startedGame();
    await commands.runtime(idle.gameId);
    clock.advance(179_000);
    await commands.checkTimeout(idle.gameId);
    expect((await prisma.game.findUniqueOrThrow({ where: { id: idle.gameId } })).status).toBe('ACTIVE');
    clock.advance(30_000);
    await commands.checkTimeout(idle.gameId);
    expect(await prisma.game.findUniqueOrThrow({ where: { id: idle.gameId } })).toMatchObject({
      status: 'FINISHED',
      termination: 'TIMEOUT',
      result: 'BLACK_WINS',
    });
  });

  it('finalizes draws by agreement and resignations exactly once with PGN and final clocks', async () => {
    const { gameId, white, black } = await startedGame();
    const players = await seated(gameId, white, black);
    await playMoves(gameId, players, ['e2e4', 'e7e5'], 1);
    const offer = await players.w.send('game.draw.offer', { gameId, requestId: randomUUID() });
    expect(offer.game.drawOffer).toEqual({ by: 'w', state: 'pending' });
    const offered = await players.b.next('game.updated', (e) => e.payload.drawOffer?.state === 'pending');
    expect(offered.payload.viewer).toMatchObject({ canRespondToDraw: true });
    const declined = await players.b.send('game.draw.respond', { gameId, requestId: randomUUID(), response: 'decline' });
    expect(declined.game.drawOffer).toEqual({ by: 'w', state: 'declined' });
    expect(await players.w.send('game.draw.offer', { gameId, requestId: randomUUID() })).toMatchObject({
      ok: false,
      error: { code: 'draw_offer_cooldown' },
    });
    await players.b.send('game.draw.offer', { gameId, requestId: randomUUID() });
    clock.advance(4_000);
    // Acceptance and a resignation race: exactly one ends the game, the other is refused.
    const [accept, resign] = await Promise.all([
      players.w.send('game.draw.respond', { gameId, requestId: randomUUID(), response: 'accept' }),
      players.b.send('game.resign', { gameId, requestId: randomUUID() }),
    ]);
    expect([accept, resign].filter((a) => a.ok)).toHaveLength(1);
    expect([accept, resign].find((a) => !a.ok)).toMatchObject({ error: { code: 'game_finished' } });
    const row = await prisma.game.findUniqueOrThrow({ where: { id: gameId } });
    const agreed = accept.ok;
    expect(row).toMatchObject({
      termination: agreed ? 'AGREEMENT' : 'RESIGNATION',
      result: agreed ? 'DRAW' : 'WHITE_WINS',
      drawOfferBy: null,
      turnStartedAt: null,
    });
    // White was on move for the last 4 s; that is charged at the end.
    expect(row.whiteRemainingMs).toBe(180_000 + 2_000 - 4_000);
    expect(row.pgn).toContain(agreed ? '[Result "1/2-1/2"]' : '[Result "1-0"]');
    expect(await prisma.gameCommand.count({ where: { gameId, kind: { in: ['ACCEPT_DRAW', 'RESIGN'] } } })).toBe(1);

    const resigned = await startedGame();
    const rp = await seated(resigned.gameId, resigned.white, resigned.black);
    const ack = await rp.w.send('game.resign', { gameId: resigned.gameId, requestId: randomUUID() });
    expect(ack.game.status).toEqual({ phase: 'finished', result: { outcome: 'black', reason: 'resignation' } });
    expect((await prisma.game.findUniqueOrThrow({ where: { id: resigned.gameId } })).termination).toBe('RESIGNATION');
  });

  it('keeps clocks running through a disconnect and resynchronizes the missed moves on rejoin', async () => {
    const { gameId, white, black } = await startedGame();
    const players = await seated(gameId, white, black);
    await playMoves(gameId, players, ['e2e4'], 1);
    players.w.socket.disconnect();
    clock.advance(10_000);
    await playMoves(gameId, players, ['c7c5'], 2, 'b');
    clock.advance(5_000);
    // Rejoining (a new connection, as after a reload or token renewal) is the synchronization boundary.
    const back = connect(white);
    await back.ready;
    await back.join(`game:${gameId}`);
    const sync = await back.next('game.snapshot');
    expect(sync.payload.game).toMatchObject({
      revision: 3,
      ply: 2,
      moves: [{ san: 'e4' }, { san: 'c5' }],
      clocks: { runningSide: 'w', remainingMs: { w: 180_000 + 2_000 - 5_000, b: 180_000 - 10_000 + 2_000 } },
      viewer: { canMove: true },
    });
    expect(Object.keys(sync.payload.game.legalMoves).length).toBeGreaterThan(0);
  });

  it('never publishes a move whose database write failed, and the retry applies it once', async () => {
    const { gameId, white, black } = await startedGame();
    const players = await seated(gameId, white, black);
    const fn = `fail_moves_${randomUUID().replace(/-/g, '')}`;
    await prisma.$executeRawUnsafe(
      `CREATE FUNCTION ${fn}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."gameId" = '${gameId}' THEN RAISE EXCEPTION 'injected failure'; END IF; RETURN NEW; END $$`,
    );
    await prisma.$executeRawUnsafe(`CREATE TRIGGER ${fn} BEFORE INSERT ON "GameMove" FOR EACH ROW EXECUTE FUNCTION ${fn}()`);
    const requestId = randomUUID();
    try {
      const failed = await players.w.send('game.move', moveCommand(gameId, 'e2e4', 1, requestId));
      expect(failed).toMatchObject({ ok: false, error: { code: 'command_not_saved', retryable: true }, game: { revision: 1, ply: 0 } });
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(players.b.events.filter((e) => e.type === 'game.updated')).toHaveLength(0);
      const row = await prisma.game.findUniqueOrThrow({ where: { id: gameId } });
      expect(row).toMatchObject({ revision: 1, ply: 0 });
      expect(await prisma.gameCommand.count({ where: { gameId } })).toBe(0);
      expect((await as(black).get(`/games/${gameId}`).expect(200)).body.game).toMatchObject({ revision: 1, moves: [] });
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER ${fn} ON "GameMove"`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION ${fn}()`);
    }
    const retried = await players.w.send('game.move', moveCommand(gameId, 'e2e4', 1, requestId));
    expect(retried).toMatchObject({ ok: true, duplicate: false, game: { revision: 2, ply: 1 } });
    await players.b.next('game.updated', (e) => e.payload.revision === 2);
    expect(await prisma.gameMove.count({ where: { gameId } })).toBe(1);
  });

  it('recovers active games from persisted history after a restart, including repetition history', async () => {
    const { gameId, white, black } = await startedGame();
    const players = await seated(gameId, white, black);
    // The start position occurs twice before the restart.
    await playMoves(gameId, players, ['g1f3', 'g8f6', 'f3g1', 'f6g8'], 1);
    clock.advance(20_000); // White thinks for 20 s, then the server goes down.
    const requestId = randomUUID();
    const before = await players.w.send('game.move', moveCommand(gameId, 'g1f3', 5, requestId));
    expect(before.ok).toBe(true);
    for (const socket of sockets.splice(0)) socket.disconnect();
    await app.close();

    clock.advance(60_000); // Downtime is not charged to anyone.
    await startApp();
    const row = await prisma.game.findUniqueOrThrow({ where: { id: gameId } });
    expect(row).toMatchObject({ status: 'ACTIVE', revision: 7, ply: 5 });
    expect(row.turnStartedAt!.getTime()).toBe(clock.value);
    const snapshot = (await as(black).get(`/games/${gameId}`).expect(200)).body.game;
    expect(snapshot).toMatchObject({
      revision: 7,
      ply: 5,
      clocks: { runningSide: 'b', remainingMs: { b: 180_000 + 4_000 } },
      viewer: { canMove: true },
    });
    // A retry of the pre-restart command is still recognized.
    const again = connect(white);
    await again.ready;
    expect(await again.send('game.move', moveCommand(gameId, 'g1f3', 5, requestId))).toMatchObject({ ok: true, duplicate: true });
    // Completing the third occurrence of the start position after the restart draws by repetition.
    const blackAgain = connect(black);
    await blackAgain.ready;
    const resumed = { w: again, b: blackAgain };
    const last = await playMoves(gameId, resumed, ['g8f6', 'f3g1', 'f6g8'], 7, 'b');
    expect(last.game.status).toEqual({ phase: 'finished', result: { outcome: 'draw', reason: 'threefold-repetition' } });
  });
});
