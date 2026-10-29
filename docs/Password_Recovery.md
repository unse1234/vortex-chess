# Password recovery — 28 October 2026

> **Historical milestone / handoff.** Preserved for dated decisions and original verification reports. Current scope, setup and contracts are superseded by the [feature catalog](feature-catalog.md), [current documentation index](../README.md), [deployment guide](deployment.md), [API notes](api.md) and [current testing evidence](testing.md). Old future-work statements, UCI-process proposals and test/performance counts are not proof of current functionality.


Signed-out players can request an emailed link and choose a new password. The feature lives in the authentication domain. It reuses the existing Argon2id hashing, `AuthSession` revocation, the `EmailJob` outbox and worker, the throttler, and the auth UI components. It adds no new provider, infrastructure or dependency.

## User flow

1. **Sign in → "Forgot password?"** opens `/forgot-password`. The player enters an email (trimmed and lowercased like sign-in). The page always answers: "If an account exists for this email, you'll receive a password reset link." It offers **Send again**, **Use a different email** and **Back to sign in**.
2. The email links to `https://<APP_PUBLIC_URL>/reset-password#token=<token>`. It states the expiry, and the link works once.
3. `/reset-password` reads the token from the URL fragment, removes it from the address bar and history, and checks the link without consuming it. Unusable links show "This reset link is invalid, has expired or was already used" with **Request a new link**.
4. The player enters and confirms a new password (8–128 characters, the registration policy), with a strength meter and accessible show/hide toggles.
5. On success the page says every device was signed out and links to **Sign in**. The player is not signed in automatically.

Both routes sit in the `(auth)` group, so they are reachable while signed out and no session redirect applies. In the MSW demo (`NEXT_PUBLIC_API_MOCKING=enabled`) recovery remains *Coming Soon*: there is no mocked success path.

## HTTP contract

All three are CSRF-guarded auth POSTs: exact `Origin` plus `X-Vortix-CSRF: 1`, `Cache-Control: no-store`. They are in [openapi.json](../backend/openapi.json).

| Endpoint | Body | Result | IP limit |
| --- | --- | --- | --- |
| `POST /api/auth/forgot-password` | `{ email }` | 202 `{ message }`, identical for known and unknown emails | 5/min |
| `POST /api/auth/reset-password/status` | `{ token }` | 200 `{ valid: true, expiresAt }` or `{ valid: false }`; read-only | 20/min |
| `POST /api/auth/reset-password` | `{ token, password, confirmPassword }` | 200 `{ message }` and the refresh cookie cleared | 10/min |

`reset-password` returns 400 `reset_link_invalid` for malformed, unknown, expired, replaced and used tokens alike. Password-policy failures return 400 `validation_error` with `fieldErrors` and do **not** use up the token. Rate limits return 429 `rate_limited`.

## Module ownership

| Concern | Owner |
| --- | --- |
| Validation and HTTP mapping | `AuthController` + `auth.schemas.ts` (`forgotPasswordSchema`, `resetPasswordSchema`, shared `emailSchema`/`passwordSchema`) |
| Use cases and orchestration | `PasswordRecoveryService` (request, status, reset, mail decisions, expiry sweep) |
| Token persistence and conditional writes | `PasswordResetRepository` |
| Token generation and sealing | `password-reset-token.ts` |
| Email content | `password-reset-email.template.ts` |
| Hashing | existing `PasswordService` |
| Session revocation | `AuthService.revokeUserSessionsInTx` / `announceRevoked` |
| Delivery | existing `EmailOutboxService` + `EmailWorkerService` |

Frontend: `password-recovery.service.ts` holds the typed Axios calls and normalizes errors to `ApiError`. `use-password-recovery.ts` holds the mutations. `ForgotPasswordForm` and `ResetPasswordForm` render the forms and feedback. `ForgotPasswordScreen` and `ResetPasswordScreen` own the layout and fragment handling. The two App Router pages are thin.

## Tokens

