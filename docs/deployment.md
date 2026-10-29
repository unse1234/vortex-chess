# Setup and deployment

Commands come from [backend/package.json](../backend/package.json), [frontend/package.json](../frontend/package.json), [Prisma configuration](../backend/prisma.config.ts) and startup code. Run commands in the specified directory. No seed, Docker/compose, tracked CI workflow, reverse-proxy manifest or configured hosting pipeline exists. `nest deploy` is a declared convenience command, not evidence of a configured provider deployment.

## Local setup

Use Node **>=24.15.0**, the declared backend engine requirement, with npm. Frontend package has no separate engines field. PostgreSQL is required for real APIs; this repository does not install/manage it. PostgreSQL 18 was used in historical tests; no minimum-server support matrix is enforced in code. Git is needed for normal workflow/Husky.

Provision an isolated app database and login using your PostgreSQL administration tooling. The following SQL is an **illustration with placeholders**, not a command this task executed; substitute locally and keep credentials out of history/shared docs:

```sql
CREATE ROLE vortix_app LOGIN PASSWORD '<local-password>';
CREATE DATABASE vortix_chess OWNER vortix_app;
```

Use a role that can apply the repository's schema/type/index/function/trigger migrations to its owned database; production application/migration privilege separation is not automated here. No extension or seed is configured.

From repository root:

```powershell
npm --prefix frontend ci
npm --prefix backend ci
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env.local
```

Fill ignored local files with your own database connection and generated secret. Generate a signing secret locally with the code below; treat its output as a secret and do not paste it into documentation:

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

From `backend/`:

```powershell
npm run db:validate
npm run db:migrate
npm run start:dev
```

From `frontend/` in another terminal:

```powershell
npm run dev
```

Open `http://localhost:3000`; API `http://localhost:3001/api`. Use localhost consistently for browser frontend/API; do not mix with 127.0.0.1 for cookies. Backend binds127.0.0.1 by default but localhost resolves to it. Sign up to create accounts; there is no development seed/default real account. Set `MAIL_TRANSPORT=disabled` and leave ENGINE_BASE_URL unset when those services are unavailable. Real API failures never enable demo mode.

`prisma:generate` runs through backend `prebuild`, `pretypecheck` and `prestart:dev` hooks; migration deployment is always explicit and does not run on startup. `db:migrate:dev` creates development migrations and may request resets on drift; do not use it on production data. Never run `prisma migrate reset`, drop/truncate/delete operations or reset scripts against a real database while following this setup. Those are destructive and are not part of the documented rollout.

## Environment reference

[environment.ts](../backend/src/config/environment.ts) is authoritative for startup defaults/ranges. Backend `.env` loads through dotenv/ConfigModule; frontend public values come from Next and are embedded during build, so rebuild/restart after changes. Never put credentials in NEXT_PUBLIC variables. Template values are examples, not provisioned services. Required backend values: DATABASE_URL, JWT_ACCESS_SECRET, CORS_ORIGINS.

### Core backend environment

| Key | Default / validation | Purpose |
| --- | --- | --- |
| NODE_ENV | development; development/test/production | production imposes HTTPS/Secure/TLS requirements |
| HOST |127.0.0.1 | bind; containers usually need0.0.0.0 behind ingress |
| PORT |3001;1–65535 | HTTP/socket shared server |
| DATABASE_URL | required PostgreSQL URL | private app database; never expose real value |
| JWT_ACCESS_SECRET | required >=32, rejects obvious placeholders | HS256 signing and reset-mail payload key derivation |
| CORS_ORIGINS | required comma-separated exact origins | no path/trailing slash/wildcard; HTTPS production |
| COOKIE_SECURE |false;true/false | required true in production or SameSite none |
| COOKIE_SAME_SITE |lax; lax/strict/none | cross-site needs none+Secure and browser cookie support |
| ACCESS_TOKEN_TTL_SECONDS |300;1–900 | access JWT lifetime |
| SESSION_TTL_HOURS |24;1–24 | ordinary absolute session duration |
| REMEMBER_SESSION_DAYS |30;1–90 | remembered absolute duration |
| TRUST_PROXY_HOPS |0;0–3 | set only for actual trusted proxy depth; block direct ingress |
| APP_PUBLIC_URL |optional; first CORS origin fallback | fixed base for email links; http(s), no credentials/query/fragment; HTTPS production |
| ROOM_TTL_MINUTES |120;5–1440 | open-room expiry |
| INVITATION_TTL_MINUTES |30;1–1440 | invitation expiry bounded by room |
| MAX_ACTIVE_ROOMS_PER_USER |5;1–50 | live hosted-room admission |
| EXPIRY_SWEEP_INTERVAL_SECONDS |30;0–3600 | room/invite/reset sweeps;0 disables jobs, not operation expiry checks |
| REALTIME_SESSION_CHECK_SECONDS |60;5–900 | established socket session sweep |
| REALTIME_MAX_SOCKETS_PER_USER |10;1–50 | socket count admission |
| FRIEND_REQUEST_MAX_PER_HOUR |30;1–500 | new request sends/account |
| FRIEND_REQUEST_COOLDOWN_SECONDS |300;0–86400 | pair-wide resend cooldown |
| PRESENCE_DISCONNECT_GRACE_MS |3000;0–30000 | last-socket offline grace |
| PASSWORD_RESET_TTL_MINUTES |30;5–120 | single-use link lifetime |
| PASSWORD_RESET_COOLDOWN_SECONDS |60;0–3600 | gap between successful issuance/account |
| PASSWORD_RESET_MAX_PER_HOUR |5;1–20 | issue cap/account |
| MATCHMAKING_ENABLED |true | gates join/ready; status/cancel still recover |
| RATINGS_ENABLED |true | rated joins/pairing and rating reads; existing eligible games still settle |
| MATCHMAKING_RATING_WINDOWS |15:100,30:200,60:400 | increasing seconds:difference list,1–10 bands, seconds<=300,difference<=10000; unrestricted after final band |

