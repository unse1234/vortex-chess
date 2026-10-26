# Vortex Chess API

NestJS 12 + TypeScript, PostgreSQL and Prisma 7. Implemented: configuration, persistence, users, email/password authentication, health checks (milestone 1), plus private rooms, invitations, notifications, Socket.IO realtime/presence and an outbox for offline invitation emails (milestone 2), plus authoritative player-vs-player games: room start, chess.js rules, server clocks, draw/resign/results, durable moves and restart recovery (milestone 3, [gameplay](../docs/Gameplay_Milestone.md)). The UCI engine, evaluation and history browsing are later milestones.

## Local setup (PowerShell)

Use Node 24.15+ and PostgreSQL 18 (the migration also uses standard PostgreSQL features). Keep the installed NestJS major and the matching Prisma client/adapter/CLI versions in the lockfile.

```powershell
npm ci
Copy-Item .env.example .env
# Generate a signing secret, then put it in the ignored .env file:
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
# With PostgreSQL admin access, create a dedicated application role/database:
createuser --pwprompt vortix_app
createdb --owner=vortix_app vortix_chess
# Edit DATABASE_URL and JWT_ACCESS_SECRET in .env before continuing.
npm run db:validate
npm run db:migrate
npm run start:dev
```

API: `http://localhost:3001/api`. Frontend: `http://localhost:3000`. Install the PostgreSQL bin directory on PATH if `createuser`/`createdb` are not found. PostgreSQL admin authentication is supplied by your local setup; it is not stored in this repository. No database is automatically created on startup. `prisma generate` runs before builds, typechecks and development startup. Use `npm run db:migrate:dev -- --name descriptive_name` only when authoring a new migration; deploy existing migrations with `npm run db:migrate`.

Copy the frontend `.env.example` to `frontend/.env.local`, then run `npm run dev` in that directory. API mode is the default. `NEXT_PUBLIC_API_MOCKING=enabled` is an explicit frontend-only demo mode; real API errors never enable it.

## Configuration

See [.env.example](.env.example). `DATABASE_URL`, a random `JWT_ACCESS_SECRET` of at least 32 characters, and explicit `CORS_ORIGINS` are required. Origins are comma-separated exact origins with no trailing slash, path or wildcard. API binds to `HOST` (default `127.0.0.1`); containers may require `0.0.0.0` behind a trusted ingress.

Local HTTP uses `COOKIE_SECURE=false` and `COOKIE_SAME_SITE=lax`, with both apps on `localhost` (do not mix `localhost` and `127.0.0.1`). Production requires HTTPS frontend origins and `COOKIE_SECURE=true`. Prefer same-site frontend/API domains or a same-origin `/api` reverse proxy. Cross-site deployment explicitly requires `COOKIE_SAME_SITE=none`, Secure cookies and browsers that permit the cookie; browser third-party-cookie policy may still prevent this arrangement. Never set a cookie Domain. The secure cookie uses the `__Host-` prefix.

Keep `TRUST_PROXY_HOPS=0` for direct access. Set a positive value only behind exactly that many trusted proxies and block direct access to the API. Rate limits are per-IP in memory for this single-instance milestone. Multiple API replicas require shared rate-limit storage before deployment; sessions themselves are already stored centrally in PostgreSQL.

