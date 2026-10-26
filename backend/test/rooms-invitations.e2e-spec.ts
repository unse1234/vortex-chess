import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomBytes, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import type { PrismaService as PrismaServiceType } from '../src/database/prisma.service';
import type { EmailWorkerService as WorkerType } from '../src/modules/mail/email-worker.service';
import type { EmailOutboxService as OutboxType } from '../src/modules/mail/email-outbox.service';
import type { PresenceService as PresenceType } from '../src/modules/realtime/presence.service';
import type {
  MailMessage,
  MailTransport,
} from '../src/modules/mail/mail-transport';

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const origin = 'http://localhost:3000';
const password = 'correct-password-123';
const blitz = { initialMs: 180_000, incrementMs: 2_000 };
const rapid = { initialMs: 600_000, incrementMs: 0 };

type Account = {
  id: string;
  username: string;
  email: string;
  token: string;
  cookie: string;
};
type Envelope = { channel: string; type: string; payload: any };

/** Captures messages like a provider that accepts everything, unless told to fail. */
class FakeTransport implements MailTransport {
  readonly name = 'fake';
  sent: MailMessage[] = [];
  failures: Error[] = [];
  async send(message: MailMessage) {
    const failure = this.failures.shift();
    if (failure) throw failure;
    this.sent.push(message);
    return { messageId: `<${randomUUID()}@fake>`, response: '250 2.0.0 queued' };
  }
}

async function waitFor<T>(check: () => T | Promise<T>, timeout = 3000) {
  const started = Date.now();
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() - started > timeout) throw new Error('Timed out waiting');
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