Boolean environment flags are strings `true`/`false`; arbitrary truthy strings fail. Lifetime/time-control values are server settings; frontend should consume options rather than hardcode assumptions.

### Mail environment

| Key | Default / validation | Meaning |
| --- | --- | --- |
| MAIL_TRANSPORT |disabled;disabled/smtp | disabled leaves jobs pending |
| MAIL_FROM |optional; required smtp,3–254 chars | operator sender identity |
| SMTP_HOST |optional; required smtp | server hostname |
| SMTP_PORT |587;1–65535 | submission port |
| SMTP_SECURE |false | implicit TLS when true, usually465 |
| SMTP_REQUIRE_TLS |true | require STARTTLS when not implicit; production must true |
| SMTP_USER / SMTP_PASSWORD |optional pair | set both or neither; ignored templates contain no credentials |
| MAIL_WORKER_INTERVAL_SECONDS |10;0–3600 |0 disables scheduled worker and nudge eligibility |
| MAIL_MAX_ATTEMPTS |5;1–20 | copied into each job at enqueue |
| MAIL_RETRY_BASE_SECONDS |30;1–3600 | exponential retry, max 1 h plus jitter |
| MAIL_LEASE_SECONDS |120;10–3600 | abandoned processing reclaim |

SMTP transport connection/greeting timeout 10 sec and socket timeout 20 sec. Provider accepted-recipient checks precede SENT. Production needs an authorized sender/provider setup outside this code; no DNS/domain verification or inbox-delivery confirmation is implemented. Link origin comes from trusted config, not request headers. Disabled SMTP is intentionally not simulated success.

### Engine environment

| Key | Default / validation | Meaning |
| --- | --- | --- |
| ENGINE_BASE_URL |unset | optional compatible http(s) service; HTTPS production, no credentials/query/fragment |
| ENGINE_SEARCH_MOVETIME_MS |200;10–30000 | maximum requested search time, shortened by clock |
| ENGINE_TRANSPORT_RESERVE_MS |1500;0–30000 | reserve for external queue/network |
| ENGINE_COMMIT_RESERVE_MS |150;0–5000 | reserve for validation/commit |
| ENGINE_REQUEST_TIMEOUT_MS |10000;100–60000 | >=search allowance+transport reserve |
| ENGINE_HEALTH_TIMEOUT_MS |3000;100–30000 | health deadline |
| ENGINE_MAX_CONCURRENT_SEARCHES |1;1–64 | in-flight searches/process |
| ENGINE_MAX_QUEUED_SEARCHES |16;0–1000 | waiting searches/process |
| ENGINE_MAX_ACTIVE_GAMES |4;1–1000 | DB admission limit for engine games |
| ENGINE_MAX_ATTEMPTS |3;1–10 | includes first attempt |
| ENGINE_RETRY_BASE_MS |300;0–10000 | bounded exponential backoff |
| ENGINE_ABORT_QUARANTINE_MS |2000;0–60000 | extra slot reservation after possibly-running request |
| ENGINE_RECOVERY_INTERVAL_SECONDS |5;0–3600 | periodic repair;0 leaves commit/startup scheduling |