Rooms, invitations, realtime and mail add the settings documented in [.env.example](.env.example) and the [rooms/invitations milestone](../docs/Rooms_Invitations_Notifications_Milestone.md#configuration). `MAIL_TRANSPORT=disabled` (default) keeps invitation emails as pending outbox jobs; `MAIL_TRANSPORT=smtp` with `MAIL_FROM`, `SMTP_HOST` and optional `SMTP_USER`/`SMTP_PASSWORD` sends through your provider. Keep SMTP credentials in the ignored `.env`. Socket.IO listens on the API server at `/api/socket.io`; a reverse proxy must forward WebSocket upgrades for that path. Presence, the mail worker and expiry sweep run in-process for the single-instance deployment.

The API forces UTC on every database connection so Prisma DateTime conversion agrees with the database clock, even when the PostgreSQL server defaults to a local timezone.

## Contracts and security

[OpenAPI](openapi.json) is the machine-readable contract. [Authentication milestone](../docs/Backend_Authentication_Milestone.md) describes decisions, browser coordination and test evidence. Existing frontend endpoint paths are retained:

- `POST /api/auth/sign-up`
- `POST /api/auth/sign-in`
- `POST /api/auth/refresh`
- `POST /api/session/sign-out`
- `GET /api/session`
- `GET /api/auth/username-availability?username=...`
- `GET /api/health`, `/api/health/live`, `/api/health/ready`
- Rooms: `GET /api/rooms/options`, `POST /api/rooms`, `GET /api/rooms/:id`, `PATCH /api/rooms/:id/settings`, `POST /api/rooms/:id/ready|cancel|leave`
- Invitations: `POST|GET /api/rooms/:id/invitations`, `GET /api/invitations`, `GET /api/invitations/:id`, `POST /api/invitations/:id/accept|decline|cancel`
- Notifications: `GET /api/notifications`, `GET /api/notifications/unread-count`, `POST /api/notifications/:id/read`, `POST /api/notifications/read-all`
- Games: `POST /api/rooms/:id/start`, `GET /api/games/:id`, and an HTTP fallback for `POST /api/games/:id/moves|resign|draw-offer|draw-offer/response`; moves normally use the Socket.IO commands `game.move`, `game.resign`, `game.draw.offer`, `game.draw.respond` and the `game:<id>` channel ([contract](../docs/Gameplay_Milestone.md#realtime-contract))
- Socket.IO at `/api/socket.io` (handshake `auth.token` = access token); events in the [milestone document](../docs/Rooms_Invitations_Notifications_Milestone.md#realtime-contract)

Room, invitation and notification endpoints use the Bearer token only (no cookies), so they need no CSRF header.

All authentication POSTs require the exact allowed `Origin` and `X-Vortix-CSRF: 1`. Browser transport adds the header and sends credentials; Origin is browser-controlled. Command-line clients must supply both headers. Access JWTs are short-lived, returned only to the client and sent as `Authorization: Bearer ...`. Refresh secrets are only in HttpOnly cookies; PostgreSQL holds SHA-256 digests. Sessions have absolute expiry, refresh tokens rotate atomically, and reuse revokes the session family. Logout invalidates access immediately through a session check on authenticated requests. User JSON never contains password hashes or token records.

Passwords use Argon2id (64 MiB, three iterations, one lane). Emails are trimmed/lowercased without provider-specific alias rewriting. Usernames retain display case and use an ASCII lowercase unique key. Unique indexes plus CHECK constraints enforce the normalization under concurrent writes. Email ownership is not verified in this milestone; future email invitations must resolve ownership policy before trusting addresses.

Expired sessions and their token history should be purged by a scheduled database maintenance job when scheduling infrastructure is introduced. Keep used refresh hashes until their session expires so replay detection remains effective. Example maintenance SQL: `DELETE FROM "AuthSession" WHERE "expiresAt" < now() - interval '7 days';` (token rows cascade). No cleanup process runs implicitly during requests.

## Verification

```powershell
npm run typecheck
npm run lint
npm test
npm run build
# Use a dedicated migrated database, never a production database, with no other API
# instance attached (its mail worker would claim the suite's outbox jobs):
$env:DATABASE_URL='postgresql://YOUR_TEST_USER:YOUR_TEST_PASSWORD@localhost:5432/vortix_auth_test'
npm run db:migrate
$env:TEST_DATABASE_URL=$env:DATABASE_URL
npm run test:e2e
```

Integration files run one at a time (each application instance resumes active games at startup, the restart policy). The games suite (`test/games.e2e-spec.ts`) uses a controllable server clock and covers room start races, full games with special moves, authorization, deduplication, competing moves, clocks and timeouts, draw/resign finalization, reconnection, an injected PostgreSQL write failure and recovery after a restart. `test/games.bench.e2e-spec.ts` is an opt-in move-pipeline benchmark (`GAME_BENCH=1`; see the gameplay milestone).

The integration suite builds Nest code first to preserve constructor decorator metadata, then exercises actual HTTP routes and PostgreSQL (no persistence/auth mocks). Without `TEST_DATABASE_URL` it explicitly skips database tests. It removes only the users created by its own tests. The rooms/invitations suite (`test/rooms-invitations.e2e-spec.ts`) adds real Socket.IO clients and a capturing mail transport: authorization, username/email invitations without email exposure, duplicate and concurrent invitations, concurrent seat claims, idempotent accept/decline/cancel, expiry without the sweep, revision conflicts and readiness invalidation, inbox pagination and ownership, multi-tab presence, sign-out disconnects, outbox send/skip/retry/attempt limit and exclusive claiming. The authentication suite covers normalization and duplicates, concurrent registration, password hashing, validation, authentication, refresh/replay, concurrent rotation, logout, expiry, CSRF/CORS, rate limits and health/error responses.