- **Credential:** 32 random bytes (256 bits) as 43 base64url characters. It is not a JWT.
- **Storage:** `PasswordResetToken` stores only `tokenHash` (SHA-256, unique). It also holds `userId`, `createdAt`, `expiresAt`, `consumedAt` and `revokedAt`, with indexes on `(userId, createdAt)` and `expiresAt`.
- **Expiry:** `PASSWORD_RESET_TTL_MINUTES`, default **30** (allowed 5–120).
- **Replacement policy:** each newly issued link revokes the account's earlier outstanding links. Only the newest email works.
- **Issuance limits:** these are per account and enforced in the database, so they hold across instances. At most one email per `PASSWORD_RESET_COOLDOWN_SECONDS` (default 60) and `PASSWORD_RESET_MAX_PER_HOUR` (default 5). Requests inside a limit are silently ignored and get the same public response. While the cooldown is active, the previous link stays valid. Requests never change the password, end sessions or lock the account.
- **Concurrency:** issuance locks the `User` row (`SELECT … FOR UPDATE`), so concurrent requests for one account serialize, and at most one new link survives.

### Atomic reset

Before any transaction, a read-only lookup rejects unusable links without spending an Argon2id hash. The new password is then hashed outside the transaction. A single transaction then:

1. locks the user row, in the same order as issuance, so the two cannot deadlock;
2. consumes the token with a conditional `UPDATE … WHERE tokenHash = … AND consumedAt IS NULL AND revokedAt IS NULL AND expiresAt > now RETURNING`. Under PostgreSQL row locking only one concurrent submission gets a row back; the others get `reset_link_invalid`;
3. writes the new password hash;
4. revokes the user's other outstanding reset tokens;
5. sets `revokedAt` on every live `AuthSession` of the user;
6. enqueues the password-changed email in the outbox.

No email or network call happens inside the transaction. Opening the link, or checking it with `/status`, never writes anything, so mail scanners cannot burn links.

## Session revocation

The existing session design already makes `AuthSession.revokedAt` authoritative, and it is shared through PostgreSQL across instances:

- **Refresh cookies** fail on their next rotation (the session is revoked). The reset response also clears this browser's cookie.
- **Access tokens** remain signed JWTs, but every HTTP request (`AccessTokenGuard` → `authenticateSession`) and every socket handshake checks the session row. A revoked session's access token is rejected immediately on any instance.
- **Open sockets on the instance that handled the reset** receive `session.ended` and are disconnected at once (`SessionEventsService`).
- **Open sockets on other instances** are closed by the existing periodic sweep (`REALTIME_SESSION_CHECK_SECONDS`, default 60). They also cannot keep playing: `GamesGateway` now re-confirms the socket's session before a game command when the last confirmation is more than 5 s old, then acknowledges `unauthenticated` and disconnects. The bound for a revoked socket issuing game commands is therefore about 5 s.
- **Client:** a server-side disconnect makes the realtime client renew its token. The refresh fails with 401, `endLocalSession` clears the in-memory token, the session broadcast reaches other tabs, the Query cache is cleared and `RequireSession` sends the player to sign-in.

Games are untouched. A player losing their session is handled by the existing disconnect and clock rules, so the match is neither deleted nor reset.

## Email delivery

- **Reset email:** `kind = 'password-reset'`, written in the issuance transaction with dedupe key `password-reset:<tokenId>`.
- **Changed notice:** `kind = 'password-changed'`, written in the reset transaction. It contains no link credential or password, only the change time and a sign-in link.
- **Link construction:** `APP_PUBLIC_URL` (or the first `CORS_ORIGINS` entry) + `/reset-password#token=…`. Request headers are never used, and no redirect targets are accepted. Environment validation rejects `APP_PUBLIC_URL` values with credentials, a query or a fragment, and requires HTTPS in production.
- **Sealed payload:** the outbox worker must rebuild the link after commit, but the database stores only the digest. The raw token is therefore sealed with AES-256-GCM in `PasswordResetToken.mailPayload`, under a key derived with HKDF from `JWT_ACCESS_SECRET`. The sealed value is cleared when the email is sent or finally fails, when the job is skipped, when the token is consumed, replaced or expired (the sweep follows `EXPIRY_SWEEP_INTERVAL_SECONDS`), and on reset. `EmailJob` rows never contain the link. Rotating `JWT_ACCESS_SECRET` makes queued reset emails skip with `payload_unavailable`; users simply request a new link.
- **Validity recheck:** just before sending, the worker rechecks the token. Consumed, replaced and expired tokens are recorded as `SKIPPED` and not sent.
- **Retries:** the existing outbox behavior applies: `MAIL_MAX_ATTEMPTS` (default 5), exponential backoff from `MAIL_RETRY_BASE_SECONDS` capped at one hour, SMTP 5xx treated as permanent, and leases for crashed workers. A final failure is logged as `Email job <id> (<kind>) failed after N attempt(s): <SMTP code>`, without the recipient or content. The public response is unaffected by delivery failures.
- **Deployment:** the worker runs in-process (`MAIL_WORKER_INTERVAL_SECONDS`). `FOR UPDATE SKIP LOCKED` claiming makes it safe on several instances.

