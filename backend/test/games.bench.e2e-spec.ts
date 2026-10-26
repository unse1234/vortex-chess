import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { fork } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { cpus, totalmem } from 'node:os';
import { join } from 'node:path';

/**
 * Move-pipeline benchmark: real Socket.IO clients (in a separate process) and
 * PostgreSQL. Opt-in:
 *   GAME_BENCH=1 TEST_DATABASE_URL=... npx vitest run --config ./vitest.config.e2e.ts test/games.bench.e2e-spec.ts
 * GAME_BENCH_GAMES, GAME_BENCH_PLIES and GAME_BENCH_THINK_MS ("min-max")
 * shape the load; GAME_BENCH_OUT writes the JSON report.
 */
const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl && process.env.GAME_BENCH === '1' ? describe : describe.skip;
const origin = 'http://localhost:3000';
const GAMES = Number(process.env.GAME_BENCH_GAMES ?? 100);
const PLIES = Number(process.env.GAME_BENCH_PLIES ?? 40);
const [THINK_MIN, THINK_MAX] = (process.env.GAME_BENCH_THINK_MS ?? '500-1500').split('-').map(Number);

type ClientStats = { ack: number[]; delivery: number[]; rejected: number; errors: string[]; seconds: number };

function percentiles(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p: number) => sorted[Math.max(0, Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1))] ?? 0;
  const round = (n: number) => Math.round(n * 1000) / 1000;
  return { count: sorted.length, p50: round(at(50)), p95: round(at(95)), p99: round(at(99)), max: round(sorted.at(-1) ?? 0) };
}

suite('Move pipeline benchmark', () => {
  it(
    `plays ${GAMES} concurrent games`,
    async () => {
      Object.assign(process.env, {
        NODE_ENV: 'test',
        DATABASE_URL: databaseUrl,
        JWT_ACCESS_SECRET: randomBytes(48).toString('hex'),
        CORS_ORIGINS: origin,
        EXPIRY_SWEEP_INTERVAL_SECONDS: '0',
        MAIL_WORKER_INTERVAL_SECONDS: '0',
      });
      const { AppModule } = require('../dist/app.module') as typeof import('../src/app.module');
      const { configureApp } = require('../dist/configure-app') as typeof import('../src/configure-app');
      const { PrismaService } = require('../dist/database/prisma.service') as typeof import('../src/database/prisma.service');
      const { AuthService } = require('../dist/modules/auth/auth.service') as typeof import('../src/modules/auth/auth.service');
      const { RoomsService } = require('../dist/modules/rooms/rooms.service') as typeof import('../src/modules/rooms/rooms.service');
      const { GameMetrics } = require('../dist/modules/games/services/game-metrics') as typeof import('../src/modules/games/services/game-metrics');
      const fixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
      const app = fixture.createNestApplication<NestExpressApplication>({ bodyParser: false });
      configureApp(app);
      await app.listen(0, '127.0.0.1');
      const baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
      const prisma = app.get(PrismaService);
      const metrics = app.get(GameMetrics);
      const userIds: string[] = [];

      try {
        // Accounts through the real registration service (hashing dominates setup).
        const accounts: { id: string; token: string }[] = [];
        for (let i = 0; i < GAMES * 2; i += 8) {
          const batch = await Promise.all(
            Array.from({ length: Math.min(8, GAMES * 2 - i) }, async () => {
              const tag = randomUUID().slice(0, 8);
              const issued = await app.get(AuthService).register({
                username: `Bn_${tag}`,
                email: `${tag}@vortix-bench.invalid`,
                password: 'bench-password-123',
                confirmPassword: 'bench-password-123',
                acceptTerms: true,
              } as never);
              return { id: issued.body.user.id, token: issued.body.accessToken };
            }),
          );
          accounts.push(...batch);
          userIds.push(...batch.map((a) => a.id));
        }
        // Ready rooms started through the real start command (10+5).
        const games: { gameId: string; tokens: string[] }[] = [];
        for (let g = 0; g < GAMES; g++) {
          const [host, guest] = [accounts[2 * g], accounts[2 * g + 1]];
          const room = await prisma.room.create({
            data: {
              hostId: host.id,
              challengerId: guest.id,
              status: 'READY',
              hostReady: true,
              challengerReady: true,
              initialMs: 600_000,
              incrementMs: 5_000,
              colorPreference: 'WHITE',
              expiresAt: new Date(Date.now() + 3_600_000),
            },
          });
          const started = await app.get(RoomsService).start(host.id, room.id, { expectedRevision: 1 });
          games.push({ gameId: started!.gameId!, tokens: [host.token, guest.token] });
        }

        metrics.reset();
        const clients = fork(join(__dirname, 'support', 'bench-clients.js'), [], { stdio: 'inherit' });
        const stats = await new Promise<ClientStats>((resolve, reject) => {
          clients.once('message', (message) => resolve(message as ClientStats));
          clients.once('error', reject);
          clients.once('exit', (code) => reject(new Error(`Load clients exited with ${code}`)));
          clients.send({ baseUrl, origin, plies: PLIES, thinkMin: THINK_MIN, thinkMax: THINK_MAX, games });
        });
        const server = metrics.summary();
        const report = {
          environment: {
            cpu: cpus()[0]?.model,
            logicalCpus: cpus().length,
            memoryGb: Math.round(totalmem() / 2 ** 30),
            node: process.version,
            database: 'PostgreSQL 18.6 on the same host (loopback), fsync=on, synchronous_commit=on',
            transport: 'Socket.IO websocket over loopback; load clients in a separate Node process on the same host',
          },
          load: {
            concurrentGames: GAMES,
            sockets: GAMES * 2,
            pliesPerGame: PLIES,
            thinkTimeMs: `${THINK_MIN}-${THINK_MAX}`,
            acceptedMoves: server.count,
            rejectedMoves: stats.rejected,
            seconds: Math.round(stats.seconds * 10) / 10,
            movesPerSecond: Math.round(server.count / stats.seconds),
          },
          serverMs: server,
          clientAckRoundTripMs: percentiles(stats.ack),
          opponentDeliveryMs: percentiles(stats.delivery),
        };
        console.log(JSON.stringify(report, null, 2));
        if (process.env.GAME_BENCH_OUT) writeFileSync(process.env.GAME_BENCH_OUT, JSON.stringify(report, null, 2));
        expect(stats.rejected).toBe(0);
        expect(stats.errors).toEqual([]);
        expect(server.count).toBeGreaterThan(0);
      } finally {
        await prisma.game.deleteMany({ where: { participants: { some: { userId: { in: userIds } } } } });
        // Rooms first: nulling a ready challenger seat would violate the readiness constraint.
        await prisma.room.deleteMany({ where: { hostId: { in: userIds } } });
        await prisma.user.deleteMany({ where: { id: { in: userIds } } });
        await app.close();
      }
    },
    20 * 60_000,
  );
});