No UCI executable path or engine-auth-secret variable exists. See [engine contract](engine.md) before configuring an external service. A valid URL does not imply provider readiness/capacity.

### Frontend and test environment

| Key | Default / effect |
| --- | --- |
| NEXT_PUBLIC_API_BASE_URL | development fallback `http://localhost:3001/api`, otherwise `/api`; template explicit localhost; include /api in value |
| NEXT_PUBLIC_API_MOCKING | only exact `enabled` starts demo; default disabled |
| NEXT_PUBLIC_REALTIME_URL | optional socket origin override; default API origin; path still derived as API pathname + `/socket.io` |
| TEST_DATABASE_URL | integration suite database opt-in, not runtime configuration; must be dedicated/migrated/exclusive |
| ENGINE_LIVE_URL | opt-in real-engine smoke dependency, not normal unit testing |
| GAME_BENCH | exact1 opts into move benchmark; not needed for correctness checks |
| HUSKY / CI | install-hook behavior described below; not application feature flags |

## Production rollout

1. Back up and verify recovery of the target PostgreSQL database through your operator tooling. No backup/rollback automation is included.
2. Stop/drain the previous backend writer before replacing it; do not overlap versions or start a second game owner. Committed rated settings are immutable, and older writers must not finalize rated games without settlement support.
3. Install locked dependencies and run checks/build with production-intended frontend public values. Backend build uses Prisma CLI/dev dependencies; install the full build toolchain before build. Do not invoke deployment tools with a package-only production install that omits required build tools.
4. From backend run `npm run db:migrate` to apply all12 ordered migrations through social, before starting dependent backend/frontend versions. Startup is not a migration mechanism. Do not reset migration history or rewrite applied SQL.
5. Start exactly one backend owner. Verify `/api/health/ready`; engine health and mail need separate inspection. Then serve the compatible frontend and verify browser-auth/socket flows on a controlled test account.

Build/start from each app:

```powershell
# backend/
npm ci
npm run build
npm run db:migrate
npm run start:prod
```

```powershell
# frontend/; public API/realtime values must be set before build
npm ci
npm run build
npm run start
```

Set NODE_ENV=production and validated server env in the process manager/host. Backend production target is `node dist/main`; frontend is Next's server, not a static export. `next/font/google` may need build-time network access; errors are not proof of application defects. No host manager/service definition is shipped. Logs go to process output; persistence must be external PostgreSQL, not ephemeral local container files.

Use HTTPS browser origins and COOKIE_SECURE=true. Prefer same-site frontend/API hosts or same-origin `/api` reverse proxy. CORS_ORIGINS must match the exact browser frontend origin; cookies have no Domain. A cross-site arrangement needs COOKIE_SAME_SITE=none, Secure and browser third-party-cookie support and is not verified here. Set proxy hop trust only to the real count and prevent clients from bypassing that ingress, or spoofed forwarding headers affect IP throttling.

Proxy `/api/*` to Nest and forward Socket.IO HTTP polling/WebSocket upgrades at `/api/socket.io`; preserve the expected prefix/path and sufficient heartbeat timeouts. Serving frontend at another base path is not configured. NEXT_PUBLIC_REALTIME_URL overrides origin only, not backend socket path. In containers HOST may need0.0.0.0; expose only through the intended ingress. Readiness only checks DB, so dependency monitoring must separately cover SMTP/engine.

Full multi-instance operation is unsupported: presence maps, room/game publications, timers/serial lanes, engine gate and rate limits are local. Every backend bootstrap resumes all active games. Shared DB locks/queue tests and exclusive outbox claiming do not solve game ownership. A future scale-out needs explicit ownership/routing, distributed presence/publishing/throttling and a revised restart policy before adding replicas.

## Hooks and package tooling

There is no root package script runner; `npm --prefix` dispatches to each app. Root `.husky/pre-commit` sequentially runs frontend lint/typecheck then backend lint/typecheck and stops on failure. It does not automatically run tests/build/migrations. Backend `prepare-husky.mjs` skips install when HUSKY=0, NODE_ENV=production or CI=true; otherwise installs the root hook directory. Frontend prepare directly installs root Husky. Do not bypass validation to force a documentation commit through; record blockers instead.

`npm ci` can mutate installed dependencies/hook setup but not source; this documentation task reused existing installations. Further scripts include backend format, test:watch/test:cov/test:debug, start:debug, deploy and Prisma development commands; frontend dev/build/start/lint/typecheck/test. See [testing](testing.md) for exact safe checks and [operations](operations.md) for recovery without destructive resets.