## Abuse protection and sensitive data

- **Rate limits:** per-IP limits use the existing `ThrottlerGuard` (table above). Its storage is in-memory, so with N instances the effective IP limit is N×; the per-account database limits are global. Unknown and known emails take the same awaited path (one indexed lookup). Issuance runs after the response, so there is no obvious timing difference.
- **Logging:** there is no request-body logging. The exception filter logs error names only, and worker logs carry job id, kind and SMTP code. The e2e suite captures every application log line and asserts that no password, token or reset URL appears.
- **Frontend error handling:** errors are converted to `ApiError` (code, status, message), so Axios configs and request bodies are never kept or rendered.
- **Frontend storage:** tokens and passwords live only in component memory and `useMutation` state, with `gcTime: 0` and no query keys. They are never written to local or session storage. The app has no analytics.
- **Referrers:** the token is in the URL fragment, which browsers never send to servers or in `Referer`. It is stripped from the address bar immediately. The page also sets `<meta name="referrer" content="no-referrer">` and `noindex`, and the email HTML is `no-referrer`.
- **Existing protections:** cookie, CORS and CSRF protections are unchanged.

## Migration and deployment

1. Apply `backend/prisma/migrations/202610280003_password_reset` with `npm run db:migrate`. It is additive: one new table and one nullable `EmailJob` column.
2. Configure SMTP (`MAIL_TRANSPORT=smtp`, `MAIL_FROM`, `SMTP_*`). With `disabled`, links stay queued as `PENDING` and are never delivered.
3. Set `APP_PUBLIC_URL` to the public HTTPS frontend origin.
4. Optionally tune `PASSWORD_RESET_TTL_MINUTES`, `PASSWORD_RESET_COOLDOWN_SECONDS` and `PASSWORD_RESET_MAX_PER_HOUR`. All variables are documented in `backend/.env.example`.
5. Deploy the backend before or together with the frontend. The frontend enables recovery whenever it runs in API mode.

## Verification (28 October 2026)

- **Backend:** `typecheck`, `lint` and `build` are clean. Unit tests: 151 passed, including token sealing, email rendering and schema policy.
- **Backend e2e** (`test:e2e` against local PostgreSQL): 81 passed, 4 skipped. The skips are the opt-in benchmark and live-engine suites. `test/password-recovery.e2e-spec.ts` covers:
  - identical responses, and storing a digest rather than the raw token;
  - checking a link without consuming it;
  - malformed, unknown, expired, replaced and used tokens;
  - the password policy;
  - the new password working and the old one failing;
  - revocation of access tokens, refresh cookies and sockets;
  - exactly one of six concurrent submissions succeeding;
  - revocation of other outstanding tokens;
  - delivery retry, final failure and payload clearing;
  - per-account and per-IP limits;
  - socket game commands refused after a revocation committed outside the instance;
  - no credentials in logs.
- **Frontend:** `typecheck` and `lint` are clean. Tests: 123 passed. `build` succeeded with `/forgot-password` and `/reset-password` prerendered.
- **Browser:** Chrome via Playwright, against the production build, the local API and a local SMTP sink. The flow passed: sign-in link → generic confirmation for unknown and known emails → email received → link opened (fragment stripped, `no-referrer`, zero requests carrying the token) → mismatch validation → reset. Afterwards a second signed-in device was sent to sign-in, a reused link showed the invalid state with "Request a new link", the old password was rejected, the new password was accepted, and the password-changed notice arrived without a token.
- **Not tested:** delivery through a real production SMTP provider.

## Remaining limitations

- Per-IP throttling is per instance (in-memory), as for the other auth routes. Moving the throttler to shared storage would make it global.
- Sockets on other instances can keep receiving broadcast events for up to `REALTIME_SESSION_CHECK_SECONDS` after revocation. Game commands are refused after about 5 s.
- Access JWTs are not revoked cryptographically. They are rejected by the session check, which every protected path already performs.
- Email ownership is still not verified at registration, so recovery trusts the registered address.
