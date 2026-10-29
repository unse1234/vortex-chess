# Backend foundation and authentication milestone

> **Historical milestone / handoff.** Preserved for dated decisions and original verification reports. Current scope, setup and contracts are superseded by the [feature catalog](feature-catalog.md), [current documentation index](../README.md), [deployment guide](deployment.md), [API notes](api.md) and [current testing evidence](testing.md). Old future-work statements, UCI-process proposals and test/performance counts are not proof of current functionality.


Updated: 22 October 2026.

This milestone adds NestJS configuration, PostgreSQL/Prisma persistence, users, email/password authentication, HTTP guards/errors/validation, health checks and frontend authentication integration. Rooms, invitations, games, Socket.IO, UCI and evaluation remain later milestones. Existing frontend design and Coming Soon controls are preserved.

## Local setup

See [backend setup](../backend/README.md), [backend environment example](../backend/.env.example) and [frontend setup](../frontend/README.md). Backend defaults to `http://localhost:3001/api`; frontend defaults to `http://localhost:3000`. Configure a dedicated PostgreSQL database, a random signing secret, and the exact frontend origin. Credentials belong in ignored local environment files or deployment secret management.

```powershell
# backend directory, after configuring .env
npm ci
npm run db:validate
npm run db:migrate
npm run start:dev
# frontend directory, after copying its .env.example to .env.local
npm ci
npm run dev
```

Migration: `backend/prisma/migrations/202610220001_auth_foundation/migration.sql`. It creates `User`, `AuthSession`, and `RefreshToken`, foreign keys, indexes and normalization constraints. Prisma Client generation runs before build/typecheck/development startup. Production migration deployment is explicit; startup never creates or changes database schema.

## HTTP contract

[OpenAPI JSON](../backend/openapi.json) is the machine-readable contract. Existing frontend service paths are retained. All auth POSTs require `Origin` matching `CORS_ORIGINS` and `X-Vortix-CSRF: 1`; the Axios transport supplies the custom header and credentials. Responses are `Cache-Control: no-store`.

| Method and path | Input | Success |
| --- | --- | --- |
| `POST /api/auth/sign-up` | `username`, `email`, `password`, `confirmPassword`, `acceptTerms: true` | 201, public user + access token; establishes refresh cookie |
| `POST /api/auth/sign-in` | `email`, `password`, optional `remember` | 200, public user + access token; establishes refresh cookie |
| `POST /api/auth/refresh` | HttpOnly refresh cookie | 200, public user + new access token; rotates refresh cookie |
| `GET /api/session` | Bearer access token | 200, `{ user }` |
| `POST /api/session/sign-out` | Refresh cookie when present | 204; revokes its session and clears cookie; idempotent |
| `POST /api/auth/forgot-password` | `email` | 202, generic `{ message }` whether or not the account exists ([password recovery](Password_Recovery.md)) |
| `POST /api/auth/reset-password/status` | `token` | 200, `{ valid: true, expiresAt }` or `{ valid: false }`; never consumes the token |
| `POST /api/auth/reset-password` | `token`, `password`, `confirmPassword` | 200, `{ message }`; ends every session and clears the refresh cookie; 400 `reset_link_invalid` for unusable links |
| `GET /api/auth/username-availability` | `username` query | `{ username, available, tag: null }` |
| `GET /api/health` | None | `{ status: "ok", region: "local" }`; matches the frontend latency service |
| `GET /api/health/live` | None | Process liveness |
| `GET /api/health/ready` | None | Database readiness; 503 if unavailable |

Auth responses contain `{ user, accessToken, expiresIn }`. Public user fields are `id`, `username`, `email`, `avatarUrl` (currently null), `createdAt`, and `updatedAt`. Password hashes, normalized username keys, refresh secrets and session rows never appear in user JSON. API mode no longer fabricates levels, XP, rank or premium status in the account contract.

Errors use `{ code, message, fieldErrors? }`, with arrays of messages per field. Validation returns 400, incorrect credentials/expired sessions 401, CSRF rejection 403, duplicate identities 409 and rate limits 429. Unknown server/database failures have generic 500 responses without internal details. Invalid JSON and oversized bodies also return normalized errors.

## Identity and session decisions

- Login accepts email and password only. Registration requires matching confirmation. Passwords are 8-128 characters; login accepts existing passwords up to that maximum without trimming their contents. Alternative providers and OTP are absent from the API and disabled in the frontend. Password recovery by emailed link is described in [Password recovery](Password_Recovery.md).
- Email is trimmed and lowercased, with no provider-specific dot/plus alias rewriting. Username is 3-20 ASCII letters, digits or underscores; display case is preserved, with a unique lowercase key. Database CHECK constraints bind normalization to unique indexes, including concurrent writes.
- Passwords use Argon2id with 64 MiB memory, three iterations and one lane. Missing-user login still verifies against a dummy hash. The API imposes request/body limits and per-IP throttling on authentication/availability endpoints.
- Access JWTs default to five minutes and carry issuer/audience/session claims. They are held only in frontend memory. The access guard also checks the database session so logout/revocation is immediate.
- Refresh tokens have 256 bits of randomness; only SHA-256 hashes are persisted. Refresh obtains a row lock, consumes the old token and writes a replacement atomically. Reusing a consumed token commits revocation of the session family before returning 401. Old token hashes remain for replay detection until session cleanup.
- Sessions have absolute expiry: 24 hours normally or 30 days for remembered login by default. Non-remembered sessions use a browser-session cookie with the same server-side lifetime bound. Remembered cookies expire with their database session. Refresh does not extend the absolute lifetime.
- Logout revokes the cookie's session, even when its access token has expired, and clears that cookie. Other independent device sessions are not revoked.
- Email ownership verification is not implemented. Future email invitation work must establish an ownership policy before relying on addresses as verified identities.

