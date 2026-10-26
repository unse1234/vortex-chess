import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomBytes, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { performance } from 'node:perf_hooks';
import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import type { PrismaService as PrismaServiceType } from '../src/database/prisma.service';

/**
 * Opt-in smoke check against the deployed engine service, through the real
 * backend (HTTP adapter, turns, PostgreSQL, Socket.IO) with the real server
 * clock. Small on purpose: two short games, about seven analyze requests.
 * Not a load test.
 *
 *   ENGINE_LIVE_URL=https://… TEST_DATABASE_URL=… npx vitest run --config ./vitest.config.e2e.ts test/engine-live.e2e-spec.ts
 *
 * ENGINE_LIVE_OUT=<file> also writes the measurements as JSON.
 */
const databaseUrl = process.env.TEST_DATABASE_URL;
const liveUrl = process.env.ENGINE_LIVE_URL;
const suite = databaseUrl && liveUrl ? describe : describe.skip;
const origin = 'http://localhost:3000';
const password = 'correct-password-123';
const rapid = { initialMs: 600_000, incrementMs: 0 };
const PLAYER_MOVES = 4;

type Envelope = { channel: string; type: string; payload: any };

async function waitFor<T>(check: () => T | Promise<T>, timeout = 30_000) {
  const started = Date.now();
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() - started > timeout) throw new Error('Timed out waiting');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