// Compiled code preserves Nest constructor metadata. Real HTTP, sockets and PostgreSQL.
suite(
  'Rooms, invitations, notifications, presence and email outbox (PostgreSQL)',
  () => {
    let app: NestExpressApplication;
    let prisma: PrismaServiceType;
    let worker: WorkerType;
    let outbox: OutboxType;
    let presence: PresenceType;
    let transport: FakeTransport;
    let baseUrl: string;
    const createdIds = new Set<string>();
    const sockets: Socket[] = [];
    const server = () => app.getHttpServer();

    async function account(): Promise<Account> {
      const id = randomUUID().slice(0, 8);
      const body = {
        username: `Rm_${id}`,
        email: `${id}@vortix-rooms.invalid`,
        password,
        confirmPassword: password,
        acceptTerms: true,
      };
      const response = await request(server())
        .post('/api/auth/sign-up')
        .set('Origin', origin)
        .set('X-Vortix-CSRF', '1')
        .send(body)
        .expect(201);
      createdIds.add(response.body.user.id);
      return {
        id: response.body.user.id,
        username: body.username,
        email: body.email,
        token: response.body.accessToken,
        cookie: (response.headers['set-cookie'] as unknown as string[])[0].split(';')[0],
      };
    }
    const as = (user: Account) => ({
      get: (path: string) =>
        request(server()).get(`/api${path}`).set('Authorization', `Bearer ${user.token}`),
      post: (path: string, body: object = {}) =>
        request(server())
          .post(`/api${path}`)
          .set('Authorization', `Bearer ${user.token}`)
          .send(body),
      patch: (path: string, body: object) =>
        request(server())
          .patch(`/api${path}`)
          .set('Authorization', `Bearer ${user.token}`)
          .send(body),
    });
    async function createRoom(host: Account, body: object = { timeControl: blitz }) {
      const response = await as(host).post('/rooms', body).expect(201);
      return response.body.room;
    }
    function invite(host: Account, roomId: string, recipient: string) {
      return as(host).post(`/rooms/${roomId}/invitations`, { recipient });
    }
    function connect(token: string | undefined, headers: Record<string, string> = { Origin: origin }) {
      const socket = io(baseUrl, {
        path: '/api/socket.io',
        auth: token ? { token } : {},
        transports: ['websocket'],
        extraHeaders: headers,
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
      };
    }

    beforeEach(async () => {
      Object.assign(process.env, {
        NODE_ENV: 'test',
        DATABASE_URL: databaseUrl,
        JWT_ACCESS_SECRET: randomBytes(48).toString('hex'),
        CORS_ORIGINS: origin,
        COOKIE_SECURE: 'false',
        COOKIE_SAME_SITE: 'lax',
        EXPIRY_SWEEP_INTERVAL_SECONDS: '0',
        MAIL_WORKER_INTERVAL_SECONDS: '0',
        MAIL_RETRY_BASE_SECONDS: '30',
        MAIL_MAX_ATTEMPTS: '2',
        APP_PUBLIC_URL: 'https://play.vortex.invalid',
      });
      const { AppModule } = require('../dist/app.module') as typeof import('../src/app.module');
      const { PrismaService } = require('../dist/database/prisma.service') as typeof import('../src/database/prisma.service');
      const { configureApp } = require('../dist/configure-app') as typeof import('../src/configure-app');
      const { EmailWorkerService } = require('../dist/modules/mail/email-worker.service') as typeof import('../src/modules/mail/email-worker.service');
      const { EmailOutboxService } = require('../dist/modules/mail/email-outbox.service') as typeof import('../src/modules/mail/email-outbox.service');
      const { PresenceService } = require('../dist/modules/realtime/presence.service') as typeof import('../src/modules/realtime/presence.service');
      const { MAIL_TRANSPORT } = require('../dist/modules/mail/mail-transport') as typeof import('../src/modules/mail/mail-transport');
      transport = new FakeTransport();
      const fixture = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(MAIL_TRANSPORT)
        .useValue(transport)
        .compile();
      app = fixture.createNestApplication<NestExpressApplication>({ bodyParser: false });
      configureApp(app);
      await app.listen(0, '127.0.0.1');
      baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
      prisma = app.get(PrismaService);
      worker = app.get(EmailWorkerService);
      outbox = app.get(EmailOutboxService);
      presence = app.get(PresenceService);
    });
    afterEach(async () => {
      for (const socket of sockets.splice(0)) socket.disconnect();
      if (prisma)
        await prisma.user.deleteMany({ where: { id: { in: [...createdIds] } } });
      createdIds.clear();
      await app?.close();
    });

    it('creates rooms with supported settings and restricts details to participants', async () => {
      const [host, stranger] = [await account(), await account()];
      const options = await as(host).get('/rooms/options').expect(200);
      expect(options.body.timeControls.map((t: { id: string }) => t.id)).toContain('3+2');
      await as(host)
        .post('/rooms', { timeControl: { initialMs: 123_000, incrementMs: 0 } })
        .expect(400);
      await request(server()).post('/api/rooms').send({ timeControl: blitz }).expect(401);
      const room = await createRoom(host, { timeControl: blitz, colorPreference: 'white' });
      expect(room).toMatchObject({
        status: 'waiting',
        revision: 1,
        settings: {
          timeControl: { category: 'blitz', ...blitz },
          colorPreference: 'white',
        },
        seats: { host: { player: { id: host.id }, ready: false, color: 'white' }, challenger: null },
        viewer: { role: 'host', canEditSettings: true, canInvite: true },
      });
      expect(JSON.stringify(room)).not.toContain(host.email);
      await as(host).get(`/rooms/${room.id}`).expect(200);
      const denied = await as(stranger).get(`/rooms/${room.id}`).expect(404);
      expect(denied.body.code).toBe('room_not_found');
      await as(stranger).post(`/rooms/${room.id}/cancel`).expect(404);
      await as(stranger)
        .patch(`/rooms/${room.id}/settings`, { expectedRevision: 1, timeControl: rapid })
        .expect(404);
      await as(host).get('/rooms/not-a-uuid').expect(400);
    });

    it('invites registered accounts by username or email without exposing the recipient email', async () => {
      const [host, guest, other] = [await account(), await account(), await account()];
      const room = await createRoom(host);
      const byUsername = await invite(host, room.id, guest.username.toUpperCase()).expect(201);
      expect(byUsername.body.invitation).toMatchObject({
        status: 'pending',
        addressedBy: 'username',
        recipient: { id: guest.id, username: guest.username },
        viewer: { role: 'sender', canCancel: true, canAccept: false },
      });
      const sentJson = JSON.stringify(byUsername.body);
      expect(sentJson).not.toContain(guest.email);
      const list = await as(host).get(`/rooms/${room.id}/invitations`).expect(200);
      expect(JSON.stringify(list.body)).not.toContain(guest.email);

      const byEmail = await invite(host, room.id, ` ${other.email.toUpperCase()} `).expect(201);
      expect(byEmail.body.invitation).toMatchObject({
        addressedBy: 'email',
        recipient: { id: other.id },
      });
      const stored = await prisma.invitation.findUniqueOrThrow({
        where: { id: byEmail.body.invitation.id },
      });
      expect(stored.recipientId).toBe(other.id);

      const received = await as(guest).get('/invitations?role=received').expect(200);
      expect(received.body.items).toHaveLength(1);
      expect(received.body.items[0]).toMatchObject({
        id: byUsername.body.invitation.id,
        viewer: { role: 'recipient', canAccept: true, canDecline: true },
        room: { id: room.id, availability: 'open', seatOpen: true },
      });
      expect(JSON.stringify(received.body)).not.toContain(host.email);
    });

    it('rejects unknown accounts, self-invitations, duplicates and non-host invitations', async () => {
      const [host, guest, stranger] = [await account(), await account(), await account()];
      const room = await createRoom(host);
      const missing = await invite(host, room.id, 'Nobody_here_123').expect(404);
      expect(missing.body.code).toBe('account_not_found');
      await invite(host, room.id, 'nobody@vortix-rooms.invalid').expect(404);
      await invite(host, room.id, 'not an identifier!').expect(400);
      const self = await invite(host, room.id, host.email).expect(400);
      expect(self.body.code).toBe('self_invitation');
      // Non-participants cannot use the endpoint to probe accounts.
      expect((await invite(stranger, room.id, guest.username).expect(404)).body.code).toBe('room_not_found');

      const concurrent = await Promise.all([
        invite(host, room.id, guest.username),
        invite(host, room.id, guest.email),
        invite(host, room.id, guest.username.toLowerCase()),
      ]);
      expect(concurrent.map((r) => r.status).sort()).toEqual([201, 409, 409]);
      expect(concurrent.find((r) => r.status === 409)!.body.code).toBe('invitation_pending');
      expect(
        await prisma.invitation.count({ where: { roomId: room.id, recipientId: guest.id } }),
      ).toBe(1);
      expect(
        await prisma.notification.count({ where: { recipientId: guest.id } }),
      ).toBe(1);
    });

    it('accepts atomically, repeats idempotently, and binds the link to the intended account', async () => {
      const [host, guest, intruder] = [await account(), await account(), await account()];
      const room = await createRoom(host);
      const id = (await invite(host, room.id, guest.username).expect(201)).body.invitation.id;

      const forwarded = await as(intruder).get(`/invitations/${id}`).expect(403);
      expect(forwarded.body.code).toBe('invitation_wrong_account');
      expect(JSON.stringify(forwarded.body)).not.toContain(guest.username);
      await as(intruder).post(`/invitations/${id}/accept`).expect(403);
      await as(intruder).post(`/invitations/${id}/decline`).expect(403);
      expect((await as(host).post(`/invitations/${id}/accept`).expect(403)).body.code).toBe('not_invitation_recipient');
      await as(guest).post(`/invitations/${randomUUID()}/accept`).expect(404);

      const [first, second] = await Promise.all([
        as(guest).post(`/invitations/${id}/accept`),
        as(guest).post(`/invitations/${id}/accept`),
      ]);
      expect([first.status, second.status]).toEqual([200, 200]);
      expect(first.body.invitation).toMatchObject({
        status: 'accepted',
        room: { availability: 'joined' },
      });
      const joined = await as(guest).get(`/rooms/${room.id}`).expect(200);
      expect(joined.body.room).toMatchObject({
        revision: 2,
        seats: { challenger: { player: { id: guest.id }, ready: false } },
        viewer: { role: 'challenger', canLeave: true, canEditSettings: false },
      });
      expect(JSON.stringify(joined.body)).not.toContain(host.email);
      expect((await as(guest).post(`/invitations/${id}/decline`).expect(409)).body.code).toBe('invitation_accepted');
      expect((await as(host).post(`/invitations/${id}/cancel`).expect(409)).body.code).toBe('invitation_accepted');
      expect(
        await prisma.notification.count({
          where: { recipientId: host.id, type: 'INVITATION_ACCEPTED' },
        }),
      ).toBe(1);
      await as(intruder).get(`/rooms/${room.id}`).expect(404);
    });

    it('never overfills the challenger seat when different invitees accept concurrently', async () => {
      const host = await account();
      const guests = [await account(), await account(), await account()];
      const room = await createRoom(host);
      const ids: string[] = [];
      for (const guest of guests)
        ids.push((await invite(host, room.id, guest.username).expect(201)).body.invitation.id);
      const results = await Promise.all(
        guests.map((guest, i) => as(guest).post(`/invitations/${ids[i]}/accept`)),
      );
      expect(results.map((r) => r.status).sort()).toEqual([200, 409, 409]);
      for (const r of results.filter((r) => r.status === 409))
        expect(r.body.code).toBe('room_full');
      const winner = guests[results.findIndex((r) => r.status === 200)];
      const stored = await prisma.room.findUniqueOrThrow({ where: { id: room.id } });
      expect(stored.challengerId).toBe(winner.id);
      expect(stored.revision).toBe(2);
      const loserView = await as(guests[results.findIndex((r) => r.status === 409)])
        .get(`/invitations/${ids[results.findIndex((r) => r.status === 409)]}`)
        .expect(200);
      expect(loserView.body.invitation).toMatchObject({
        status: 'pending',
        room: { availability: 'full' },
        viewer: { canAccept: false, canDecline: true },
      });
      await invite(host, room.id, (await account()).username).expect(409);
    });

    it('handles decline, cancellation and their repeats with clear outcomes', async () => {
      const [host, guest] = [await account(), await account()];
      const room = await createRoom(host);
      const declinedId = (await invite(host, room.id, guest.username).expect(201)).body.invitation.id;
      await as(guest).post(`/invitations/${declinedId}/decline`).expect(200);
      expect((await as(guest).post(`/invitations/${declinedId}/decline`).expect(200)).body.invitation.status).toBe('declined');
      expect((await as(guest).post(`/invitations/${declinedId}/accept`).expect(409)).body.code).toBe('invitation_declined');
      expect((await as(host).post(`/invitations/${declinedId}/cancel`).expect(409)).body.code).toBe('invitation_declined');
      expect(
        await prisma.notification.count({ where: { recipientId: host.id, type: 'INVITATION_DECLINED' } }),
      ).toBe(1);

      // A declined invitation does not block a new one.
      const cancelledId = (await invite(host, room.id, guest.username).expect(201)).body.invitation.id;
      expect((await as(guest).post(`/invitations/${cancelledId}/cancel`).expect(403)).body.code).toBe('not_invitation_sender');
      await as(host).post(`/invitations/${cancelledId}/cancel`).expect(200);
      expect((await as(host).post(`/invitations/${cancelledId}/cancel`).expect(200)).body.invitation.status).toBe('cancelled');
      expect((await as(guest).post(`/invitations/${cancelledId}/accept`).expect(409)).body.code).toBe('invitation_cancelled');

      // Cancelling the room cancels its pending invitations in the same transaction.
      const pendingId = (await invite(host, room.id, guest.username).expect(201)).body.invitation.id;
      await as(guest).post(`/rooms/${room.id}/cancel`).expect(404);
      const cancelled = await as(host).post(`/rooms/${room.id}/cancel`).expect(200);
      expect(cancelled.body.room).toMatchObject({ status: 'cancelled', viewer: { canEditSettings: false } });
      await as(host).post(`/rooms/${room.id}/cancel`).expect(200);
      expect((await prisma.invitation.findUniqueOrThrow({ where: { id: pendingId } })).status).toBe('CANCELLED');
      expect((await as(guest).post(`/invitations/${pendingId}/accept`).expect(409)).body.code).toBe('invitation_cancelled');
      expect((await as(host).patch(`/rooms/${room.id}/settings`, { expectedRevision: cancelled.body.room.revision, timeControl: rapid }).expect(409)).body.code).toBe('room_cancelled');
    });

    it('enforces invitation and room expiry on every operation without the sweep', async () => {
      const [host, guest] = [await account(), await account()];
      const room = await createRoom(host);
      const id = (await invite(host, room.id, guest.username).expect(201)).body.invitation.id;
      // Database-clock expiry, as a delayed background job would leave it.
      await prisma.$executeRaw`UPDATE "Invitation" SET "expiresAt" = now() - interval '1 second' WHERE id = ${id}::uuid`;
      expect((await as(guest).post(`/invitations/${id}/accept`).expect(409)).body.code).toBe('invitation_expired');
      expect((await prisma.invitation.findUniqueOrThrow({ where: { id } })).status).toBe('EXPIRED');
      expect((await prisma.room.findUniqueOrThrow({ where: { id: room.id } })).challengerId).toBeNull();
      const view = await as(guest).get(`/invitations/${id}`).expect(200);
      expect(view.body.invitation).toMatchObject({ status: 'expired', viewer: { canAccept: false, canDecline: false } });
      // An expired invitation no longer blocks a fresh one.
      const freshId = (await invite(host, room.id, guest.username).expect(201)).body.invitation.id;

      await prisma.$executeRaw`UPDATE "Room" SET "expiresAt" = now() - interval '1 second' WHERE id = ${room.id}::uuid`;
      await prisma.$executeRaw`UPDATE "Invitation" SET "expiresAt" = now() - interval '1 second' WHERE id = ${freshId}::uuid`;
      const expiredRoom = await as(host).get(`/rooms/${room.id}`).expect(200);
      expect(expiredRoom.body.room).toMatchObject({ status: 'expired', viewer: { canInvite: false } });
      expect(expiredRoom.body.room.revision).toBe(room.revision + 1);
      expect((await prisma.invitation.findUniqueOrThrow({ where: { id: freshId } })).status).toBe('EXPIRED');
      expect((await as(host).post(`/rooms/${room.id}/cancel`).expect(409)).body.code).toBe('room_expired');
      expect((await invite(host, room.id, guest.username).expect(409)).body.code).toBe('room_expired');
    });

    it('uses revisions so settings changes invalidate readiness and stale requests conflict', async () => {
      const [host, guest] = [await account(), await account()];
      const room = await createRoom(host);
      const early = await as(host).post(`/rooms/${room.id}/ready`, { expectedRevision: 1, ready: true }).expect(409);
      expect(early.body.code).toBe('room_not_full');
      const id = (await invite(host, room.id, guest.username).expect(201)).body.invitation.id;
      await as(guest).post(`/invitations/${id}/accept`).expect(200);
      let revision = 2;
      const hostReady = await as(host).post(`/rooms/${room.id}/ready`, { expectedRevision: revision, ready: true }).expect(200);
      revision = hostReady.body.room.revision;
      expect(hostReady.body.room).toMatchObject({ status: 'waiting', seats: { host: { ready: true } } });
      // Repeating the same readiness is a no-op, not a new revision.
      expect((await as(host).post(`/rooms/${room.id}/ready`, { expectedRevision: revision, ready: true }).expect(200)).body.room.revision).toBe(revision);
      const stale = await as(guest).post(`/rooms/${room.id}/ready`, { expectedRevision: revision - 1, ready: true }).expect(409);
      expect(stale.body.code).toBe('room_revision_conflict');
      const bothReady = await as(guest).post(`/rooms/${room.id}/ready`, { expectedRevision: revision, ready: true }).expect(200);
      expect(bothReady.body.room).toMatchObject({ status: 'ready', seats: { host: { ready: true }, challenger: { ready: true } } });
      revision = bothReady.body.room.revision;

      expect((await as(guest).patch(`/rooms/${room.id}/settings`, { expectedRevision: revision, timeControl: rapid }).expect(403)).body.code).toBe('not_room_host');
      const changed = await as(host).patch(`/rooms/${room.id}/settings`, { expectedRevision: revision, timeControl: rapid, colorPreference: 'black' }).expect(200);
      expect(changed.body.room).toMatchObject({
        revision: revision + 1,
        status: 'waiting',
        settings: { timeControl: { category: 'rapid', ...rapid }, colorPreference: 'black' },
        seats: { host: { ready: false, color: 'black' }, challenger: { ready: false, color: 'white' } },
      });
      // The challenger's confirmation of the old settings is rejected.
      expect((await as(guest).post(`/rooms/${room.id}/ready`, { expectedRevision: revision, ready: true }).expect(409)).body.code).toBe('room_revision_conflict');
      // Concurrent settings writes with the same base revision: exactly one wins.
      const base = revision + 1;
      const writes = await Promise.all([
        as(host).patch(`/rooms/${room.id}/settings`, { expectedRevision: base, timeControl: blitz }),
        as(host).patch(`/rooms/${room.id}/settings`, { expectedRevision: base, colorPreference: 'white' }),
      ]);
      expect(writes.map((w) => w.status).sort()).toEqual([200, 409]);
      await as(guest).post(`/rooms/${room.id}/leave`).expect(204);
      const left = await as(host).get(`/rooms/${room.id}`).expect(200);
      expect(left.body.room).toMatchObject({ seats: { challenger: null }, viewer: { canInvite: true } });
      await as(guest).get(`/rooms/${room.id}`).expect(404);
    });

    it('keeps a paginated owner-only inbox where reading never accepts', async () => {
      const [guest, other] = [await account(), await account()];
      const hosts = [await account(), await account(), await account()];
      const invitationIds: string[] = [];
      for (const host of hosts) {
        const room = await createRoom(host);
        invitationIds.push((await invite(host, room.id, guest.username).expect(201)).body.invitation.id);
      }
      const firstPage = await as(guest).get('/notifications?limit=2').expect(200);
      expect(firstPage.body.items).toHaveLength(2);
      expect(firstPage.body.unreadCount).toBe(3);
      expect(firstPage.body.items[0]).toMatchObject({
        type: 'invitation.received',
        readAt: null,
        actor: { id: hosts[2].id },
        invitation: { id: invitationIds[2], status: 'pending', viewer: { role: 'recipient' } },
      });
      const secondPage = await as(guest).get(`/notifications?limit=2&cursor=${firstPage.body.nextCursor}`).expect(200);
      expect(secondPage.body.items.map((n: { id: string }) => n.id)).not.toContain(firstPage.body.items[0].id);
      expect(secondPage.body.items).toHaveLength(1);
      expect(secondPage.body.nextCursor).toBeNull();
      await as(guest).get('/notifications?cursor=garbage').expect(400);

      const target = firstPage.body.items[0];
      await as(other).post(`/notifications/${target.id}/read`).expect(404);
      const read = await as(guest).post(`/notifications/${target.id}/read`).expect(200);
      expect(read.body).toMatchObject({ unreadCount: 2, notification: { id: target.id } });
      expect(read.body.notification.readAt).not.toBeNull();
      await as(guest).post(`/notifications/${target.id}/read`).expect(200);
      expect((await prisma.invitation.findUniqueOrThrow({ where: { id: invitationIds[2] } })).status).toBe('PENDING');
      expect((await as(guest).get('/notifications/unread-count').expect(200)).body.unreadCount).toBe(2);
      await as(guest).post('/notifications/read-all').expect(200);
      expect((await as(guest).get('/notifications/unread-count').expect(200)).body.unreadCount).toBe(0);
      expect((await as(other).get('/notifications').expect(200)).body.items).toHaveLength(0);
    });

    it('authenticates sockets, tracks presence across tabs and delivers after commit', async () => {
      const [host, guest, stranger] = [await account(), await account(), await account()];
      await expect(connect(undefined).ready).rejects.toMatchObject({ message: 'unauthenticated' });
      await expect(connect('forged-token').ready).rejects.toMatchObject({ message: 'unauthenticated' });
      await expect(connect(guest.token, { Origin: 'https://evil.invalid' }).ready).rejects.toBeDefined();

      const tabA = connect(guest.token);
      const tabB = connect(guest.token);
      await Promise.all([tabA.ready, tabB.ready]);
      expect(presence.isOnline(guest.id)).toBe(true);

      const room = await createRoom(host);
      const hostTab = connect(host.token);
      await hostTab.ready;
      // Subscriptions are authorized by the socket's account, not client data.
      const denied = await tabA.socket.emitWithAck('channel.join', { channel: `room:${room.id}` });
      expect(denied).toMatchObject({ ok: false, error: { code: 'forbidden' } });
      expect(await hostTab.socket.emitWithAck('channel.join', { channel: `user:${guest.id}` })).toMatchObject({ ok: false });
      expect(await hostTab.socket.emitWithAck('channel.join', { channel: `room:${room.id}` })).toEqual({ ok: true });
      await hostTab.next('room.updated', (e) => e.payload.room.revision === 1);

      const first = await invite(host, room.id, guest.username).expect(201);
      const [a, b] = await Promise.all([
        tabA.next('notification.created'),
        tabB.next('notification.created'),
      ]);
      expect(a.payload.notification.id).toBe(b.payload.notification.id);
      expect(a.payload).toMatchObject({ unreadCount: 1, notification: { type: 'invitation.received', invitation: { id: first.body.invitation.id } } });
      expect(JSON.stringify(a.payload)).not.toContain(host.email);
      // Online recipient: saved notification and realtime delivery, no email job.
      expect(await prisma.emailJob.count({ where: { recipientId: guest.id } })).toBe(0);

      // Closing one tab keeps the account online.
      tabA.socket.disconnect();
      await waitFor(() => presence.connectionCount(guest.id) === 1);
      expect(presence.isOnline(guest.id)).toBe(true);

      await as(guest).post(`/invitations/${first.body.invitation.id}/accept`).expect(200);
      const update = await hostTab.next('room.updated', (e) => e.payload.room.revision === 2);
      expect(update.payload.room).toMatchObject({
        viewer: { role: 'host' },
        seats: { challenger: { player: { id: guest.id }, online: true } },
      });
      await hostTab.next('notification.created', (e) => e.payload.notification.type === 'invitation.accepted');
      await tabB.next('invitation.updated', (e) => e.payload.invitation.status === 'accepted');

      tabB.socket.disconnect();
      await waitFor(() => !presence.isOnline(guest.id));
      await hostTab.next('room.presence', (e) => e.payload.userId === guest.id && e.payload.online === false);
      expect(hostTab.events.some((e) => e.type === 'room.updated' && JSON.stringify(e).includes(stranger.id))).toBe(false);
    });

    it('closes sockets when their session signs out', async () => {
      const user = await account();
      const tab = connect(user.token);
      await tab.ready;
      const closed = new Promise<string>((resolve) => tab.socket.on('disconnect', resolve));
      await request(server())
        .post('/api/session/sign-out')
        .set('Origin', origin)
        .set('X-Vortix-CSRF', '1')
        .set('Cookie', user.cookie)
        .send({})
        .expect(204);
      expect(await closed).toBe('io server disconnect');
      expect(tab.events.some((e) => e.type === 'session.ended')).toBe(true);
      await waitFor(() => !presence.isOnline(user.id));
      await expect(connect(user.token).ready).rejects.toMatchObject({ message: 'unauthenticated' });
    });

    it('queues one durable email for offline recipients and rechecks validity before sending', async () => {
      const [host, guest, late] = [await account(), await account(), await account()];
      const room = await createRoom(host);
      const id = (await invite(host, room.id, guest.username).expect(201)).body.invitation.id;
      const job = await prisma.emailJob.findFirstOrThrow({ where: { invitationId: id } });
      expect(job).toMatchObject({ status: 'PENDING', attempts: 0, dedupeKey: `invitation-email:${id}` });
      expect(await prisma.notification.count({ where: { recipientId: guest.id } })).toBe(1);

      expect(await worker.runOnce()).toBe(1);
      expect(transport.sent).toHaveLength(1);
      const message = transport.sent[0];
      expect(message.to).toBe(guest.email);
      expect(message.subject).toContain(host.username);
      expect(message.text).toContain(`https://play.vortex.invalid/rooms/join/${id}`);
      expect(message.html).toContain(`/rooms/join/${id}`);
      expect(message.text).not.toContain(host.email);
      const sent = await prisma.emailJob.findUniqueOrThrow({ where: { id: job.id } });
      expect(sent).toMatchObject({ status: 'SENT', attempts: 1, lockToken: null, providerResponse: '250 2.0.0 queued' });
      expect(sent.providerMessageId).toMatch(/@fake>$/);
      // Already processed: no duplicate send, and the dedupe key blocks a second job.
      expect(await worker.runOnce()).toBe(0);
      expect(transport.sent).toHaveLength(1);
      await expect(
        prisma.emailJob.create({ data: { kind: 'invitation', dedupeKey: job.dedupeKey, recipientId: guest.id, maxAttempts: 1 } }),
      ).rejects.toThrow();

      // Cancelled before the worker runs: skipped, never sent.
      const room2 = await createRoom(host);
      const cancelledId = (await invite(host, room2.id, late.username).expect(201)).body.invitation.id;
      await as(host).post(`/invitations/${cancelledId}/cancel`).expect(200);
      await worker.runOnce();
      expect(await prisma.emailJob.findFirstOrThrow({ where: { invitationId: cancelledId } })).toMatchObject({ status: 'SKIPPED', skipReason: 'invitation_cancelled' });

      // Recipient came online before sending: policy skips the email.
      const room3 = await createRoom(host);
      const onlineId = (await invite(host, room3.id, late.username).expect(201)).body.invitation.id;
      const tab = connect(late.token);
      await tab.ready;
      await worker.runOnce();
      expect(await prisma.emailJob.findFirstOrThrow({ where: { invitationId: onlineId } })).toMatchObject({ status: 'SKIPPED', skipReason: 'recipient_online' });
      expect(transport.sent).toHaveLength(1);
    });

    it('retries transient provider failures, stops at the attempt limit and claims jobs exclusively', async () => {
      const [host, guest] = [await account(), await account()];
      const room = await createRoom(host);
      const id = (await invite(host, room.id, guest.username).expect(201)).body.invitation.id;
      const { MailDeliveryError } = require('../dist/modules/mail/mail-transport') as typeof import('../src/modules/mail/mail-transport');
      transport.failures.push(new MailDeliveryError('SMTP 421', false));
      await worker.runOnce();
      const retried = await prisma.emailJob.findFirstOrThrow({ where: { invitationId: id } });
      expect(retried).toMatchObject({ status: 'PENDING', attempts: 1, lastError: 'SMTP 421' });
      expect(retried.availableAt.getTime()).toBeGreaterThan(Date.now() + 20_000);
      expect(await worker.runOnce()).toBe(0);

      await prisma.emailJob.update({ where: { id: retried.id }, data: { availableAt: new Date(Date.now() - 1000) } });
      transport.failures.push(new MailDeliveryError('SMTP 421', false));
      await worker.runOnce();
      expect(await prisma.emailJob.findFirstOrThrow({ where: { invitationId: id } })).toMatchObject({ status: 'FAILED', attempts: 2 });
      expect(transport.sent).toHaveLength(0);

      // Concurrent claimers receive disjoint jobs (FOR UPDATE SKIP LOCKED).
      const others = [await account(), await account(), await account()];
      for (const other of others) await invite(host, room.id, other.username).expect(201);
      const [left, right] = await Promise.all([outbox.claim(10), outbox.claim(10)]);
      const claimed = [...left, ...right].map((j) => j.id);
      expect(new Set(claimed).size).toBe(claimed.length);
      expect(claimed).toHaveLength(3);
      // A stale token cannot complete another worker's claim.
      const stolen = { ...left.concat(right)[0], lockToken: randomUUID() };
      expect((await outbox.markSent(stolen, { messageId: 'x', response: 'y' })).count).toBe(0);
    });
  },
);