## Browser coordination and deployment

Axios handles HTTP/retry mechanics through a typed adapter supplied by the auth feature. Tokens and refresh policy live in feature services. TanStack Query/hooks own cache changes; components render existing loading/errors and forms. Domain services/types stay outside generic `lib/`.

An empty memory token triggers cookie-based refresh during session restoration, followed by current-user validation. Concurrent refreshes in a tab share one promise. Web Locks serialize refresh requests across tabs of the same frontend origin so requests use the latest cookie. Each failed authenticated request is retried at most once after successful refresh; auth endpoint failures never recursively refresh. Refresh 401 or a retried 401 ends local identity; transport/503 failures remain visible failures.

Session generations discard stale protected/refresh responses after logout or account changes. Private query/mutation state is removed; the current-session query is updated in place so mounted guards receive logout/expiry notifications. BroadcastChannel carries session events only, clearing identity in other tabs. No credentials/tokens go to localStorage/sessionStorage or broadcast messages. Browsers without Web Locks retain per-tab coordination; actual concurrent old-token replay intentionally revokes the session.

Local HTTP uses `localhost` consistently, `SameSite=Lax`, HttpOnly, and non-Secure cookies. Production requires HTTPS and Secure cookies; the cookie name becomes `__Host-vortix_refresh`, with path `/` and no Domain. Prefer same-site domains or a same-origin reverse proxy. An explicitly cross-site frontend requires `SameSite=None; Secure`, exact credentialed CORS and browser cookie support. Proxy trust is off by default; enable only for the actual trusted topology. Throttling currently uses single-instance memory; shared rate-limit storage is needed before running multiple replicas.

API mode is the default. Standalone MSW demo mode requires explicit `NEXT_PUBLIC_API_MOCKING=enabled`; real API failures never activate it. Launcher game/social calls currently show missing-endpoint errors in API mode because those backend modules are deliberately outside this milestone.

## Verification and handoff

Run backend typecheck/lint/unit/build checks and `npm run test:e2e` with `TEST_DATABASE_URL` pointing at a dedicated migrated database. E2E builds compiled Nest code first to preserve decorator metadata. Without that variable database tests are explicitly skipped; they do not substitute an in-memory database. Tests delete only records they create.

Implementation verification uses an isolated PostgreSQL 18 cluster on loopback, without modifying the pre-existing local PostgreSQL service. The initial migration was applied there. The temporary API/database were stopped after testing; the pre-existing PostgreSQL service remains running. Automatic approval review blocked recursive deletion of the stopped temporary cluster directory (reason: "blocked by policy"), so `%TEMP%/vortix-auth-pg-5af8c07e5af84dc194299d0aba2dafd3` remains outside the repositories. Persistent deployment credentials/database configuration still belong to the user environment. Verified results:

- Prisma schema validation and initial migration deployment passed against the temporary PostgreSQL 18 database.
- Backend typecheck, lint, build and 20 unit tests passed. All 16 real HTTP/PostgreSQL integration tests passed, including independent-session isolation and database-clock expiry.
- Frontend typecheck, lint, production build and all 37 tests passed.
- Playwright/Chromium against the real API at localhost:3000/3001 passed registration (including confirmation), wrong-password feedback, login, allowed return queries, cookie-based reload restoration, logout across tabs and database-expired session redirection. Desktop 1440x1000 and mobile 390x844 had no runtime/hydration errors or overflow. Browser plugin was unavailable; the installed Playwright runtime was used.
- The local OpenAPI JSON parsed, and all 33 local references resolved across nine endpoint paths.
- Backend production dependency audit reported zero vulnerabilities. The host's Node 24.12 executes the checks, but installed CLI dependencies warn that Node 24.15+ is supported; use the documented runtime for ongoing development.

Remaining environment work: configure a permanent DATABASE_URL, generated JWT_ACCESS_SECRET, exact CORS_ORIGINS and deployment cookie/HTTPS settings. Production HTTPS/cross-site-cookie behavior has not been deployed or tested. Existing launcher game/social requests return 404 in API mode until those later backend modules exist; those are intentional scope boundaries, not substituted mocks.

The expiry regression exposed Prisma adapter timezone conversion with non-UTC database sessions. API connections now explicitly force UTC; expiry is tested using a database-clock SQL update as well as JWT expiry. See the [Prisma adapter timezone issue](https://github.com/prisma/prisma/issues/26786). Cached account/latency/list islands also render consistent initial loading markup before reading the browser cache, avoiding route hydration mismatches.

Framework/security references used while implementing: [Prisma 7 setup](https://www.prisma.io/docs/orm/v7/prisma-client/setup-and-configuration/introduction), [NestJS rate limiting](https://docs.nestjs.com/security/rate-limiting), and [OWASP CSRF guidance](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).
