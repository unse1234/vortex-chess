import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import type { PrismaService as PrismaServiceType } from '../src/database/prisma.service';
import type { EmailWorkerService as WorkerType } from '../src/modules/mail/email-worker.service';
import type { PasswordRecoveryService as RecoveryType } from '../src/modules/auth/password-recovery.service';
import type {
  MailMessage,
  MailTransport,
} from '../src/modules/mail/mail-transport';

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const origin = 'http://localhost:3000';
const publicUrl = 'https://play.vortex.invalid';
const password = 'original-password-123';
const newPassword = 'brand-new-password-456';
const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

type Account = { id: string; email: string; token: string; cookie: string };
type Envelope = { channel: string; type: string; payload: any };

class FakeTransport implements MailTransport {
  readonly name = 'fake';
  sent: MailMessage[] = [];
  failures: Error[] = [];
  async send(message: MailMessage) {
    const failure = this.failures.shift();
    if (failure) throw failure;
    this.sent.push(message);
    return { messageId: `<${randomUUID()}@fake>`, response: '250 queued' };
  }
}

async function waitFor<T>(check: () => T | Promise<T>, timeout = 3000) {
  const started = Date.now();
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() - started > timeout) throw new Error('Timed out waiting');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

// Compiled code preserves Nest constructor metadata. Real HTTP, sockets and PostgreSQL.
suite('Password recovery (PostgreSQL)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaServiceType;
  let worker: WorkerType;
  let recovery: RecoveryType;
  let transport: FakeTransport;
  let baseUrl: string;
  let output: string[];
  const createdIds = new Set<string>();
  const sockets: Socket[] = [];
  const server = () => app.getHttpServer();
  const post = (path: string) =>
    request(server())
      .post(`/api${path}`)
      .set('Origin', origin)
      .set('X-Vortix-CSRF', '1');

  async function start() {
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
      APP_PUBLIC_URL: publicUrl,
      PASSWORD_RESET_TTL_MINUTES: '30',
      PASSWORD_RESET_COOLDOWN_SECONDS: '60',
      PASSWORD_RESET_MAX_PER_HOUR: '5',
    });
    const { AppModule } = require('../dist/app.module') as typeof import('../src/app.module');
    const { PrismaService } = require('../dist/database/prisma.service') as typeof import('../src/database/prisma.service');
    const { configureApp } = require('../dist/configure-app') as typeof import('../src/configure-app');
    const { EmailWorkerService } = require('../dist/modules/mail/email-worker.service') as typeof import('../src/modules/mail/email-worker.service');
    const { PasswordRecoveryService } = require('../dist/modules/auth/password-recovery.service') as typeof import('../src/modules/auth/password-recovery.service');
    const { MAIL_TRANSPORT } = require('../dist/modules/mail/mail-transport') as typeof import('../src/modules/mail/mail-transport');
    transport = new FakeTransport();
    const fixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MAIL_TRANSPORT)
      .useValue(transport)
      .compile();
    // Everything the application logs is captured, to check that no credential leaks.
    const capture = (...parts: unknown[]) => {
      output.push(parts.map(String).join(' '));
    };
    app = fixture.createNestApplication<NestExpressApplication>({
      bodyParser: false,
      logger: { log: capture, error: capture, warn: capture, debug: capture, verbose: capture },
    });
    configureApp(app);
    await app.listen(0, '127.0.0.1');
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
    prisma = app.get(PrismaService);
    worker = app.get(EmailWorkerService);
    recovery = app.get(PasswordRecoveryService);
  }

  async function account(): Promise<Account> {
    const id = randomUUID().slice(0, 8);
    const email = `${id}@vortix-reset.invalid`;
    const response = await post('/auth/sign-up')
      .send({
        username: `Pr_${id}`,
        email,
        password,
        confirmPassword: password,
        acceptTerms: true,
      })
      .expect(201);
    createdIds.add(response.body.user.id);
    return {
      id: response.body.user.id,
      email,
      token: response.body.accessToken,
      cookie: (response.headers['set-cookie'] as unknown as string[])[0].split(';')[0],
    };
  }

  /** Requests a link and delivers queued mail; returns the raw token from the email. */
  async function requestLink(email: string) {
    const response = await post('/auth/forgot-password').send({ email }).expect(202);
    await recovery.settled();
    await worker.runOnce();
    const message = transport.sent.filter((m) => m.to === email.trim().toLowerCase()).at(-1);
    const token = message?.text.match(/#token=([A-Za-z0-9_-]{43})/)?.[1];
    return { response, message, token };
  }
  const signIn = (email: string, secret: string) =>
    post('/auth/sign-in').send({ email, password: secret });
  /** Moves the account's issued links back in time, past the issuance cooldown. */
  const age = (userId: string, ms = 61_000) =>
    prisma.$executeRaw`UPDATE "PasswordResetToken" SET "createdAt" = "createdAt" - (${ms}::int * interval '1 millisecond') WHERE "userId" = ${userId}::uuid`;
  const reset = (token: string, secret = newPassword) =>
    post('/auth/reset-password').send({
      token,
      password: secret,
      confirmPassword: secret,
    });

  beforeEach(async () => {
    output = [];
    await start();
  });
  afterEach(async () => {
    for (const socket of sockets.splice(0)) socket.disconnect();
    if (prisma)
      await prisma.user.deleteMany({ where: { id: { in: [...createdIds] } } });
    createdIds.clear();
    await app?.close();
  });

  it('answers known and unknown emails identically and stores only a digest', async () => {
    const user = await account();
    const known = await requestLink(`  ${user.email.toUpperCase()} `);
    const unknown = await post('/auth/forgot-password')
      .send({ email: `nobody-${randomUUID()}@vortix-reset.invalid` })
      .expect(202);
    expect(known.response.body).toEqual(unknown.body);
    expect(known.response.body).toEqual({
      message: "If an account exists for this email, you'll receive a password reset link.",
    });
    expect(transport.sent).toHaveLength(1);
    expect(known.message!.to).toBe(user.email);
    expect(known.message!.subject).toMatch(/Reset your Vortex Chess password/);
    expect(known.message!.text).toContain(`${publicUrl}/reset-password#token=`);
    expect(known.message!.text).toMatch(/expires in 30 minutes/);
    const token = known.token!;
    const rows = await prisma.passwordResetToken.findMany({ where: { userId: user.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).toBe(sha256(token));
    expect(JSON.stringify(rows)).not.toContain(token);
    // The sealed link is discarded once the email was sent.
    expect(rows[0].mailPayload).toBeNull();
    const jobs = await prisma.emailJob.findMany({ where: { recipientId: user.id } });
    expect(jobs).toMatchObject([{ kind: 'password-reset', status: 'SENT' }]);
    expect(JSON.stringify(jobs)).not.toContain(token);
    // Requesting a link changes nothing about the account or its sessions.
    await signIn(user.email, password).expect(200);
    await request(server()).get('/api/session').set('Authorization', `Bearer ${user.token}`).expect(200);
  });

  it('checks links without consuming them and rejects bad tokens uniformly', async () => {
    const user = await account();
    const { token } = await requestLink(user.email);
    for (let i = 0; i < 3; i++) {
      const status = await post('/auth/reset-password/status').send({ token }).expect(200);
      expect(status.body.valid).toBe(true);
    }
    for (const bad of ['', 'short', `${token}x`, randomBytes(32).toString('base64url')]) {
      const failed = await reset(bad!).expect(400);
      expect(failed.body.code).toBe('reset_link_invalid');
      const status = await post('/auth/reset-password/status').send({ token: bad }).expect(200);
      expect(status.body).toEqual({ valid: false });
    }
    // Password policy and confirmation are enforced and do not use up the token.
    const weak = await reset(token!, 'short').expect(400);
    expect(weak.body).toMatchObject({ code: 'validation_error', fieldErrors: { password: expect.any(Array) } });
    const mismatch = await post('/auth/reset-password')
      .send({ token, password: newPassword, confirmPassword: 'something-else-1' })
      .expect(400);
    expect(mismatch.body.fieldErrors.confirmPassword).toBeDefined();
    await reset(token!).expect(200);
  });

  it('resets the password and ends every session, refresh credential and socket', async () => {
    const user = await account();
    const other = await signIn(user.email, password).expect(200);
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
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve());
      socket.once('connect_error', reject);
    });
    const { token } = await requestLink(user.email);

    const done = await reset(token!).expect(200);
    expect(done.body.message).toMatch(/Sign in with your new password/);
    expect(String(done.headers['set-cookie'])).toMatch(/vortix_refresh=;/);
    expect(done.body.accessToken).toBeUndefined();

    await signIn(user.email, password).expect(401);
    await signIn(user.email, newPassword).expect(200);
    for (const access of [user.token, other.body.accessToken])
      await request(server()).get('/api/session').set('Authorization', `Bearer ${access}`).expect(401);
    await post('/auth/refresh').set('Cookie', user.cookie).send({}).expect(401);
    await waitFor(() => events.some((e) => e.type === 'session.ended'));
    await waitFor(() => !socket.connected);
    expect(
      await prisma.authSession.count({ where: { userId: user.id, revokedAt: null } }),
    ).toBe(1); // only the sign-in made after the reset

    const reused = await reset(token!, 'another-password-789').expect(400);
    expect(reused.body.code).toBe('reset_link_invalid');
    await worker.runOnce();
    const notice = transport.sent.find((m) => m.subject.includes('was changed'));
    expect(notice).toMatchObject({ to: user.email });
    expect(notice!.text).not.toContain(token);
    expect(notice!.text).not.toContain(newPassword);
    expect(notice!.text).toContain(`${publicUrl}/sign-in`);
  });

  it('lets exactly one of several concurrent submissions of a token succeed', async () => {
    const user = await account();
    const { token } = await requestLink(user.email);
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) => reset(token!, `concurrent-pass-${i}`)),
    );
    const winners = results.filter((r) => r.status === 200);
    expect(winners).toHaveLength(1);
    expect(results.filter((r) => r.status === 400)).toHaveLength(5);
    const winner = results.indexOf(winners[0]);
    await signIn(user.email, `concurrent-pass-${winner}`).expect(200);
    expect(
      await prisma.emailJob.count({ where: { recipientId: user.id, kind: 'password-changed' } }),
    ).toBe(1);
  });

  it('replaces earlier links on a new request and revokes outstanding ones on reset', async () => {
    const user = await account();
    const first = await requestLink(user.email);
    await age(user.id);
    const second = await requestLink(user.email);
    expect(first.token).not.toBe(second.token);
    expect((await reset(first.token!).expect(400)).body.code).toBe('reset_link_invalid');

    // An outstanding token that slipped in (e.g. issued concurrently) dies with the reset.
    const stray = randomBytes(32).toString('base64url');
    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: sha256(stray), expiresAt: new Date(Date.now() + 600_000) },
    });
    await reset(second.token!).expect(200);
    await reset(stray).expect(400);
    const outstanding = await prisma.passwordResetToken.count({
      where: { userId: user.id, consumedAt: null, revokedAt: null },
    });
    expect(outstanding).toBe(0);
  });

  it('rejects expired links and does not email links that stopped being usable', async () => {
    const user = await account();
    await post('/auth/forgot-password').send({ email: user.email }).expect(202);
    await recovery.settled();
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await age(user.id);
    await worker.runOnce();
    expect(transport.sent).toHaveLength(0);
    expect(await prisma.emailJob.findFirst({ where: { recipientId: user.id } })).toMatchObject({
      status: 'SKIPPED',
      skipReason: 'token_expired',
    });
    expect(
      (await prisma.passwordResetToken.findFirst({ where: { userId: user.id } }))!.mailPayload,
    ).toBeNull();

    const { token } = await requestLink(user.email);
    await prisma.passwordResetToken.updateMany({
      where: { tokenHash: sha256(token!) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await reset(token!).expect(400)).body.code).toBe('reset_link_invalid');
    await signIn(user.email, password).expect(200);
  });

  it('retries failed delivery with bounded attempts and keeps the public response generic', async () => {
    const user = await account();
    const { MailDeliveryError } = require('../dist/modules/mail/mail-transport') as typeof import('../src/modules/mail/mail-transport');
    transport.failures.push(new MailDeliveryError('SMTP 421', false), new MailDeliveryError('SMTP 421', false));
    const { response } = await requestLink(user.email);
    expect(response.status).toBe(202);
    const job = await prisma.emailJob.findFirstOrThrow({ where: { recipientId: user.id } });
    expect(job).toMatchObject({ status: 'PENDING', attempts: 1, lastError: 'SMTP 421' });
    await prisma.emailJob.update({ where: { id: job.id }, data: { availableAt: new Date() } });
    await worker.runOnce();
    expect(await prisma.emailJob.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({
      status: 'FAILED',
      attempts: 2,
    });
    // Nothing that could rebuild the link remains once delivery gave up.
    expect(
      (await prisma.passwordResetToken.findFirstOrThrow({ where: { userId: user.id } })).mailPayload,
    ).toBeNull();
    expect(output.join('')).toMatch(/failed after 2 attempt\(s\): SMTP 421/);
  });

  it('limits issuance per account silently and requests per IP with 429', async () => {
    const user = await account();
    const first = await requestLink(user.email);
    const second = await requestLink(user.email);
    expect(second.response.body).toEqual(first.response.body);
    expect(await prisma.passwordResetToken.count({ where: { userId: user.id } })).toBe(1);
    // The hourly cap holds even when every request is outside the cooldown
    // (requests past the IP limit go to the service directly).
    for (let i = 0; i < 3; i++) {
      await age(user.id);
      await requestLink(user.email);
    }
    for (let i = 0; i < 2; i++) {
      await age(user.id);
      await recovery.requestReset(user.email);
      await recovery.settled();
    }
    expect(await prisma.passwordResetToken.count({ where: { userId: user.id } })).toBe(5);
    // Limits never lock the account.
    await signIn(user.email, password).expect(200);
    const limited = await post('/auth/forgot-password').send({ email: user.email }).expect(429);
    expect(limited.body.code).toBe('rate_limited');
    for (let i = 0; i < 10; i++) await reset(randomBytes(32).toString('base64url')).expect(400);
    await reset(randomBytes(32).toString('base64url')).expect(429);
  });

  it('stops socket game commands once another instance revoked the session', async () => {
    const user = await account();
    const socket = io(baseUrl, {
      path: '/api/socket.io',
      auth: { token: user.token },
      transports: ['websocket'],
      extraHeaders: { Origin: origin },
      forceNew: true,
      reconnection: false,
    });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve());
      socket.once('connect_error', reject);
    });
    // Revoked in the database only, as a reset handled by another instance would.
    await prisma.authSession.updateMany({ where: { userId: user.id }, data: { revokedAt: new Date() } });
    await new Promise((resolve) => setTimeout(resolve, 5_200));
    const ack = await socket
      .timeout(3000)
      .emitWithAck('game.resign', { gameId: randomUUID(), requestId: randomUUID() });
    expect(ack).toMatchObject({ ok: false, error: { code: 'unauthenticated' } });
    await waitFor(() => !socket.connected);
  });

  it('never logs passwords, raw tokens or reset links', async () => {
    const user = await account();
    const { token } = await requestLink(user.email);
    await reset('x'.repeat(43)).expect(400);
    await reset(token!).expect(200);
    await worker.runOnce();
    const logged = output.join('');
    for (const secret of [token!, newPassword, password, 'reset-password#token'])
      expect(logged).not.toContain(secret);
  });
});
