import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomBytes, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import type { PrismaService as PrismaType } from '../src/database/prisma.service';
import type { EmailWorkerService as WorkerType } from '../src/modules/mail/email-worker.service';
import type { PresenceService as PresenceType } from '../src/modules/realtime/presence.service';
import type { MailMessage } from '../src/modules/mail/mail-transport';

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const origin = 'http://localhost:3000';
const timeControl = { initialMs: 180000, incrementMs: 2000 };
type Account = { id: string; username: string; email: string; token: string };
async function waitFor<T>(fn: () => T | Promise<T>) {
  const start = Date.now();
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() - start > 5000) throw new Error('Timed out');
    await new Promise((r) => setTimeout(r, 20));
  }
}

suite(
  'Social management: PostgreSQL, HTTP, sockets and conflicting transactions',
  () => {
    let app: NestExpressApplication;
    let prisma: PrismaType;
    let worker: WorkerType;
    let presence: PresenceType;
    let baseUrl: string;
    let sent: MailMessage[];
    const ids = new Set<string>();
    const sockets: Socket[] = [];
    const api = (user: Account) => ({
      get: (path: string) =>
        request(app.getHttpServer())
          .get(`/api${path}`)
          .set('Authorization', `Bearer ${user.token}`),
      post: (path: string, body: object = {}) =>
        request(app.getHttpServer())
          .post(`/api${path}`)
          .set('Authorization', `Bearer ${user.token}`)
          .send(body),
      delete: (path: string) =>
        request(app.getHttpServer())
          .delete(`/api${path}`)
          .set('Authorization', `Bearer ${user.token}`),
    });
    async function account(): Promise<Account> {
      const tag = randomUUID().slice(0, 8);
      const { AuthService } =
        require('../dist/modules/auth/auth.service') as typeof import('../src/modules/auth/auth.service');
      const email = `${tag}@social.invalid`;
      const result = await app.get(AuthService).register({
        username: `Soc_${tag}`,
        email,
        password: 'correct-password-123',
        confirmPassword: 'correct-password-123',
        acceptTerms: true,
      });
      ids.add(result.body.user.id);
      return { ...result.body.user, email, token: result.body.accessToken };
    }
    async function send(a: Account, b: Account) {
      return (
        await api(a).post('/social/requests', { userId: b.id }).expect(200)
      ).body.relationship.requestId as string;
    }
    async function befriend(a: Account, b: Account) {
      const id = await send(a, b);
      await api(b).post(`/social/requests/${id}/accept`).expect(200);
      return id;
    }
    async function room(a: Account) {
      return (await api(a).post('/rooms', { timeControl }).expect(201)).body
        .room;
    }
    const invite = (a: Account, roomId: string, recipient: string) =>
      api(a).post(`/rooms/${roomId}/invitations`, { recipient });
    const block = (a: Account, b: Account) =>
      api(a).post('/social/blocks', { userId: b.id });
    async function connect(a: Account) {
      const socket = io(baseUrl, {
        path: '/api/socket.io',
        auth: { token: a.token },
        transports: ['websocket'],
        extraHeaders: { Origin: origin },
        forceNew: true,
        reconnection: false,
      });
      sockets.push(socket);
      const events: { type: string; payload: any }[] = [];
      socket.on('event', (event) => events.push(event));
      await new Promise<void>((resolve, reject) => {
        socket.once('connect', resolve);
        socket.once('connect_error', reject);
      });
      return { socket, events };
    }
    beforeAll(async () => {
      Object.assign(process.env, {
        NODE_ENV: 'test',
        DATABASE_URL: databaseUrl,
        JWT_ACCESS_SECRET: randomBytes(48).toString('hex'),
        CORS_ORIGINS: origin,
        COOKIE_SECURE: 'false',
        COOKIE_SAME_SITE: 'lax',
        EXPIRY_SWEEP_INTERVAL_SECONDS: '0',
        MAIL_WORKER_INTERVAL_SECONDS: '0',
        PRESENCE_DISCONNECT_GRACE_MS: '60',
        FRIEND_REQUEST_COOLDOWN_SECONDS: '300',
        FRIEND_REQUEST_MAX_PER_HOUR: '30',
        RATINGS_ENABLED: 'true',
        MATCHMAKING_ENABLED: 'true',
      });
      const { AppModule } =
        require('../dist/app.module') as typeof import('../src/app.module');
      const { configureApp } =
        require('../dist/configure-app') as typeof import('../src/configure-app');
      const { PrismaService } =
        require('../dist/database/prisma.service') as typeof import('../src/database/prisma.service');
      const { EmailWorkerService } =
        require('../dist/modules/mail/email-worker.service') as typeof import('../src/modules/mail/email-worker.service');
      const { PresenceService } =
        require('../dist/modules/realtime/presence.service') as typeof import('../src/modules/realtime/presence.service');
      const { MAIL_TRANSPORT } =
        require('../dist/modules/mail/mail-transport') as typeof import('../src/modules/mail/mail-transport');
      sent = [];
      const fixture = await Test.createTestingModule({ imports: [AppModule] })
        .overrideGuard(ThrottlerGuard)
        .useValue({ canActivate: () => true })
        .overrideProvider(MAIL_TRANSPORT)
        .useValue({
          name: 'fake',
          send: async (message: MailMessage) => {
            sent.push(message);
            return { messageId: randomUUID(), response: '250 accepted' };
          },
        })
        .compile();
      app = fixture.createNestApplication<NestExpressApplication>({
        bodyParser: false,
      });
      configureApp(app);
      await app.listen(0, '127.0.0.1');
      prisma = app.get(PrismaService);
      worker = app.get(EmailWorkerService);
      presence = app.get(PresenceService);
      baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
    });
    afterEach(async () => {
      for (const socket of sockets.splice(0)) socket.disconnect();
      const userIds = [...ids];
      await prisma.game.deleteMany({
        where: { participants: { some: { userId: { in: userIds } } } },
      });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      ids.clear();
      sent.length = 0;
      app.get(ConfigService).set('FRIEND_REQUEST_MAX_PER_HOUR', 30);
    });
    afterAll(async () => {
      await app?.close();
    });

    it('authenticates and validates bounded, private, normalized search and private lists', async () => {
      const preflight = await request(app.getHttpServer())
        .options('/api/social/friends/00000000-0000-4000-8000-000000000001')
        .set('Origin', origin)
        .set('Access-Control-Request-Method', 'DELETE')
        .set('Access-Control-Request-Headers', 'authorization,x-vortix-csrf')
        .expect(204);
      expect(preflight.headers['access-control-allow-origin']).toBe(origin);
      expect(
        preflight.headers['access-control-allow-methods'].split(','),
      ).toContain('DELETE');
      const forbiddenOrigin = await request(app.getHttpServer())
        .options('/api/social/blocks')
        .set('Origin', 'https://untrusted.invalid')
        .set('Access-Control-Request-Method', 'DELETE');
      expect(
        forbiddenOrigin.headers['access-control-allow-origin'],
      ).toBeUndefined();
      const [a, b, c] = [await account(), await account(), await account()];
      await request(app.getHttpServer())
        .get('/api/users/search?search=Soc')
        .expect(401);
      await api(a).get('/users/search?search=S').expect(400);
      await api(a).get('/users/search?search=Soc&limit=51').expect(400);
      await api(a)
        .get(`/social/requests?direction=incoming&userId=${b.id}`)
        .expect(400);
      await api(a).get('/social/blocks?cursor=bad').expect(400);
      const id = await send(b, a);
      const found = (
        await api(a)
          .get(`/users/search?search=${b.username.toUpperCase()}`)
          .expect(200)
      ).body.items;
      expect(found).toEqual([
        {
          id: b.id,
          username: b.username,
          avatarUrl: null,
          relationship: { state: 'incoming', requestId: id },
        },
      ]);
      expect(
        (await api(c).get('/social/requests?direction=incoming').expect(200))
          .body.items,
      ).toEqual([]);
      const page1 = (
        await api(a).get('/users/search?search=Soc&limit=1').expect(200)
      ).body;
      const page2 = (
        await api(a)
          .get(`/users/search?search=Soc&limit=1&cursor=${page1.nextCursor}`)
          .expect(200)
      ).body;
      expect(page1.items[0].id).not.toBe(page2.items[0].id);
      expect(JSON.stringify(page1)).not.toMatch(
        /email|password|sessions|usernameKey/,
      );
    });

    it('enforces request actors and preserves identities and notification deduplication', async () => {
      const [a, b, c] = [await account(), await account(), await account()];
      await api(a).post('/social/requests', { userId: a.id }).expect(400);
      await api(a)
        .post('/social/requests', { userId: a.id.toUpperCase() })
        .expect(400);
      const id = await send(a, b);
      expect(await send(a, b)).toBe(id);
      const opposite = (
        await api(b).post('/social/requests', { userId: a.id }).expect(200)
      ).body;
      expect(opposite.relationship).toEqual({
        state: 'incoming',
        requestId: id,
      });
      await api(a).post(`/social/requests/${id}/accept`).expect(403);
      await api(b).post(`/social/requests/${id}/cancel`).expect(403);
      await api(c).post(`/social/requests/${id}/accept`).expect(404);
      await api(b).post(`/social/requests/${id}/accept`).expect(200);
      await api(b).post(`/social/requests/${id}/accept`).expect(200);
      expect(await prisma.friendship.count()).toBe(1);
      expect(
        await prisma.notification.count({ where: { friendRequestId: id } }),
      ).toBe(2);
      expect(
        await prisma.emailJob.count({
          where: { recipientId: { in: [a.id, b.id] } },
        }),
      ).toBe(0);
      const noRequest = (
        await api(a).post('/social/requests', { userId: b.id }).expect(200)
      ).body;
      expect(noRequest.relationship.state).toBe('friends');
    });

    it('declines/cancels idempotently and enforces shared resend cooldown and account rate limits', async () => {
      const [a, b, c] = [await account(), await account(), await account()];
      let id = await send(a, b);
      await api(b).post(`/social/requests/${id}/decline`).expect(200);
      await api(b).post(`/social/requests/${id}/decline`).expect(200);
      await api(a).post('/social/requests', { userId: b.id }).expect(429);
      await api(b).post('/social/requests', { userId: a.id }).expect(429);
      await prisma.friendRequest.update({
        where: { id },
        data: { updatedAt: new Date(Date.now() - 301000) },
      });
      id = await send(a, b);
      await api(a).post(`/social/requests/${id}/cancel`).expect(200);
      await api(a).post(`/social/requests/${id}/cancel`).expect(200);
      expect(
        (await api(b).post(`/social/requests/${id}/accept`).expect(200)).body
          .relationship.state,
      ).toBe('none');
      app.get(ConfigService).set('FRIEND_REQUEST_MAX_PER_HOUR', 2);
      expect(
        (await api(a).post('/social/requests', { userId: c.id }).expect(429))
          .body.code,
      ).toBe('friend_request_rate_limit');
    });

    it('serializes simultaneous opposite sends and concurrent accepts in PostgreSQL', async () => {
      const [a, b] = [await account(), await account()];
      const results = await Promise.all([
        api(a).post('/social/requests', { userId: b.id }),
        api(b).post('/social/requests', { userId: a.id }),
      ]);
      expect(results.map((r) => r.status)).toEqual([200, 200]);
      expect(results.map((r) => r.body.relationship.state).sort()).toEqual([
        'incoming',
        'outgoing',
      ]);
      const rows = await prisma.friendRequest.findMany();
      expect(rows).toHaveLength(1);
      const recipient = rows[0].recipientId === a.id ? a : b;
      const accepted = await Promise.all([
        api(recipient).post(`/social/requests/${rows[0].id}/accept`),
        api(recipient).post(`/social/requests/${rows[0].id}/accept`),
      ]);
      expect(accepted.map((r) => r.status)).toEqual([200, 200]);
      expect(await prisma.friendship.count()).toBe(1);
      expect(
        await prisma.notification.count({
          where: { type: 'FRIEND_REQUEST_ACCEPTED' },
        }),
      ).toBe(1);
      await expect(
        prisma.friendship.create({
          data: { pairLow: rows[0].pairLow, pairHigh: rows[0].pairHigh },
        }),
      ).rejects.toThrow();
      await expect(
        prisma.userBlock.create({ data: { blockerId: a.id, blockedId: a.id } }),
      ).rejects.toThrow();
    });

    it('shares a sender rate budget across concurrent sends to different pairs', async () => {
      const [a, b, c] = [await account(), await account(), await account()];
      app.get(ConfigService).set('FRIEND_REQUEST_MAX_PER_HOUR', 1);
      const responses = await Promise.all([
        api(a).post('/social/requests', { userId: b.id }),
        api(a).post('/social/requests', { userId: c.id }),
      ]);
      expect(responses.map((r) => r.status).sort()).toEqual([200, 429]);
      expect(
        await prisma.friendRequest.count({ where: { senderId: a.id } }),
      ).toBe(1);
      expect(
        await prisma.notification.count({ where: { actorId: a.id } }),
      ).toBe(1);
    });

    it('rolls acceptance back if durable notification persistence fails', async () => {
      const [a, b] = [await account(), await account()];
      const id = await send(a, b);
      const { NotificationsService } =
        require('../dist/modules/notifications/notifications.service') as typeof import('../src/modules/notifications/notifications.service');
      const spy = vi
        .spyOn(app.get(NotificationsService), 'createInTx')
        .mockRejectedValueOnce(
          new Error('simulated notification storage failure'),
        );
      try {
        await api(b).post(`/social/requests/${id}/accept`).expect(500);
        expect(
          (await prisma.friendRequest.findUniqueOrThrow({ where: { id } }))
            .state,
        ).toBe('PENDING');
        expect(await prisma.friendship.count()).toBe(0);
        expect(
          await prisma.notification.count({ where: { friendRequestId: id } }),
        ).toBe(1);
      } finally {
        spy.mockRestore();
      }
    });

    it('serializes accept/cancel and accept/block races without resurrecting friendship', async () => {
      for (const racingAction of ['cancel', 'block'] as const) {
        const [a, b] = [await account(), await account()];
        const id = await send(a, b);
        const results = await Promise.all([
          api(b).post(`/social/requests/${id}/accept`),
          racingAction === 'block'
            ? block(a, b)
            : api(a).post(`/social/requests/${id}/cancel`),
        ]);
        expect(results.every((r) => r.status === 200)).toBe(true);
        const state = (
          await prisma.friendRequest.findUniqueOrThrow({ where: { id } })
        ).state;
        const friendship = await prisma.friendship.findFirst({
          where: { OR: [{ pairLow: a.id }, { pairHigh: a.id }] },
        });
        expect(!!friendship).toBe(
          racingAction !== 'block' && state === 'ACCEPTED',
        );
      }
    });

    it('paginates friends and distinguishes removal from directional blocks and unblock', async () => {
      const [a, b, c] = [await account(), await account(), await account()];
      const id = await befriend(a, b);
      await befriend(a, c);
      const first = (await api(a).get('/social/friends?limit=1').expect(200))
        .body;
      const next = (
        await api(a)
          .get(`/social/friends?limit=1&cursor=${first.nextCursor}`)
          .expect(200)
      ).body;
      expect(first.items[0].id).not.toBe(next.items[0].id);
      expect(next.nextCursor).toBeNull();
      const r = await room(a);
      const inv = (await invite(a, r.id, b.username).expect(201)).body
        .invitation;
      await api(a).delete(`/social/friends/${b.id}`).expect(200);
      await api(b).post(`/social/requests/${id}/accept`).expect(200);
      expect(
        (await api(b).get('/social/friends').expect(200)).body.items,
      ).toEqual([]);
      expect(
        (await prisma.invitation.findUniqueOrThrow({ where: { id: inv.id } }))
          .status,
      ).toBe('PENDING');
      await block(a, b).expect(200);
      await block(b, a).expect(200);
      expect(
        (await api(a).get('/social/blocks').expect(200)).body.items.map(
          (u: any) => u.id,
        ),
      ).toEqual([b.id]);
      expect(
        (await api(c).get('/social/blocks').expect(200)).body.items,
      ).toEqual([]);
      await api(c).delete(`/social/blocks/${b.id}`).expect(200);
      expect(await prisma.userBlock.count()).toBe(2);
      await api(a).delete(`/social/blocks/${b.id}`).expect(200);
      await api(a).post('/social/requests', { userId: b.id }).expect(409);
      await api(b).delete(`/social/blocks/${a.id}`).expect(200);
      expect(await prisma.friendship.count()).toBe(1); // only A–C remains
      expect(
        (await prisma.invitation.findUniqueOrThrow({ where: { id: inv.id } }))
          .status,
      ).toBe('CANCELLED');
    });

    it('cancels pending requests and hides restricted discovery with no block notification', async () => {
      const [a, b] = [await account(), await account()];
      const id = await send(a, b);
      const count = await prisma.notification.count();
      await block(b, a).expect(200);
      expect(
        (await prisma.friendRequest.findUniqueOrThrow({ where: { id } })).state,
      ).toBe('CANCELLED');
      expect(await prisma.notification.count()).toBe(count);
      for (const [viewer, target] of [
        [a, b],
        [b, a],
      ]) {
        expect(
          (
            await api(viewer)
              .get(`/users/search?search=${target.username}`)
              .expect(200)
          ).body.items,
        ).toEqual([]);
        expect(
          (
            await api(viewer)
              .post('/social/requests', { userId: target.id })
              .expect(409)
          ).body.code,
        ).toBe('interaction_unavailable');
      }
      expect(
        (await api(b).get('/notifications').expect(200)).body.items[0]
          .friendRequest.state,
      ).toBe('CANCELLED');
    });

    it('enforces username/email challenges, invalidates old emailed links and skips queued email', async () => {
      const [a, b] = [await account(), await account()];
      const r = await room(a);
      const id = (await invite(a, r.id, b.email.toUpperCase()).expect(201)).body
        .invitation.id;
      expect(await prisma.emailJob.count({ where: { invitationId: id } })).toBe(
        1,
      );
      await block(b, a).expect(200);
      await invite(a, r.id, b.username).expect(409);
      await invite(a, r.id, b.email).expect(409);
      expect(
        (await api(b).post(`/invitations/${id}/accept`).expect(409)).body.code,
      ).toBe('interaction_unavailable');
      await worker.runOnce();
      expect(sent).toHaveLength(0);
      expect(
        (
          await prisma.emailJob.findFirstOrThrow({
            where: { invitationId: id },
          })
        ).status,
      ).toBe('SKIPPED');
      expect(
        (await prisma.room.findUniqueOrThrow({ where: { id: r.id } }))
          .challengerId,
      ).toBeNull();
    });

    it('serializes challenge creation/acceptance versus block and forbids starting a blocked uncommitted room', async () => {
      const [a, b] = [await account(), await account()];
      const r = await room(a);
      const [created, blocked] = await Promise.all([
        invite(a, r.id, b.username),
        block(b, a),
      ]);
      expect(blocked.status).toBe(200);
      expect([201, 409]).toContain(created.status);
      expect(
        await prisma.invitation.count({
          where: { roomId: r.id, status: 'PENDING' },
        }),
      ).toBe(0);
      await api(b).delete(`/social/blocks/${a.id}`).expect(200);
      const id = (await invite(a, r.id, b.username).expect(201)).body.invitation
        .id;
      const results = await Promise.all([
        api(b).post(`/invitations/${id}/accept`),
        block(a, b),
      ]);
      expect(results[1].status).toBe(200);
      expect([200, 409]).toContain(results[0].status);
      const stored = await prisma.room.findUniqueOrThrow({
        where: { id: r.id },
      });
      if (stored.challengerId)
        expect(
          (
            await api(a)
              .post(`/rooms/${r.id}/start`, {
                expectedRevision: stored.revision,
              })
              .expect(409)
          ).body.code,
        ).toBe('interaction_unavailable');
      expect(await prisma.game.count()).toBe(0);
    });

    it.each([false, true])(
      'excludes blocked casual/rated candidates (%s) and rechecks final pairing',
      async (rated) => {
        const [a, b, c] = [await account(), await account(), await account()];
        await block(a, b).expect(200);
        const first = (
          await api(a)
            .post('/matchmaking/join', { timeControl, rated })
            .expect(200)
        ).body;
        expect(
          (
            await api(b)
              .post('/matchmaking/join', { timeControl, rated })
              .expect(200)
          ).body.state,
        ).toBe('searching');
        const third = (
          await api(c)
            .post('/matchmaking/join', { timeControl, rated })
            .expect(200)
        ).body;
        expect(third.state).toBe('confirming');
        const peer = await prisma.matchmakingSearch.findFirstOrThrow({
          where: {
            pairId: (
              await prisma.matchmakingSearch.findUniqueOrThrow({
                where: { userId: c.id },
              })
            ).pairId,
            userId: { not: c.id },
          },
        });
        const partner = peer.userId === a.id ? a : b;
        await block(c, partner).expect(200);
        await api(partner)
          .post('/matchmaking/ready', { searchId: peer.searchId })
          .expect(200);
        expect(
          (
            await api(c)
              .post('/matchmaking/ready', { searchId: third.searchId })
              .expect(200)
          ).body.state,
        ).toBe('idle');
        expect(await prisma.game.count()).toBe(0);
        expect(first.state).toBe('searching');
      },
    );

    it('pairing/block race preserves committed games and their rated settlement', async () => {
      const [a, b] = [await account(), await account()];
      const first = (
        await api(a)
          .post('/matchmaking/join', { timeControl, rated: true })
          .expect(200)
      ).body;
      const second = (
        await api(b)
          .post('/matchmaking/join', { timeControl, rated: true })
          .expect(200)
      ).body;
      await api(a)
        .post('/matchmaking/ready', { searchId: first.searchId })
        .expect(200);
      const [ready] = await Promise.all([
        api(b).post('/matchmaking/ready', { searchId: second.searchId }),
        block(a, b),
      ]);
      expect(ready.status).toBe(200);
      const game = await prisma.game.findFirst();
      if (game) {
        expect(game.status).toBe('ACTIVE');
        expect(game.rated).toBe(true);
        await api(a)
          .post(`/games/${game.id}/resign`, { requestId: randomUUID() })
          .expect(200);
        expect(
          await prisma.ratingSettlement.count({ where: { gameId: game.id } }),
        ).toBe(1);
      } else expect(ready.body.state).toBe('idle');
    });

    it('keeps already committed games playable after block and settles exactly once', async () => {
      const [a, b] = [await account(), await account()];
      const first = (
        await api(a)
          .post('/matchmaking/join', { timeControl, rated: true })
          .expect(200)
      ).body;
      const second = (
        await api(b)
          .post('/matchmaking/join', { timeControl, rated: true })
          .expect(200)
      ).body;
      await api(a)
        .post('/matchmaking/ready', { searchId: first.searchId })
        .expect(200);
      const ready = (
        await api(b)
          .post('/matchmaking/ready', { searchId: second.searchId })
          .expect(200)
      ).body;
      await block(a, b).expect(200);
      const id = randomUUID();
      await api(a)
        .post(`/games/${ready.gameId}/resign`, { requestId: id })
        .expect(200);
      await api(a)
        .post(`/games/${ready.gameId}/resign`, { requestId: id })
        .expect(200);
      expect(
        await prisma.ratingSettlement.count({
          where: { gameId: ready.gameId },
        }),
      ).toBe(1);
      expect(
        await prisma.ratingChange.count({ where: { gameId: ready.gameId } }),
      ).toBe(2);
    });

    it('authorizes friends-only presence, retains multi-tab online through grace and revokes on remove/block', async () => {
      const [a, b, c] = [await account(), await account(), await account()];
      const requestId = await befriend(a, b);
      const aTab = await connect(a);
      const b1 = await connect(b);
      const b2 = await connect(b);
      const cTab = await connect(c);
      for (const channel of [
        `presence:${b.id}`,
        `user:${b.id}`,
        `friend:${b.id}`,
      ])
        expect(
          await cTab.socket.emitWithAck('channel.join', { channel }),
        ).toMatchObject({ ok: false });
      expect(
        (await api(a).get('/social/friends').expect(200)).body.items[0]
          .presence,
      ).toEqual({ status: 'ONLINE' });
      expect(
        (await api(c).get('/social/friends').expect(200)).body.items,
      ).toEqual([]);
      b1.socket.disconnect();
      await waitFor(() => presence.connectionCount(b.id) === 1);
      expect(presence.isOnline(b.id)).toBe(true);
      b2.socket.disconnect();
      await waitFor(() => presence.connectionCount(b.id) === 0);
      expect(presence.isOnline(b.id)).toBe(true);
      await waitFor(() => !presence.isOnline(b.id));
      expect(
        (await api(a).get('/social/friends').expect(200)).body.items[0]
          .presence,
      ).toEqual({ status: 'OFFLINE' });
      expect(cTab.events.some((e) => e.type === 'social.presence')).toBe(false);
      await api(a).delete(`/social/friends/${b.id}`).expect(200);
      await api(b).post(`/social/requests/${requestId}/accept`).expect(200);
      const count = aTab.events.filter(
        (e) => e.type === 'social.presence',
      ).length;
      await connect(b);
      await new Promise((r) => setTimeout(r, 100));
      expect(
        aTab.events.filter((e) => e.type === 'social.presence'),
      ).toHaveLength(count);
      expect(
        (await api(a).get('/social/friends').expect(200)).body.items,
      ).toEqual([]);
      await block(a, b).expect(200);
      await waitFor(
        () =>
          aTab.events.filter((e) => e.type === 'social.updated').length >= 2,
      );
      const events = aTab.events.filter((e) => e.type === 'social.updated');
      expect(
        events.every(
          (e) =>
            typeof e.payload.eventId === 'string' &&
            Number.isInteger(e.payload.revision),
        ),
      ).toBe(true);
      expect(new Set(events.map((e) => e.payload.eventId)).size).toBe(
        events.length,
      );
      await befriend(a, c);
      expect(
        (await api(a).get('/social/friends').expect(200)).body.items[0]
          .presence,
      ).toEqual({ status: 'ONLINE' });
      await block(a, c).expect(200);
      expect(
        (await api(a).get('/social/friends').expect(200)).body.items,
      ).toEqual([]);
      await new Promise((resolve) => setTimeout(resolve, 100));
      const before = aTab.events.filter(
        (e) => e.type === 'social.presence',
      ).length;
      cTab.socket.disconnect();
      await waitFor(() => !presence.isOnline(c.id));
      await connect(c);
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(
        aTab.events.filter((e) => e.type === 'social.presence'),
      ).toHaveLength(before);
    });
  },
);
