import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomBytes, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import type { PrismaService as PrismaServiceType } from '../src/database/prisma.service';

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const origin = 'http://localhost:3000';
const password = 'correct-password-123';
const blitz = { initialMs: 180_000, incrementMs: 2_000 };

type Account = { id: string; username: string; token: string };
type Envelope = { channel: string; type: string; payload: any };
type Ack = {
  ok: boolean;
  duplicate?: boolean;
  error?: { code: string; retryable: boolean };
  game: any;
};

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

suite(
  'Matchmaking: durable queue, races, recovery and real PvP (PostgreSQL)',
  () => {
    let app: NestExpressApplication;
    let prisma: PrismaServiceType;
    let baseUrl: string;
    let clock: FakeClock;
    const createdIds = new Set<string>();
    const sockets: Socket[] = [];
    const server = () => app.getHttpServer();

    async function startApp() {
      Object.assign(process.env, {
        NODE_ENV: 'test',
        DATABASE_URL: databaseUrl,
        JWT_ACCESS_SECRET:
          process.env.JWT_ACCESS_SECRET ?? randomBytes(48).toString('hex'),
        CORS_ORIGINS: origin,
        COOKIE_SECURE: 'false',
        COOKIE_SAME_SITE: 'lax',
        EXPIRY_SWEEP_INTERVAL_SECONDS: '0',
        MAIL_WORKER_INTERVAL_SECONDS: '0',
      });
      const { AppModule } =
        require('../dist/app.module') as typeof import('../src/app.module');
      const { PrismaService } =
        require('../dist/database/prisma.service') as typeof import('../src/database/prisma.service');
      const { configureApp } =
        require('../dist/configure-app') as typeof import('../src/configure-app');
      const { ServerClock } =
        require('../dist/modules/games/clocks/server-clock') as typeof import('../src/modules/games/clocks/server-clock');
      const fixture = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(ServerClock)
        .useValue(clock)
        .compile();
      app = fixture.createNestApplication<NestExpressApplication>({
        bodyParser: false,
      });
      configureApp(app);
      await app.listen(0, '127.0.0.1');
      baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
      prisma = app.get(PrismaService);
    }

    async function account(): Promise<Account> {
      const id = randomUUID().slice(0, 8);
      const { AuthService } =
        require('../dist/modules/auth/auth.service') as typeof import('../src/modules/auth/auth.service');
      // Real registration/session issuance, bypassing the HTTP sign-up rate limit for load fixtures.
      const { body } = await app.get(AuthService).register({
        username: `Gm_${id}`,
        email: `${id}@vortix-games.invalid`,
        password,
        confirmPassword: password,
        acceptTerms: true,
      });
      createdIds.add(body.user.id);
      return {
        id: body.user.id,
        username: `Gm_${id}`,
        token: body.accessToken,
      };
    }
    const as = (user: Account) => ({
      get: (path: string) =>
        request(server())
          .get(`/api${path}`)
          .set('Authorization', `Bearer ${user.token}`),
      post: (path: string, body: object = {}) =>
        request(server())
          .post(`/api${path}`)
          .set('Authorization', `Bearer ${user.token}`)
          .send(body),
    });

    function connect(user: Account, url = baseUrl) {
      const socket = io(url, {
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
        join: (channel: string) =>
          socket.timeout(4000).emitWithAck('channel.join', { channel }),
      };
      return client;
    }

    const joinQueue = async (user: Account, timeControl = blitz) =>
      (await as(user).post('/matchmaking/join', { timeControl }).expect(200))
        .body;
    const status = async (user: Account) =>
      (await as(user).get('/matchmaking').expect(200)).body;
    const ready = async (user: Account, searchId: string) =>
      (await as(user).post('/matchmaking/ready', { searchId }).expect(200))
        .body;
    async function match(a: Account, b: Account) {
      const first = await joinQueue(a);
      const second = await joinQueue(b);
      expect(second.state).toBe('confirming');
      expect(
        await prisma.game.count({
          where: { participants: { some: { userId: a.id } } },
        }),
      ).toBe(0);
      await ready(a, first.searchId);
      const assigned = await ready(b, second.searchId);
      expect(assigned.state).toBe('matched');
      return assigned.gameId as string;
    }
    async function readyRoom(host: Account, guest: Account) {
      const room = (
        await as(host)
          .post('/rooms', { timeControl: blitz, colorPreference: 'white' })
          .expect(201)
      ).body.room;
      const invitation = (
        await as(host)
          .post(`/rooms/${room.id}/invitations`, { recipient: guest.username })
          .expect(201)
      ).body.invitation;
      await as(guest).post(`/invitations/${invitation.id}/accept`).expect(200);
      let revision = (await as(host).get(`/rooms/${room.id}`)).body.room
        .revision;
      revision = (
        await as(host)
          .post(`/rooms/${room.id}/ready`, {
            expectedRevision: revision,
            ready: true,
          })
          .expect(200)
      ).body.room.revision;
      return (
        await as(guest)
          .post(`/rooms/${room.id}/ready`, {
            expectedRevision: revision,
            ready: true,
          })
          .expect(200)
      ).body.room;
    }
    beforeEach(async () => {
      clock = new FakeClock();
      await startApp();
    }, 60000);
    afterEach(async () => {
      for (const socket of sockets.splice(0)) socket.disconnect();
      if (prisma) {
        const ids = [...createdIds];
        await prisma.game.deleteMany({
          where: { participants: { some: { userId: { in: ids } } } },
        });
        await prisma.room.deleteMany({ where: { hostId: { in: ids } } });
        await prisma.user.deleteMany({ where: { id: { in: ids } } });
      }
      createdIds.clear();
      await app?.close();
    });

    it('authenticates identity, validates presets/increments and rejects client player IDs', async () => {
      const a = await account();
      await request(server()).get('/api/matchmaking').expect(401);
      await request(server())
        .post('/api/matchmaking/join')
        .send({ timeControl: blitz })
        .expect(401);
      await as(a)
        .post('/matchmaking/join', { timeControl: blitz, userId: randomUUID() })
        .expect(400);
      await as(a)
        .post('/matchmaking/join', {
          timeControl: { ...blitz, incrementMs: 1000 },
        })
        .expect(400);
      expect((await as(a).get('/matchmaking/options')).body).toMatchObject({
        enabled: true,
        arrivalTtlMs: 30000,
        searchTtlMs: 300000,
      });
    });

    it('keeps incompatible increments queued, prevents self matching and handles duplicate joins across tabs', async () => {
      const [a, b] = [await account(), await account()];
      const first = await joinQueue(a);
      const duplicates = await Promise.all(
        Array.from({ length: 8 }, () => joinQueue(a)),
      );
      expect(
        duplicates.every(
          (row) => row.searchId === first.searchId && row.state === 'searching',
        ),
      ).toBe(true);
      await joinQueue(b, { ...blitz, incrementMs: 0 });
      expect((await status(a)).state).toBe('searching');
      expect((await status(b)).state).toBe('searching');
      expect(
        await prisma.game.count({
          where: { participants: { some: { userId: a.id } } },
        }),
      ).toBe(0);
      await as(a)
        .post('/matchmaking/join', {
          timeControl: { ...blitz, incrementMs: 0 },
        })
        .expect(409);
      expect(
        await prisma.matchmakingSearch.count({ where: { userId: a.id } }),
      ).toBe(1);
    });

    it('chooses the oldest compatible opponent, reserves two seats and creates one game under simultaneous confirms', async () => {
      const users = await Promise.all(
        Array.from({ length: 4 }, () => account()),
      );
      // Put two waiting accounts into the persisted queue to model workers already waiting after recovery.
      const a = await joinQueue(users[0]);
      const b = await joinQueue(users[1], {
        initialMs: 300000,
        incrementMs: 0,
      });
      await prisma.matchmakingSearch.update({
        where: { userId: users[1].id },
        data: { ...blitz, queuedAt: new Date(Date.now() - 1000) },
      });
      const c = await joinQueue(users[2]);
      expect((await status(users[1])).state).toBe('confirming');
      expect((await status(users[0])).state).toBe('searching');
      await ready(users[1], b.searchId);
      const responses = await Promise.all(
        Array.from({ length: 8 }, () => ready(users[2], c.searchId)),
      );
      const ids = new Set(responses.map((row) => row.gameId));
      expect(ids.size).toBe(1);
      expect([...ids][0]).toBeTruthy();
      expect(
        await prisma.game.count({
          where: { participants: { some: { userId: users[2].id } } },
        }),
      ).toBe(1);
      await as(users[0])
        .post('/matchmaking/cancel', { searchId: a.searchId })
        .expect(200);
    });

    it('serializes concurrent joins from many accounts into disjoint reservations without double games', async () => {
      const users = await Promise.all(
        Array.from({ length: 6 }, () => account()),
      );
      const queued = await Promise.all(users.map((user) => joinQueue(user)));
      const states = await Promise.all(users.map(status));
      expect(states.every((row) => row.state === 'confirming')).toBe(true);
      await Promise.all(
        users.flatMap((user, i) => [
          ready(user, queued[i].searchId),
          ready(user, queued[i].searchId),
        ]),
      );
      const assigned = await Promise.all(users.map(status));
      expect(new Set(assigned.map((row) => row.gameId)).size).toBe(3);
      for (const user of users)
        expect(
          await prisma.gameParticipant.count({
            where: { userId: user.id, game: { status: 'ACTIVE' } },
          }),
        ).toBe(1);
    });

    it('coordinates two independent backend workers through PostgreSQL instead of process-local state', async () => {
      const [a, b] = [await account(), await account()];
      const { AppModule } =
        require('../dist/app.module') as typeof import('../src/app.module');
      const { configureApp } =
        require('../dist/configure-app') as typeof import('../src/configure-app');
      const { ServerClock } =
        require('../dist/modules/games/clocks/server-clock') as typeof import('../src/modules/games/clocks/server-clock');
      const fixture = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(ServerClock)
        .useValue(clock)
        .compile();
      const worker = fixture.createNestApplication<NestExpressApplication>({
        bodyParser: false,
      });
      configureApp(worker);
      await worker.listen(0, '127.0.0.1');
      try {
        const workerUrl = `http://127.0.0.1:${(worker.getHttpServer().address() as AddressInfo).port}`;
        const [tabA, tabB] = [connect(a), connect(b, workerUrl)];
        await Promise.all([tabA.ready, tabB.ready]);
        const post = (user: Account, path: string, body: object) =>
          request(worker.getHttpServer())
            .post(`/api${path}`)
            .set('Authorization', `Bearer ${user.token}`)
            .send(body)
            .expect(200);
        const [first, second] = await Promise.all([
          joinQueue(a),
          post(b, '/matchmaking/join', { timeControl: blitz }),
        ]);
        await Promise.all([
          ready(a, first.searchId),
          post(b, '/matchmaking/ready', { searchId: second.body.searchId }),
        ]);
        const [aa, bb] = await Promise.all([status(a), status(b)]);
        expect(aa.state).toBe('matched');
        expect(aa.gameId).toBe(bb.gameId);
        expect(
          await prisma.game.count({
            where: { participants: { some: { userId: a.id } } },
          }),
        ).toBe(1);
        // Each worker must emit to its own sockets, even if its peer committed the match.
        await Promise.all(
          [tabA, tabB].map((tab) =>
            waitFor(
              () =>
                tab.events.find(
                  (event) =>
                    event.type === 'matchmaking.found' &&
                    event.payload.matchmaking.gameId === aa.gameId,
                ),
              8000,
            ),
          ),
        );
      } finally {
        await worker.close();
      }
    });

    it('gates admission and readiness when the server feature is disabled while allowing status and cancel recovery', async () => {
      const a = await account();
      const first = await joinQueue(a);
      const { ConfigService } =
        require('@nestjs/config') as typeof import('@nestjs/config');
      const config = app.get(ConfigService);
      config.set('MATCHMAKING_ENABLED', false);
      try {
        expect((await as(a).get('/matchmaking/options')).body.enabled).toBe(
          false,
        );
        await as(a)
          .post('/matchmaking/join', { timeControl: blitz })
          .expect(503);
        await as(a)
          .post('/matchmaking/ready', { searchId: first.searchId })
          .expect(503);
        expect((await status(a)).state).toBe('searching');
        expect(
          (
            await as(a)
              .post('/matchmaking/cancel', { searchId: first.searchId })
              .expect(200)
          ).body.state,
        ).toBe('idle');
      } finally {
        config.set('MATCHMAKING_ENABLED', true);
      }
    });

    it('makes cancel versus join and cancel versus final confirmation linearizable; stale cancels cannot remove a new search', async () => {
      for (let run = 0; run < 4; run++) {
        const [a, b] = [await account(), await account()];
        const first = await joinQueue(a);
        await Promise.all([
          as(a)
            .post('/matchmaking/cancel', { searchId: first.searchId })
            .expect(200),
          joinQueue(b),
        ]);
        expect((await status(a)).state).toBe('idle');
        const again = await joinQueue(a);
        await as(a)
          .post('/matchmaking/cancel', { searchId: first.searchId })
          .expect(200);
        expect((await status(a)).searchId).toBe(again.searchId);
        const bs = await status(b);
        if (bs.state === 'idle') await joinQueue(b);
        const [asNow, bsNow] = await Promise.all([status(a), status(b)]);
        await ready(a, asNow.searchId);
        await Promise.all([
          ready(b, bsNow.searchId),
          as(a)
            .post('/matchmaking/cancel', { searchId: asNow.searchId })
            .expect(200),
        ]);
        const [aa, bb] = await Promise.all([status(a), status(b)]);
        expect(aa.state).toBe(bb.state);
        expect(['idle', 'matched']).toContain(aa.state);
        if (aa.state === 'matched') expect(aa.gameId).toBe(bb.gameId);
        expect(
          await prisma.game.count({
            where: { participants: { some: { userId: a.id } } },
          }),
        ).toBe(aa.state === 'matched' ? 1 : 0);
      }
    });

    it('coordinates friend starts and matchmaking under the same admission lock and blocks active-game joins', async () => {
      const [a, b, c] = [await account(), await account(), await account()];
      const room = await readyRoom(a, b);
      const [queue, start] = await Promise.all([
        as(a).post('/matchmaking/join', { timeControl: blitz }),
        as(a).post(`/rooms/${room.id}/start`, {
          expectedRevision: room.revision,
        }),
      ]);
      expect([queue.status, start.status].sort()).toEqual([200, 409]);
      if (start.status === 200) {
        await as(a)
          .post('/matchmaking/join', { timeControl: blitz })
          .expect(409);
        await as(b)
          .post('/matchmaking/join', { timeControl: blitz })
          .expect(409);
      } else {
        const own = await status(a);
        await as(a)
          .post('/matchmaking/cancel', { searchId: own.searchId })
          .expect(200);
        await match(a, c);
        await as(a)
          .post(`/rooms/${room.id}/start`, { expectedRevision: room.revision })
          .expect(409);
      }
      expect(
        await prisma.gameParticipant.count({
          where: { userId: a.id, game: { status: 'ACTIVE' } },
        }),
      ).toBe(1);
    });

    it('expires waiting and absent-player reservations durably without starting clocks; preserves cancellation across restart', async () => {
      const [a, b] = [await account(), await account()];
      const first = await joinQueue(a);
      await prisma.matchmakingSearch.update({
        where: { userId: a.id },
        data: { expiresAt: new Date(0) },
      });
      expect(await status(a)).toMatchObject({
        state: 'idle',
        reason: 'search_expired',
      });
      const again = await joinQueue(a);
      const second = await joinQueue(b);
      await ready(a, again.searchId);
      await prisma.matchmakingSearch.updateMany({
        where: { userId: { in: [a.id, b.id] } },
        data: { expiresAt: new Date(0) },
      });
      expect(await status(a)).toMatchObject({
        state: 'idle',
        reason: 'arrival_expired',
      });
      expect((await status(b)).state).toBe('idle');
      await ready(b, second.searchId);
      expect(
        await prisma.game.count({
          where: { participants: { some: { userId: a.id } } },
        }),
      ).toBe(0);
      await joinQueue(a);
      await as(a)
        .post('/matchmaking/cancel', { searchId: (await status(a)).searchId })
        .expect(200);
      await app.close();
      await startApp();
      expect((await status(a)).state).toBe('idle');
      expect((await status(a)).revision).toBeGreaterThan(first.revision);
    });

    it('recovers waiting, reserved readiness and match assignment after backend restarts and client disconnects', async () => {
      const [a, b] = [await account(), await account()];
      const tab = connect(a);
      await tab.ready;
      const first = await joinQueue(a);
      tab.socket.disconnect();
      await app.close();
      await startApp();
      expect(await status(a)).toMatchObject({
        searchId: first.searchId,
        state: 'searching',
      });
      const second = await joinQueue(b);
      await ready(a, first.searchId);
      await app.close();
      await startApp();
      expect(await status(a)).toMatchObject({
        state: 'confirming',
        ready: true,
      });
      const assigned = await ready(b, second.searchId);
      await app.close();
      await startApp();
      expect(await status(a)).toMatchObject({
        state: 'matched',
        gameId: assigned.gameId,
      });
      expect(await status(b)).toMatchObject({
        state: 'matched',
        gameId: assigned.gameId,
      });
      expect(
        (await as(a).get(`/games/${assigned.gameId}`).expect(200)).body.game
          .mode,
      ).toBe('random');
    });

    it('delivers only personal assignments to every tab and lets two real socket clients finish a persisted checkmate game', async () => {
      const [a, b, stranger] = [
        await account(),
        await account(),
        await account(),
      ];
      const [tab1, tab2, other, outsider] = [
        connect(a),
        connect(a),
        connect(b),
        connect(stranger),
      ];
      await Promise.all([tab1.ready, tab2.ready, other.ready, outsider.ready]);
      const gameId = await match(a, b);
      await Promise.all([
        tab1.next('matchmaking.found'),
        tab2.next('matchmaking.found'),
        other.next('matchmaking.found'),
      ]);
      expect(
        outsider.events.some((event) => event.type.startsWith('matchmaking.')),
      ).toBe(false);
      tab1.socket.disconnect(); // Closing one tab does not revoke the other tab's match.
      expect((await status(a)).gameId).toBe(gameId);
      await as(stranger).get(`/games/${gameId}`).expect(404);
      expect(await outsider.join(`game:${gameId}`)).toMatchObject({
        ok: false,
      });
      expect(await tab2.join(`game:${gameId}`)).toEqual({ ok: true });
      expect(await other.join(`game:${gameId}`)).toEqual({ ok: true });
      const initial = (await as(a).get(`/games/${gameId}`)).body.game;
      const players =
        initial.viewer.color === 'w' ? [tab2, other] : [other, tab2];
      let revision = initial.revision;
      for (const [i, uci] of ['f2f3', 'e7e5', 'g2g4', 'd8h4'].entries()) {
        clock.advance(250);
        const ack = await players[i % 2].send('game.move', {
          gameId,
          requestId: randomUUID(),
          expectedRevision: revision,
          from: uci.slice(0, 2),
          to: uci.slice(2, 4),
        });
        expect(ack.ok).toBe(true);
        revision = ack.game.revision;
      }
      const final = (await as(a).get(`/games/${gameId}`).expect(200)).body.game;
      expect(final.status).toMatchObject({
        phase: 'finished',
        result: { outcome: 'black', reason: 'checkmate' },
      });
      expect(final.moves).toHaveLength(4);
      expect(final.pgn).toContain('0-1');
      expect(final.clocks.remainingMs.w).toBe(
        blitz.initialMs + 2 * (blitz.incrementMs - 250),
      );
      const durable = await prisma.game.findUnique({
        where: { id: gameId },
        include: { moves: true },
      });
      expect(durable?.status).toBe('FINISHED');
      expect(durable?.moves).toHaveLength(4);
      expect(
        (await as(a).get('/games').expect(200)).body.items[0],
      ).toMatchObject({ id: gameId, mode: 'random' });
      expect((await status(a)).state).toBe('idle');
      expect((await joinQueue(a)).state).toBe('searching');
    });
  },
);