suite('Live engine service smoke check', () => {
  let app: NestExpressApplication;
  let prisma: PrismaServiceType;
  let baseUrl: string;
  let userId: string;
  let token: string;
  const sockets: Socket[] = [];
  const measurements = { playerMoveToEngineMoveMs: [] as number[], openingMoveAfterCreateMs: null as number | null };

  beforeAll(async () => {
    Object.assign(process.env, {
      NODE_ENV: 'test',
      DATABASE_URL: databaseUrl,
      JWT_ACCESS_SECRET: randomBytes(48).toString('hex'),
      CORS_ORIGINS: origin,
      EXPIRY_SWEEP_INTERVAL_SECONDS: '0',
      MAIL_WORKER_INTERVAL_SECONDS: '0',
      ENGINE_BASE_URL: liveUrl,
      ENGINE_RECOVERY_INTERVAL_SECONDS: '0',
    });
    const { AppModule } = require('../dist/app.module') as typeof import('../src/app.module');
    const { PrismaService } = require('../dist/database/prisma.service') as typeof import('../src/database/prisma.service');
    const { configureApp } = require('../dist/configure-app') as typeof import('../src/configure-app');
    const fixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = fixture.createNestApplication<NestExpressApplication>({ bodyParser: false });
    configureApp(app);
    await app.listen(0, '127.0.0.1');
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
    prisma = app.get(PrismaService);
    const id = randomUUID().slice(0, 8);
    const response = await request(app.getHttpServer())
      .post('/api/auth/sign-up')
      .set('Origin', origin)
      .set('X-Vortix-CSRF', '1')
      .send({ username: `Lv_${id}`, email: `${id}@vortix-live.invalid`, password, confirmPassword: password, acceptTerms: true })
      .expect(201);
    userId = response.body.user.id;
    token = response.body.accessToken;
  }, 60_000);

  afterAll(async () => {
    for (const socket of sockets) socket.disconnect();
    if (prisma && userId) {
      await prisma.game.deleteMany({ where: { participants: { some: { userId } } } });
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    const { EngineMetrics } = require('../dist/modules/engines/engine-metrics') as typeof import('../src/modules/engines/engine-metrics');
    const { GameMetrics } = require('../dist/modules/games/services/game-metrics') as typeof import('../src/modules/games/services/game-metrics');
    const report = {
      engineService: liveUrl,
      measuredAt: new Date().toISOString(),
      /** HTTP round trip vs engine-reported time_ms, per analyze request, from this backend. */
      engine: app.get(EngineMetrics).summary(),
      /** Our server processing per accepted move (player and engine moves), receipt -> emitted. */
      serverPipeline: app.get(GameMetrics).summary(),
      /** Client view: player's move acknowledged -> engine move received on the socket. */
      client: measurements,
    };
    console.log(JSON.stringify(report, null, 2));
    if (process.env.ENGINE_LIVE_OUT) writeFileSync(process.env.ENGINE_LIVE_OUT, JSON.stringify(report, null, 2));
    await app?.close();
  }, 60_000);

  const http = {
    get: (path: string) => request(app.getHttpServer()).get(`/api${path}`).set('Authorization', `Bearer ${token}`),
    post: (path: string, body: object = {}) =>
      request(app.getHttpServer()).post(`/api${path}`).set('Authorization', `Bearer ${token}`).send(body),
  };

  async function join(gameId: string) {
    const socket = io(baseUrl, { path: '/api/socket.io', auth: { token }, transports: ['websocket'], extraHeaders: { Origin: origin }, forceNew: true, reconnection: false });
    sockets.push(socket);
    const events: Envelope[] = [];
    socket.on('event', (event: Envelope) => events.push({ ...event, receivedAt: performance.now() } as Envelope));
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve());
      socket.once('connect_error', reject);
    });
    await socket.timeout(5000).emitWithAck('channel.join', { channel: `game:${gameId}` });
    return { socket, events };
  }

  it('reports the deployed engine as available', async () => {
    const status = (await http.get('/engine-games/status').expect(200)).body;
    console.log('engine status', status);
    expect(status).toMatchObject({ available: true, configured: true });
  });

  it('plays several validated engine replies to a player as White', async () => {
    const game = (await http.post('/engine-games', { timeControl: rapid, colorPreference: 'white' }).expect(201)).body.game;
    const { socket, events } = await join(game.id);
    let state = game;
    for (let i = 0; i < PLAYER_MOVES; i += 1) {
      const [from, targets] = Object.entries(state.legalMoves as Record<string, string[]>).sort()[0];
      const ack = await socket.timeout(5000).emitWithAck('game.move', {
        gameId: game.id,
        requestId: randomUUID(),
        expectedRevision: state.revision,
        from,
        to: [...targets].sort()[0],
      });
      expect(ack.ok).toBe(true);
      const acked = performance.now();
      const reply = await waitFor(() =>
        events.find((e) => e.type === 'game.updated' && e.payload.revision === ack.game.revision + 1),
      );
      measurements.playerMoveToEngineMoveMs.push(Math.round((reply as unknown as { receivedAt: number }).receivedAt - acked));
      expect(reply.payload.move).toMatchObject({ color: 'b' });
      state = reply.payload;
      if (state.status.phase === 'finished') break;
    }
    const moves = await prisma.gameMove.findMany({ where: { gameId: game.id }, orderBy: { ply: 'asc' } });
    console.log('moves', moves.map((m) => `${m.san}${m.actorId ? '' : '(engine ' + m.elapsedMs + ' ms)'}`).join(' '));
    expect(moves.filter((m) => m.actorId === null)).toHaveLength(PLAYER_MOVES);
    expect((await prisma.game.findUniqueOrThrow({ where: { id: game.id } })).status).toBe('ACTIVE');
    await http.post(`/games/${game.id}/resign`, { requestId: randomUUID() }).expect(200);
  }, 120_000);

  it('plays the opening move when the engine has White', async () => {
    const started = performance.now();
    const game = (await http.post('/engine-games', { timeControl: rapid, colorPreference: 'black' }).expect(201)).body.game;
    await waitFor(async () => (await prisma.gameMove.count({ where: { gameId: game.id } })) === 1);
    measurements.openingMoveAfterCreateMs = Math.round(performance.now() - started);
    const snapshot = (await http.get(`/games/${game.id}`).expect(200)).body.game;
    expect(snapshot).toMatchObject({ ply: 1, viewer: { canMove: true }, players: { w: { kind: 'engine' } } });
    console.log('opening', snapshot.moves[0].san, `${snapshot.moves[0].elapsedMs} ms on the engine clock`);
    await http.post(`/games/${game.id}/resign`, { requestId: randomUUID() }).expect(200);
  }, 60_000);
});
