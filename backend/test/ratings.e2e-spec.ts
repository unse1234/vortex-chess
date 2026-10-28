import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomBytes, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import type { PrismaService as PrismaType } from '../src/database/prisma.service';
import type { GameCommandsService as CommandsType } from '../src/modules/games/services/game-commands.service';
import type { MatchmakingService as QueueType } from '../src/modules/matchmaking/matchmaking.service';
import type { RatingsService as RatingsType } from '../src/modules/ratings/ratings.service';

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const origin = 'http://localhost:3000';
const blitz = { initialMs: 180000, incrementMs: 2000 };
const bullet = { initialMs: 60000, incrementMs: 0 };
const rapid = { initialMs: 600000, incrementMs: 0 };
type Account = { id: string; username: string; token: string };
type Envelope = { type: string; payload: any };
class FakeClock {
  value = Date.now();
  now() {
    return this.value;
  }
}
async function waitFor<T>(check: () => T | Promise<T>) {
  const started = Date.now();
  for (;;) {
    const result = await check();
    if (result) return result;
    if (Date.now() - started > 5000)
      throw new Error('Timed out waiting for committed event');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

suite('Ratings: real PostgreSQL, HTTP, sockets and atomic settlement', () => {
  let app: NestExpressApplication;
  let prisma: PrismaType;
  let commands: CommandsType;
  let queue: QueueType;
  let ratings: RatingsType;
  let baseUrl: string;
  let clock: FakeClock;
  const ids = new Set<string>();
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
      RATINGS_ENABLED: 'true',
      MATCHMAKING_ENABLED: 'true',
      MATCHMAKING_RATING_WINDOWS: '15:100,30:200,60:400',
    });
    const { AppModule } =
      require('../dist/app.module') as typeof import('../src/app.module');
    const { configureApp } =
      require('../dist/configure-app') as typeof import('../src/configure-app');
    const { PrismaService } =
      require('../dist/database/prisma.service') as typeof import('../src/database/prisma.service');
    const { GameCommandsService } =
      require('../dist/modules/games/services/game-commands.service') as typeof import('../src/modules/games/services/game-commands.service');
    const { MatchmakingService } =
      require('../dist/modules/matchmaking/matchmaking.service') as typeof import('../src/modules/matchmaking/matchmaking.service');
    const { RatingsService } =
      require('../dist/modules/ratings/ratings.service') as typeof import('../src/modules/ratings/ratings.service');
    const { ServerClock } =
      require('../dist/modules/games/clocks/server-clock') as typeof import('../src/modules/games/clocks/server-clock');
    const fixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ServerClock)
      .useValue(clock)
      .compile();
    const instance = fixture.createNestApplication<NestExpressApplication>({
      bodyParser: false,
    });
    configureApp(instance);
    await instance.listen(0, '127.0.0.1');
    app = instance;
    prisma = app.get(PrismaService);
    commands = app.get(GameCommandsService);
    queue = app.get(MatchmakingService);
    ratings = app.get(RatingsService);
    baseUrl = `http://127.0.0.1:${(server().address() as AddressInfo).port}`;
    return instance;
  }
  async function account(): Promise<Account> {
    const suffix = randomUUID().slice(0, 8);
    const username = `Rt_${suffix}`;
    const { AuthService } =
      require('../dist/modules/auth/auth.service') as typeof import('../src/modules/auth/auth.service');
    const { body } = await app
      .get(AuthService)
      .register({
        username,
        email: `${suffix}@ratings.invalid`,
        password: 'correct-password-123',
        confirmPassword: 'correct-password-123',
        acceptTerms: true,
      });
    ids.add(body.user.id);
    return { id: body.user.id, username, token: body.accessToken };
  }
  const as = (user: Account, instance = app) => ({
    get: (path: string) =>
      request(instance.getHttpServer())
        .get(`/api${path}`)
        .set('Authorization', `Bearer ${user.token}`),
    post: (path: string, body: object = {}) =>
      request(instance.getHttpServer())
        .post(`/api${path}`)
        .set('Authorization', `Bearer ${user.token}`)
        .send(body),
  });
  const join = async (user: Account, rated = true, timeControl = blitz) =>
    (
      await as(user)
        .post('/matchmaking/join', { timeControl, rated })
        .expect(200)
    ).body;
  const status = async (user: Account) =>
    (await as(user).get('/matchmaking').expect(200)).body;
  const snapshot = async (user: Account, id: string) =>
    (await as(user).get(`/games/${id}`).expect(200)).body.game;
  async function match(
    a: Account,
    b: Account,
    rated = true,
    timeControl = blitz,
  ) {
    const first = await join(a, rated, timeControl);
    const second = await join(b, rated, timeControl);
    expect(second.state).toBe('confirming');
    await as(a)
      .post('/matchmaking/ready', { searchId: first.searchId })
      .expect(200);
    const ready = (
      await as(b)
        .post('/matchmaking/ready', { searchId: second.searchId })
        .expect(200)
    ).body;
    expect(ready.state).toBe('matched');
    return snapshot(a, ready.gameId);
  }
  const resign = (user: Account, id: string, requestId = randomUUID()) =>
    as(user).post(`/games/${id}/resign`, { requestId });
  async function draw(a: Account, b: Account, id: string) {
    await as(a)
      .post(`/games/${id}/draw-offer`, { requestId: randomUUID() })
      .expect(200);
    return (
      await as(b)
        .post(`/games/${id}/draw-offer/response`, {
          requestId: randomUUID(),
          response: 'accept',
        })
        .expect(200)
    ).body.game;
  }
  async function profile(
    user: Account,
    pool: 'bullet' | 'blitz' | 'rapid',
    rating: number,
    games = 0,
    eligible = true,
  ) {
    return prisma.playerRating.upsert({
      where: { userId_pool: { userId: user.id, pool } },
      create: {
        userId: user.id,
        pool,
        rating,
        peakRating: rating,
        games,
        draws: games,
        leaderboardEligible: eligible,
      },
      update: {
        rating,
        peakRating: rating,
        games,
        draws: games,
        wins: 0,
        losses: 0,
        leaderboardEligible: eligible,
      },
    });
  }
  async function connect(user: Account) {
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
    socket.on('event', (e: Envelope) => events.push(e));
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
    });
    return {
      socket,
      events,
      join: (id: string) =>
        socket
          .timeout(4000)
          .emitWithAck('channel.join', { channel: `game:${id}` }),
    };
  }
  beforeEach(async () => {
    clock = new FakeClock();
    await startApp();
  }, 60000);
  afterEach(async () => {
    for (const socket of sockets.splice(0)) socket.disconnect();
    if (prisma) {
      await prisma.game.deleteMany({
        where: { participants: { some: { userId: { in: [...ids] } } } },
      });
      await prisma.room.deleteMany({ where: { hostId: { in: [...ids] } } });
      await prisma.user.deleteMany({ where: { id: { in: [...ids] } } });
    }
    ids.clear();
    await app?.close();
  });

  it('authenticates reads, validates paging/pools and rejects client-controlled ratings/results', async () => {
    const a = await account();
    for (const path of [
      '/ratings/me',
      '/ratings/me/history',
      '/leaderboard?pool=blitz',
      '/leaderboard/me?pool=blitz',
    ])
      await request(server()).get(`/api${path}`).expect(401);
    for (const path of [
      '/leaderboard?pool=classical',
      '/leaderboard?pool=blitz&limit=101',
      '/leaderboard?pool=blitz&page=0',
      '/ratings/me?userId=someone',
      '/ratings/me/history?pool=unknown',
      '/ratings/me/history?cursor=broken',
    ]) {
      await as(a).get(path).expect(400);
    }
    for (const body of [
      { rating: 2500 },
      { delta: 32 },
      { ratingPool: 'bullet' },
      { policyVersion: 'evil' },
      { userId: randomUUID() },
    ])
      await as(a)
        .post('/matchmaking/join', { timeControl: blitz, rated: true, ...body })
        .expect(400);
    await as(a)
      .post('/matchmaking/join', {
        timeControl: { initialMs: 1800000, incrementMs: 0 },
        rated: true,
      })
      .expect(400);
    await as(a).post('/ratings/me', { rating: 2500 }).expect(404);
    await as(a).post('/ratings/settle', { result: 'win' }).expect(404);
    const mine = (await as(a).get('/ratings/me').expect(200)).body;
    expect(
      mine.items.map((p: any) => [p.pool, p.rating, p.games, p.provisional]),
    ).toEqual([
      ['bullet', 1200, 0, true],
      ['blitz', 1200, 0, true],
      ['rapid', 1200, 0, true],
    ]);
    expect((await as(a).get('/leaderboard?pool=blitz')).body.limit).toBe(25);
    expect(JSON.stringify(mine)).not.toMatch(/email|password|token/);
  });

  it('separates rated/casual and exact increments, initializes profiles once and preserves stale cancellation safety', async () => {
    const [a, b, c] = await Promise.all([account(), account(), account()]);
    const first = await join(a);
    await join(b, false);
    await join(c, true, { ...blitz, incrementMs: 0 });
    expect((await status(a)).state).toBe('searching');
    expect((await status(b)).state).toBe('searching');
    await as(a)
      .post('/matchmaking/join', { timeControl: blitz, rated: false })
      .expect(409);
    await Promise.all(Array.from({ length: 5 }, () => join(a)));
    expect(await prisma.playerRating.count({ where: { userId: a.id } })).toBe(
      1,
    );
    await as(a)
      .post('/matchmaking/cancel', { searchId: first.searchId })
      .expect(200);
    const next = await join(a);
    await as(a)
      .post('/matchmaking/cancel', { searchId: first.searchId })
      .expect(200);
    expect(await status(a)).toMatchObject({
      searchId: next.searchId,
      state: 'searching',
      rated: true,
      ratingPool: 'blitz',
    });
  });

  it('widens both current windows, prefers oldest compatible and pairs existing searches without a new join', async () => {
    const [a, b, c] = await Promise.all([account(), account(), account()]);
    await profile(a, 'blitz', 1200);
    await profile(b, 'blitz', 1550);
    await profile(c, 'blitz', 1550);
    await join(a);
    await join(b);
    await prisma.matchmakingSearch.update({
      where: { userId: a.id },
      data: { queuedAt: new Date(Date.now() - 61000) },
    });
    expect((await status(a)).state).toBe('searching'); // New opponent's own window still only 100.
    await prisma.matchmakingSearch.update({
      where: { userId: b.id },
      data: { queuedAt: new Date(Date.now() - 31000) },
    });
    await queue.sweep();
    expect((await status(a)).state).toBe('confirming');
    expect((await status(b)).state).toBe('confirming');
    await join(c);
    expect((await status(c)).state).toBe('searching');
  });

  it('does not rate failed arrivals or cancellations and snapshots the authoritative profile at game creation', async () => {
    const [a, b] = await Promise.all([account(), account()]);
    const first = await join(a);
    const second = await join(b);
    await prisma.matchmakingSearch.updateMany({
      where: { userId: { in: [a.id, b.id] } },
      data: { expiresAt: new Date(0) },
    });
    await as(a)
      .post('/matchmaking/ready', { searchId: first.searchId })
      .expect(200);
    expect((await status(b)).state).toBe('idle');
    expect(await prisma.game.count()).toBe(0);
    expect(await prisma.ratingSettlement.count()).toBe(0);
    const freshA = await join(a);
    const freshB = await join(b);
    // Simulate a fresher server profile after waiting. Never trust a queue-entry rating snapshot.
    await profile(a, 'blitz', 1234);
    await as(a)
      .post('/matchmaking/ready', { searchId: freshA.searchId })
      .expect(200);
    const ready = (
      await as(b)
        .post('/matchmaking/ready', { searchId: freshB.searchId })
        .expect(200)
    ).body;
    const game = await snapshot(a, ready.gameId);
    expect(game.rating.snapshots[game.viewer.color].rating).toBe(1234);
    await expect(
      prisma.game.update({
        where: { id: game.id },
        data: { rated: false, ratingPool: null, ratingPolicyVersion: null },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.gameParticipant.updateMany({
        where: { gameId: game.id },
        data: { ratingBefore: 5000 },
      }),
    ).rejects.toThrow();
    expect(second.state).toBe('confirming');
  });

  it('settles resignation from the official start, broadcasts committed changes to both clients and survives refresh/reconnect', async () => {
    const [a, b] = await Promise.all([account(), account()]);
    const game = await match(a, b);
    const ca = await connect(a);
    const cb = await connect(b);
    await ca.join(game.id);
    await cb.join(game.id);
    await as(a)
      .post(`/games/${game.id}/resign`, {
        requestId: randomUUID(),
        rating: 2000,
        result: 'win',
        delta: 32,
      })
      .expect(400);
    const requestId = randomUUID();
    const result = (await resign(a, game.id, requestId).expect(200)).body.game;
    const own = result.rating.changes[game.viewer.color];
    expect(own).toMatchObject({
      before: 1200,
      delta: -16,
      after: 1184,
      score: 0,
    });
    expect(
      await prisma.playerRating.findUnique({
        where: { userId_pool: { userId: a.id, pool: 'blitz' } },
      }),
    ).toMatchObject({
      games: 1,
      losses: 1,
      wins: 0,
      draws: 0,
      peakRating: 1200,
    });
    for (const client of [ca, cb]) {
      const event = await waitFor(() =>
        client.events.find(
          (e) =>
            e.type === 'game.updated' && e.payload.status.phase === 'finished',
        ),
      );
      expect(event.payload.rating).toEqual(result.rating);
      await waitFor(() =>
        client.events.find((e) => e.type === 'ratings.updated'),
      );
    }
    const duplicate = (await resign(a, game.id, requestId).expect(200)).body;
    expect(duplicate.duplicate).toBe(true);
    expect(
      await prisma.ratingSettlement.count({ where: { gameId: game.id } }),
    ).toBe(1);
    expect(
      await prisma.ratingChange.count({ where: { gameId: game.id } }),
    ).toBe(2);
    ca.socket.disconnect();
    const refreshed = await snapshot(a, game.id);
    expect(refreshed.rating).toEqual(result.rating);
    const reconnect = await connect(a);
    await reconnect.join(game.id);
    expect(
      (
        await waitFor(() =>
          reconnect.events.find((e) => e.type === 'game.snapshot'),
        )
      ).payload.game.rating,
    ).toEqual(result.rating);
    const changes = (
      await as(a).get('/ratings/me/history?pool=blitz').expect(200)
    ).body.items;
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      gameId: game.id,
      before: 1200,
      delta: -16,
      after: 1184,
      policyVersion: 'elo-v1',
    });
    expect(JSON.stringify(changes)).not.toMatch(/email|password|token/);
    const history = (await as(b).get('/games')).body.items[0];
    expect(history).toMatchObject({
      rated: true,
      ratingPool: 'blitz',
      ratingChange: { delta: 16 },
    });
    const next = await match(a, b);
    expect(next.rating.snapshots[next.viewer.color].rating).toBe(1184);
  });

  it('settles a complete legal checkmate with the final move in the same transaction', async () => {
    const [a, b] = await Promise.all([account(), account()]);
    let game = await match(a, b);
    const white = game.players.w.id === a.id ? a : b;
    const black = white === a ? b : a;
    for (const [user, uci] of [
      [white, 'f2f3'],
      [black, 'e7e5'],
      [white, 'g2g4'],
      [black, 'd8h4'],
    ] as const) {
      const response = await as(user)
        .post(`/games/${game.id}/moves`, {
          requestId: randomUUID(),
          expectedRevision: game.revision,
          from: uci.slice(0, 2),
          to: uci.slice(2, 4),
        })
        .expect(200);
      game = response.body.game;
    }
    expect(game.status.result).toMatchObject({
      outcome: 'black',
      reason: 'checkmate',
    });
    expect(game.rating.changes).toMatchObject({
      w: { delta: -16 },
      b: { delta: 16 },
    });
    expect(await prisma.gameMove.count({ where: { gameId: game.id } })).toBe(4);
    expect(
      await prisma.ratingChange.count({ where: { gameId: game.id } }),
    ).toBe(2);
  });

  it('settles unequal-rating draws and maintains independent pools', async () => {
    const [a, b] = await Promise.all([account(), account()]);
    await profile(a, 'blitz', 1200);
    await profile(b, 'blitz', 1280);
    const first = await match(a, b);
    const result = await draw(a, b, first.id);
    expect(result.rating.changes[first.viewer.color]).toMatchObject({
      before: 1200,
      delta: 4,
      after: 1204,
      score: 0.5,
    });
    for (const tc of [bullet, rapid]) {
      const game = await match(a, b, true, tc);
      await draw(a, b, game.id);
    }
    const mine = (await as(a).get('/ratings/me')).body.items;
    expect(mine.map((p: any) => [p.pool, p.rating, p.games, p.draws])).toEqual([
      ['bullet', 1200, 1, 1],
      ['blitz', 1204, 1, 1],
      ['rapid', 1200, 1, 1],
    ]);
  });

  it('applies the shared floor without creating rating points', async () => {
    const [a, b] = await Promise.all([account(), account()]);
    await profile(a, 'blitz', 100);
    await profile(b, 'blitz', 101);
    const game = await match(a, b);
    await resign(a, game.id).expect(200);
    const profiles = await prisma.playerRating.findMany({
      where: { userId: { in: [a.id, b.id] }, pool: 'blitz' },
    });
    expect(profiles.map((p) => p.rating).sort()).toEqual([100, 101]);
    expect(profiles.reduce((n, p) => n + p.rating, 0)).toBe(201);
    expect(
      (
        await prisma.ratingSettlement.findUniqueOrThrow({
          where: { gameId: game.id },
        })
      ).appliedDeltaWhite,
    ).toBe(0);
  });

  it('completes provisional status after exactly 10 settlements and paginates personal history', async () => {
    const [a, b] = await Promise.all([account(), account()]);
    for (let i = 1; i <= 10; i++) {
      const game = await match(a, b);
      await draw(a, b, game.id);
      if (i === 9) {
        expect(
          (await as(a).get('/leaderboard/me?pool=blitz')).body,
        ).toMatchObject({
          status: 'provisional',
          placementsRemaining: 1,
          rank: null,
        });
        expect(
          (await as(a).get('/leaderboard?pool=blitz')).body.items,
        ).toHaveLength(0);
      }
    }
    expect((await as(a).get('/leaderboard/me?pool=blitz')).body).toMatchObject({
      status: 'ranked',
      games: 10,
      rank: 1,
      provisional: false,
    });
    expect(
      (await as(a).get('/leaderboard?pool=blitz')).body.items.map(
        (p: any) => p.rank,
      ),
    ).toEqual([1, 1]);
    const first = (await as(a).get('/ratings/me/history?pool=blitz&limit=6'))
      .body;
    const second = (
      await as(a).get(
        `/ratings/me/history?pool=blitz&limit=6&cursor=${encodeURIComponent(first.nextCursor)}`,
      )
    ).body;
    expect(first.items).toHaveLength(6);
    expect(second.items).toHaveLength(4);
    expect(second.nextCursor).toBeNull();
    expect(
      new Set([...first.items, ...second.items].map((i: any) => i.gameId)).size,
    ).toBe(10);
  }, 60000);

  it('rolls back result, command, both profiles and audit changes when settlement persistence fails', async () => {
    const [a, b] = await Promise.all([account(), account()]);
    const game = await match(a, b);
    const listener = await connect(b);
    await listener.join(game.id);
    const fn = `rating_fail_${randomUUID().replaceAll('-', '')}`;
    await prisma.$executeRawUnsafe(
      `CREATE FUNCTION ${fn}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected rating write failure'; END $$`,
    );
    await prisma.$executeRawUnsafe(
      `CREATE TRIGGER ${fn} BEFORE INSERT ON "RatingChange" FOR EACH ROW EXECUTE FUNCTION ${fn}()`,
    );
    const requestId = randomUUID();
    try {
      const failed = await resign(a, game.id, requestId).expect(503);
      expect(failed.body.code).toBe('command_not_saved');
      expect(
        (await prisma.game.findUniqueOrThrow({ where: { id: game.id } }))
          .status,
      ).toBe('ACTIVE');
      expect(
        await prisma.gameCommand.count({ where: { gameId: game.id } }),
      ).toBe(0);
      expect(
        await prisma.ratingSettlement.count({ where: { gameId: game.id } }),
      ).toBe(0);
      expect(
        await prisma.ratingChange.count({ where: { gameId: game.id } }),
      ).toBe(0);
      expect(
        (
          await prisma.playerRating.findMany({
            where: { userId: { in: [a.id, b.id] } },
          })
        ).every((p) => p.games === 0 && p.rating === 1200),
      ).toBe(true);
      expect(
        listener.events.some(
          (e) =>
            e.type === 'game.updated' && e.payload.status.phase === 'finished',
        ),
      ).toBe(false);
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER ${fn} ON "RatingChange"`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION ${fn}()`);
    }
    await resign(a, game.id, requestId).expect(200);
    expect(
      await prisma.ratingChange.count({ where: { gameId: game.id } }),
    ).toBe(2);
  });

  it('serializes duplicate settlement callers and concurrent timeout/resignation without double counting', async () => {
    const [a, b] = await Promise.all([account(), account()]);
    const game = await match(a, b);
    clock.value += blitz.initialMs + 1;
    await Promise.all([
      commands.checkTimeout(game.id),
      resign(a, game.id),
      resign(b, game.id),
    ]);
    await Promise.all(
      Array.from({ length: 8 }, () =>
        prisma.$transaction((tx) => ratings.settleInTx(tx, game.id), {
          maxWait: 10000,
          timeout: 10000,
        }),
      ),
    );
    expect(
      await prisma.ratingSettlement.count({ where: { gameId: game.id } }),
    ).toBe(1);
    expect(
      await prisma.ratingChange.count({ where: { gameId: game.id } }),
    ).toBe(2);
    const profiles = await prisma.playerRating.findMany({
      where: { userId: { in: [a.id, b.id] } },
    });
    expect(profiles.map((p) => p.games)).toEqual([1, 1]);
    expect(profiles.reduce((n, p) => n + p.rating, 0)).toBe(2400);
  });

  it('retries real rolled-back database conflicts with a bound, committing settlement exactly once', async () => {
    const [a, b] = await Promise.all([account(), account()]);
    const game = await match(a, b);
    const fn = `rating_retry_${randomUUID().replaceAll('-', '')}`;
    await prisma.$executeRawUnsafe(`CREATE SEQUENCE ${fn}`);
    await prisma.$executeRawUnsafe(`CREATE FUNCTION ${fn}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF nextval('${fn}') <= 2 THEN RAISE EXCEPTION 'injected serialization failure' USING ERRCODE = '40001'; END IF;
      RETURN NEW; END $$`);
    await prisma.$executeRawUnsafe(
      `CREATE TRIGGER ${fn} BEFORE INSERT ON "RatingSettlement" FOR EACH ROW EXECUTE FUNCTION ${fn}()`,
    );
    try {
      await resign(a, game.id).expect(200);
      expect(
        await prisma.ratingChange.count({ where: { gameId: game.id } }),
      ).toBe(2);
      expect(
        (
          await prisma.playerRating.findMany({
            where: { userId: { in: [a.id, b.id] } },
          })
        ).every((p) => p.games === 1),
      ).toBe(true);
      const attempts = await prisma.$queryRawUnsafe<{ last_value: bigint }[]>(
        `SELECT last_value FROM ${fn}`,
      );
      expect(Number(attempts[0].last_value)).toBe(3);
    } finally {
      await prisma.$executeRawUnsafe(
        `DROP TRIGGER ${fn} ON "RatingSettlement"`,
      );
      await prisma.$executeRawUnsafe(`DROP FUNCTION ${fn}()`);
      await prisma.$executeRawUnsafe(`DROP SEQUENCE ${fn}`);
    }
  });

  it('claims one official result across two independent backend instances', async () => {
    const [a, b] = await Promise.all([account(), account()]);
    const game = await match(a, b);
    const firstApp = app;
    const secondApp = await startApp();
    try {
      const results = await Promise.all([
        as(a, firstApp).post(`/games/${game.id}/resign`, {
          requestId: randomUUID(),
        }),
        as(b, secondApp).post(`/games/${game.id}/resign`, {
          requestId: randomUUID(),
        }),
      ]);
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      expect(
        await prisma.ratingChange.count({ where: { gameId: game.id } }),
      ).toBe(2);
      expect(
        (
          await prisma.playerRating.findMany({
            where: { userId: { in: [a.id, b.id] } },
          })
        ).every((p) => p.games === 1),
      ).toBe(true);
    } finally {
      await firstApp.close();
    }
  });

  it('recovers rated game settings across restart, then settles once and rejects a new game until the current one ends', async () => {
    const [a, b] = await Promise.all([account(), account()]);
    const game = await match(a, b);
    expect((await join(a)).gameId).toBe(game.id); // Existing assignment, never a second game.
    await app.close();
    await startApp();
    const resumed = await snapshot(a, game.id);
    expect(resumed.rating).toEqual(game.rating);
    expect(resumed.revision).toBeGreaterThan(game.revision);
    await resign(a, game.id).expect(200);
    await app.close();
    await startApp();
    expect(
      (await snapshot(a, game.id)).rating.changes[game.viewer.color].after,
    ).toBe(1184);
    expect(
      (await as(a).get('/ratings/me')).body.items.find(
        (p: any) => p.pool === 'blitz',
      ).games,
    ).toBe(1);
  });

  it('keeps casual random games and historical friend/engine games rating-ineligible', async () => {
    const [a, b] = await Promise.all([account(), account()]);
    const game = await match(a, b, false);
    expect(game.rating.rated).toBe(false);
    await resign(a, game.id).expect(200);
    for (const mode of ['FRIENDS', 'ENGINE'] as const) {
      const historical = await prisma.game.create({
        data: {
          mode,
          initialFen: game.initialFen,
          fen: game.initialFen,
          initialMs: 180000,
          incrementMs: 2000,
          whiteRemainingMs: 180000,
          blackRemainingMs: 180000,
          startedAt: new Date(),
          endedAt: new Date(),
          status: 'FINISHED',
          result: 'DRAW',
          termination: 'AGREEMENT',
          participants: {
            create:
              mode === 'ENGINE'
                ? [
                    { color: 'WHITE', userId: a.id },
                    {
                      color: 'BLACK',
                      kind: 'ENGINE',
                      engineName: 'Test engine',
                    },
                  ]
                : [
                    { color: 'WHITE', userId: a.id },
                    { color: 'BLACK', userId: b.id },
                  ],
          },
        },
      });
      expect(
        await prisma.$transaction((tx) =>
          ratings.settleInTx(tx, historical.id),
        ),
      ).toBeNull();
    }
    expect(
      await prisma.playerRating.count({
        where: { userId: { in: [a.id, b.id] } },
      }),
    ).toBe(0);
    expect(await prisma.ratingChange.count()).toBe(0);
    expect(
      (await as(a).get('/games')).body.items.every(
        (g: any) => !g.rated && g.ratingChange === null,
      ),
    ).toBe(true);
  });

  it('uses global competition ranks, deterministic tie ordering and bounded server pagination', async () => {
    const users = await Promise.all(Array.from({ length: 7 }, () => account()));
    for (const [index, value] of [
      1600, 1500, 1500, 1400, 2500, 3000, 2000,
    ].entries())
      await profile(
        users[index],
        'blitz',
        value,
        index === 4 ? 9 : 10,
        index !== 5,
      );
    // A different pool must not influence blitz rankings.
    await profile(users[6], 'rapid', 3500, 10);
    const first = (await as(users[0]).get('/leaderboard?pool=blitz&limit=2'))
      .body;
    const second = (
      await as(users[0]).get('/leaderboard?pool=blitz&limit=2&page=2')
    ).body;
    const third = (
      await as(users[0]).get('/leaderboard?pool=blitz&limit=2&page=3')
    ).body;
    const all = [...first.items, ...second.items, ...third.items];
    expect(first.total).toBe(5);
    expect(all.map((p) => p.rank)).toEqual([1, 2, 3, 3, 5]);
    expect(all.filter((p) => p.rating === 1500).map((p) => p.user.id)).toEqual(
      [users[1].id, users[2].id].sort(),
    );
    expect(
      (await as(users[3]).get('/leaderboard/me?pool=blitz')).body,
    ).toMatchObject({ status: 'ranked', rank: 5 });
    expect(
      (await as(users[4]).get('/leaderboard/me?pool=blitz')).body.status,
    ).toBe('provisional');
    expect(
      (await as(users[5]).get('/leaderboard/me?pool=blitz')).body.status,
    ).toBe('ineligible');
    expect(
      (await as(users[0]).get('/leaderboard?pool=bullet')).body.items,
    ).toEqual([]);
    expect(
      (await as(users[0]).get('/leaderboard?pool=blitz&page=10')).body.items,
    ).toEqual([]);
    expect(JSON.stringify(all)).not.toMatch(
      /email|password|token|leaderboardEligible/,
    );
  });
});
