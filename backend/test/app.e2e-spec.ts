import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID, randomBytes } from 'node:crypto';
import request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import type { PrismaService as PrismaServiceType } from '../src/database/prisma.service';

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const origin = 'http://localhost:3000';
const password = 'correct-password-123';
const secret = randomBytes(48).toString('hex');

// Compiled code preserves Nest constructor metadata. No database or auth mocks.
suite(
  'Authentication API with PostgreSQL (set TEST_DATABASE_URL to a migrated test database)',
  () => {
    let app: NestExpressApplication;
    let prisma: PrismaServiceType;
    const createdIds = new Set<string>();
    const input = (overrides = {}) => {
      const id = randomUUID().slice(0, 8);
      return {
        username: `E2e_${id}`,
        email: `${id}@vortix-e2e.invalid`,
        password,
        confirmPassword: password,
        acceptTerms: true,
        ...overrides,
      };
    };
    const post = (path: string) =>
      request(app.getHttpServer())
        .post(`/api${path}`)
        .set('Origin', origin)
        .set('X-Vortix-CSRF', '1');
    const cookie = (response: request.Response) =>
      (response.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
    async function register(body = input()) {
      const response = await post('/auth/sign-up').send(body).expect(201);
      createdIds.add(response.body.user.id);
      return response;
    }
    beforeEach(async () => {
      Object.assign(process.env, {
        NODE_ENV: 'test',
        DATABASE_URL: databaseUrl,
        JWT_ACCESS_SECRET: secret,
        CORS_ORIGINS: origin,
        COOKIE_SECURE: 'false',
        COOKIE_SAME_SITE: 'lax',
      });
      const { AppModule } =
        require('../dist/app.module') as typeof import('../src/app.module');
      const { PrismaService } =
        require('../dist/database/prisma.service') as typeof import('../src/database/prisma.service');
      const { configureApp } =
        require('../dist/configure-app') as typeof import('../src/configure-app');
      const fixture = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      app = fixture.createNestApplication<NestExpressApplication>({
        bodyParser: false,
      });
      configureApp(app);
      await app.init();
      prisma = app.get(PrismaService);
    });
    afterEach(async () => {
      if (prisma)
        await prisma.user.deleteMany({
          where: { id: { in: [...createdIds] } },
        });
      createdIds.clear();
      await app?.close();
    });

    it('registers normalized identities, hashes passwords and returns only public fields', async () => {
      const body = input();
      const response = await register({
        ...body,
        email: ` ${body.email.toUpperCase()} `,
      });
      expect(
        Math.abs(Date.now() - Date.parse(response.body.user.createdAt)),
      ).toBeLessThan(60000);
      expect(response.body.user).toMatchObject({
        email: body.email,
        username: body.username,
        avatarUrl: null,
      });
      expect(Object.keys(response.body.user).sort()).toEqual([
        'avatarUrl',
        'createdAt',
        'email',
        'id',
        'updatedAt',
        'username',
      ]);
      expect(response.body).not.toHaveProperty('refreshToken');
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['set-cookie'][0]).toContain('HttpOnly');
      expect(response.headers['set-cookie'][0]).toContain('SameSite=Lax');
      expect(response.headers['set-cookie'][0]).not.toContain('Expires=');
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: response.body.user.id },
      });
      expect(user.passwordHash).toMatch(/^\$argon2id\$/);
      expect(user.passwordHash).not.toContain(password);
      const token = await prisma.refreshToken.findFirstOrThrow({
        where: { session: { userId: user.id } },
      });
      expect(token.tokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(cookie(response)).not.toContain(token.tokenHash);
    });
    it('rejects duplicate email and case-insensitive username', async () => {
      const body = input();
      await register(body);
      const email = await post('/auth/sign-up')
        .send(input({ email: body.email.toUpperCase() }))
        .expect(409);
      expect(email.body.fieldErrors.email).toBeDefined();
      const username = await post('/auth/sign-up')
        .send(input({ username: body.username.toLowerCase() }))
        .expect(409);
      expect(username.body.fieldErrors.username).toBeDefined();
    });
    it('enforces unique identities during concurrent registrations', async () => {
      const body = input();
      const responses = await Promise.all([
        post('/auth/sign-up').send(body),
        post('/auth/sign-up').send(body),
      ]);
      expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
      for (const r of responses)
        if (r.status === 201) createdIds.add(r.body.user.id);
      expect(await prisma.user.count({ where: { email: body.email } })).toBe(1);
    });
    it('enforces normalization constraints even for direct database writes', async () => {
      const body = input();
      await expect(
        prisma.user.create({
          data: {
            email: body.email.toUpperCase(),
            username: body.username,
            usernameKey: body.username.toLowerCase(),
            passwordHash: 'irrelevant',
          },
        }),
      ).rejects.toThrow();
      await expect(
        prisma.user.create({
          data: {
            email: body.email,
            username: body.username,
            usernameKey: 'different',
            passwordHash: 'irrelevant',
          },
        }),
      ).rejects.toThrow();
    });
    it('validates registration confirmation and email-only login', async () => {
      const response = await post('/auth/sign-up')
        .send(input({ confirmPassword: 'wrong' }))
        .expect(400);
      expect(response.body.fieldErrors.confirmPassword).toBeDefined();
      await post('/auth/sign-in')
        .send({ identifier: 'username', password })
        .expect(400);
      await post('/auth/sign-in')
        .send({ email: 'username', password })
        .expect(400);
    });
    it('logs in by email, rejects incorrect credentials and protects current user', async () => {
      const body = input();
      await register(body);
      await post('/auth/sign-in')
        .send({ email: body.email, password: 'wrong' })
        .expect(401);
      await post('/auth/sign-in')
        .send({ email: 'missing@vortix-e2e.invalid', password: 'wrong' })
        .expect(401);
      const login = await post('/auth/sign-in')
        .send({ email: body.email.toUpperCase(), password, remember: true })
        .expect(200);
      expect(login.headers['set-cookie'][0]).toContain('Expires=');
      await request(app.getHttpServer()).get('/api/session').expect(401);
      await request(app.getHttpServer())
        .get('/api/session')
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .expect(200)
        .expect((r) => expect(r.body.user.email).toBe(body.email));
      await request(app.getHttpServer())
        .get('/api/session')
        .set('Authorization', 'Bearer forged')
        .expect(401);
    });
    it('rotates refresh tokens and revokes a reused token family', async () => {
      const registered = await register();
      const rotated = await post('/auth/refresh')
        .set('Cookie', cookie(registered))
        .send({})
        .expect(200);
      expect(cookie(rotated)).not.toBe(cookie(registered));
      expect(rotated.body.accessToken).not.toBe(registered.body.accessToken);
      await post('/auth/refresh')
        .set('Cookie', cookie(registered))
        .send({})
        .expect(401);
      await post('/auth/refresh')
        .set('Cookie', cookie(rotated))
        .send({})
        .expect(401);
      await request(app.getHttpServer())
        .get('/api/session')
        .set('Authorization', `Bearer ${rotated.body.accessToken}`)
        .expect(401);
    });
    it('keeps independent sessions valid when another token family is revoked', async () => {
      const body = input();
      const first = await register(body);
      const second = await post('/auth/sign-in')
        .send({ email: body.email, password })
        .expect(200);
      await post('/auth/refresh')
        .set('Cookie', cookie(first))
        .send({})
        .expect(200);
      await post('/auth/refresh')
        .set('Cookie', cookie(first))
        .send({})
        .expect(401);
      await request(app.getHttpServer())
        .get('/api/session')
        .set('Authorization', `Bearer ${second.body.accessToken}`)
        .expect(200);
      await post('/auth/refresh')
        .set('Cookie', cookie(second))
        .send({})
        .expect(200);
    });
    it('serializes simultaneous rotations and detects replay without two valid sessions', async () => {
      const registered = await register();
      const responses = await Promise.all([
        post('/auth/refresh').set('Cookie', cookie(registered)).send({}),
        post('/auth/refresh').set('Cookie', cookie(registered)).send({}),
      ]);
      expect(responses.map((r) => r.status).sort()).toEqual([200, 401]);
      const success = responses.find((r) => r.status === 200)!;
      await request(app.getHttpServer())
        .get('/api/session')
        .set('Authorization', `Bearer ${success.body.accessToken}`)
        .expect(401);
    });
    it('logs out idempotently and revokes access immediately', async () => {
      const registered = await register();
      const logout = await post('/session/sign-out')
        .set('Cookie', cookie(registered))
        .send({})
        .expect(204);
      expect(logout.headers['set-cookie'][0]).toContain(
        'Expires=Thu, 01 Jan 1970',
      );
      await post('/session/sign-out').send({}).expect(204);
      await post('/auth/refresh')
        .set('Cookie', cookie(registered))
        .send({})
        .expect(401);
      await request(app.getHttpServer())
        .get('/api/session')
        .set('Authorization', `Bearer ${registered.body.accessToken}`)
        .expect(401);
    });
    it('rejects expired sessions', async () => {
      const registered = await register();
      // Expiry written by the database clock must agree with API DateTime reads.
      await prisma.$executeRaw`UPDATE "AuthSession" SET "expiresAt" = now() - interval '1 second' WHERE "userId" = ${registered.body.user.id}::uuid`;
      await post('/auth/refresh')
        .set('Cookie', cookie(registered))
        .send({})
        .expect(401);
      await request(app.getHttpServer())
        .get('/api/session')
        .set('Authorization', `Bearer ${registered.body.accessToken}`)
        .expect(401);
    });
    it('allows a valid refresh after access-token expiry', async () => {
      const registered = await register();
      const session = await prisma.authSession.findFirstOrThrow({
        where: { userId: registered.body.user.id },
      });
      const expired = new JwtService().sign(
        { sub: registered.body.user.id, sid: session.id },
        {
          secret,
          issuer: 'vortix-api',
          audience: 'vortix-frontend',
          expiresIn: -1,
        },
      );
      await request(app.getHttpServer())
        .get('/api/session')
        .set('Authorization', `Bearer ${expired}`)
        .expect(401);
      const refresh = await post('/auth/refresh')
        .set('Cookie', cookie(registered))
        .send({})
        .expect(200);
      await request(app.getHttpServer())
        .get('/api/session')
        .set('Authorization', `Bearer ${refresh.body.accessToken}`)
        .expect(200);
    });
    it('checks username availability without requiring a session', async () => {
      const body = input();
      await request(app.getHttpServer())
        .get('/api/auth/username-availability')
        .query({ username: body.username })
        .expect(200)
        .expect((r) => expect(r.body.available).toBe(true));
      await register(body);
      await request(app.getHttpServer())
        .get('/api/auth/username-availability')
        .query({ username: body.username.toLowerCase() })
        .expect(200)
        .expect((r) =>
          expect(r.body).toMatchObject({ available: false, tag: null }),
        );
    });
    it('requires CSRF header + trusted Origin, and emits explicit credentialed CORS', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({})
        .expect(403);
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Origin', origin)
        .send({})
        .expect(403);
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Origin', 'https://evil.invalid')
        .set('X-Vortix-CSRF', '1')
        .send({})
        .expect(403);
      await request(app.getHttpServer())
        .options('/api/auth/refresh')
        .set('Origin', origin)
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'x-vortix-csrf,content-type')
        .expect(204)
        .expect('Access-Control-Allow-Origin', origin)
        .expect('Access-Control-Allow-Credentials', 'true');
    });
    it('limits excessive login requests', async () => {
      for (let i = 0; i < 10; i++)
        await post('/auth/sign-in')
          .send({ email: 'missing@vortix-e2e.invalid', password })
          .expect(401);
      const limited = await post('/auth/sign-in')
        .send({ email: 'missing@vortix-e2e.invalid', password })
        .expect(429);
      expect(limited.body.code).toBe('rate_limited');
    });
    it('serves liveness/readiness and normalizes malformed JSON errors', async () => {
      await request(app.getHttpServer()).get('/api/health/live').expect(200);
      await request(app.getHttpServer()).get('/api/health/ready').expect(200);
      await request(app.getHttpServer()).get('/api/health').expect(200);
      await post('/auth/sign-in')
        .set('Content-Type', 'application/json')
        .send('{bad')
        .expect(400);
      await post('/auth/sign-in')
        .send({ password: 'a'.repeat(20000) })
        .expect(413);
    });
  },
);
