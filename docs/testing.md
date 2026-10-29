# Tests and documentation audit evidence

Audit date29 October2026. Implementation status and verification are separate dimensions. The [catalog](feature-catalog.md) has **79 inventory units:61 Implemented,4 Partially implemented,3 Mock/demo only,11 Disabled / Coming Soon**. Grouping is explicit (for example all game-ending draw rules are one inventory unit). Counts do not measure feature quality or deployment readiness.

## Evidence vocabulary

- **Verified by an existing test (T):** the checked-in test exercises/asserts the described behavior. Unit runs below passed; referenced PostgreSQL integration scenarios were inspected but not rerun here.
- **Verified during this documentation task (D):** only commands/checks listed as executed below, not inherited milestone evidence.
- **Inspected in source only (S):** runtime wiring/control/state read without a new browser/integration execution.
- **Not verified because configuration/dependency is unavailable (U):** live SMTP, compatible deployed engine, isolated database/host/browser setup were not established for this audit. Do not infer outage or missing implementation from this label.

No manual/browser gameplay, email delivery, production mutation, hosted deployment, live engine smoke or load test was performed. A unit success/build/typecheck cannot establish those outcomes. Historical milestone test reports retain their original dates and are not repeated as current results.

## Safe local commands

From repository root (or omit `--prefix` inside the respective application):

```powershell
npm --prefix frontend test
npm --prefix backend test
npm --prefix frontend run lint
npm --prefix frontend run typecheck
npm --prefix backend run lint
npm --prefix backend run typecheck
node docs/check-docs.mjs
git diff --check
```

Frontend Vitest uses Node environment and `src/**/*.test.{ts,tsx}` with the `@` alias. These are logic/service tests, not rendered browser journeys. Backend unit config includes `**/*.spec.ts`, separate from `.e2e-spec.ts`. Real engine calls and PostgreSQL suites are excluded from normal unit command. Backend typecheck/build prehooks generate Prisma Client; they do not run migrations. Commit hook runs both apps' lint/typecheck but not tests/builds.

Production builds (supported scripts, not automatically evidence of deployment):

```powershell
npm --prefix backend run build
npm --prefix frontend run build
```

Frontend build can require Google font download and valid public env. No Markdown linter existed in package scripts. The dependency-free `docs/check-docs.mjs` added for this audit checks internal links/anchors, balanced fences/table cells, explicit repository code-path references, catalog totals, route/model/migration counts, API source/OpenAPI/docs coverage, local OpenAPI refs, audio file hashes and configuration/script documentation. Generated/ignored local env files and symbolic shorthand paths are excluded from file-reference checks. It is a targeted documentation consistency check, not a general Markdown parser, executable API validator or external-link checker.

## Existing test mapping

Paths are relative to `frontend/src/` and `backend/`. Read test names/assertions for narrower limits than a feature heading.

| Catalog area | Frontend coverage | Backend unit / integration coverage |
| --- | --- | --- |
| A01–A05,A10 auth/session | `features/auth/schemas/auth.schema.test.ts`, `services/auth-session.service.test.ts`, `queries/session.queries.test.ts`, `config/routes.test.ts` | `src/modules/auth/auth.schemas.spec.ts`, `test/app.e2e-spec.ts`: normalization, concurrent uniqueness, hash/public views, login, refresh/replay/family isolation/expiry/logout, CSRF/CORS/throttle/health |
| A06–A07 recovery | `features/auth/services/password-recovery.service.test.ts` | `src/modules/auth/password-reset.spec.ts`, `password-reset-token.spec.ts`; `test/password-recovery.e2e-spec.ts`: generic responses, cooldown/replace/status/consume races, all-session revocation, outbox |
| R01–R09 rooms/invites | `features/rooms/realtime/{room-events,room-start}.test.ts`, `features/invitations/realtime/reconcile-invitation.test.ts` | `src/modules/{rooms/rooms,invitations/invitations}.spec.ts`; `test/rooms-invitations.e2e-spec.ts`: roles, full/expiry/duplicate/stale/seat races, idempotent actions |
| R10–R13 inbox/mail | `features/notifications/realtime/reconcile-notifications.test.ts`, `notification-text.test.ts`, `notification-audio.test.ts` | rooms/invitations integration: owner paging/read vs accept, notification dedupe, offline enqueue/pre-send skip, transport double/retries/claim limits; recovery integration for token mail |
| G01,G06–G14 game/rules/recovery | `features/games/board-position.test.ts`, `pgn.test.ts`, `result-text.test.ts`, `realtime/reconcile-game-snapshot.test.ts`, `utils/format-time-control.test.ts`, `lib/realtime/socket-realtime-client.test.ts` | `src/modules/games/rules/chess-rules.spec.ts`, `clocks/game-clock.spec.ts`, `services/game-commands.spec.ts`; `test/games.e2e-spec.ts`: actual HTTP/PG/sockets, special moves/full game, command races/dedupe, timeouts/draw/resign, save-failure and restart |
| G02–G03 engine | result/reconciler tests; no actual browser-engine journey here | `src/modules/engines/http/http-engine.adapter.spec.ts`, `engines.service.spec.ts`, games `clocks/engine-budget.spec.ts`, `services/engine-turns.spec.ts`; `test/engine-games.e2e-spec.ts`: real app + local HTTP double; `engine-live.e2e-spec.ts` optional real upstream |
| G04–G05,S02 matchmaking | `features/matchmaking/realtime/matchmaking-events.test.ts` | `test/matchmaking.e2e-spec.ts`: admission/exact presets/cancel/arrival expiry, duplicate/concurrent/old-ID cases, cross-process DB admission, restart/full game |
| G16–G19 history/manual | `features/games/pgn.test.ts`, `analysis-tree.test.ts`, snapshot reconciler | `services/analysis-preview.spec.ts`; games/engine integration: history/private replay/preview, illegal/promotion/corrupt-prefix behavior |
| S01–S04 ratings | `features/ratings/queries/ratings.queries.test.ts`, game snapshot rating tests | `src/modules/ratings/{rating-policy,rating-eligibility}.spec.ts`; `test/ratings.e2e-spec.ts`: result eligibility, atomic profiles/audit/floor/rounding, rollback/dedup/races, ranking/pagination/recovery |
| S05–S11 social/presence | `features/social/realtime/social-sync.test.ts`, notification text/audio tests | `src/modules/social/social.spec.ts`, `src/modules/realtime/friend-presence.spec.ts`; `test/social.e2e-spec.ts`: private bounded search, actor rights, opposite send/rate/accept/cancel/block races, challenge/mail skip, pairing/block and committed-game preservation, grace presence |
| O01–O04 audio | `features/audio/{audio-manager,audio-preferences}.test.ts`, `features/games/audio/game-audio.test.ts`, notification audio tests | no speaker/device/browser autoplay integration suite |
| O07–O09 infrastructure | `lib/http/api-error.test.ts`, auth/socket tests | `src/config/environment.spec.ts`, `src/common/pagination/cursor.spec.ts`, `src/database/retry-transaction.spec.ts`; auth integration health/error checks |

Source-only portions include visible route composition/forms/dialog rendering, responsive behavior, actual clipboard permission, real audio output/autoplay, accessibility, terms placeholder and gated/demo controls. Helper tests can validate branches, but do not establish browser pagehide/Activity behavior on actual devices. No checked-in browser runner/test script is provided by the current package scripts. There is no coverage-percentage result from this task.

## PostgreSQL integration procedure

Use an isolated, dedicated migrated test database with no live API process attached. Suites create users/data and clean their fixtures, but startup resumes all active games in that database and mail workers can claim its jobs. A production/shared DB is never safe. Set private environment locally without pasting its real URL into docs.

From `backend/`, configure DATABASE_URL for the isolated test DB, then:

```powershell
npm run db:migrate
$env:TEST_DATABASE_URL=$env:DATABASE_URL
npm run test:e2e
```

`test:e2e` builds Nest first to preserve decorator metadata, then runs `vitest.config.e2e.ts` with fileParallelism=false (each app startup resumes active games). Without TEST_DATABASE_URL the database suites explicitly skip; a green skipped run is not database verification. Nothing here starts/creates a test PostgreSQL cluster automatically.

`engine-games.e2e-spec.ts` uses `test/support/engine-service-double.ts` for HTTP failures/behavior; it is not proof of deployed-engine compatibility. `engine-live.e2e-spec.ts` additionally requires ENGINE_LIVE_URL and can write an ENGINE_LIVE_OUT report; it calls the real service and is opt-in. Benchmark `games.bench.e2e-spec.ts` needs GAME_BENCH=1 plus DB; GAME_BENCH_GAMES(default 100), GAME_BENCH_PLIES(default 40), GAME_BENCH_THINK_MS(default 500-1500) shape load and GAME_BENCH_OUT writes a report. These live/load paths were not run here.

## Executed audit checks

Environment observed: Windows PowerShell, Node 24.12.0, npm11.21.1. Installed unit tools executed successfully, but Node 24.12.0 is below package-declared supported24.15.0; use the declared version for normal work/hosting.

| Command / inspection | Result during this task |
| --- | --- |
| `git status --short`, branch/remotes and tracked workflow/config inventory | started clean on main; origin established; no tracked CI/container/seed/hosting manifests found; restricted global-ignore warnings, no source mutation |
| Route/controller/schema/service/repository/gateway/schema+migration/asset/mock/script/test inspection |20 pages,19 models,12 migrations,61 concrete HTTP operations; catalog79 units |
| `npm.cmd test` in frontend | **PASS: 25 files,134 tests** |
| `npm.cmd test` in backend | **PASS: 20 files,202 tests**; expected injected-failure logs and Vite config/tsconfig-path warning; no live upstream call |
| `npm.cmd run lint` in frontend and backend | **PASS** (ESLint zero warnings; oxlint) |
| `npm.cmd run typecheck` in frontend and backend | **PASS**, including backend Prisma Client generation; no migration |
| `node docs/check-docs.mjs` | **PASS**:28 Markdown files,287 internal links/anchors,61 controller/OpenAPI/documented operations,324 local OpenAPI refs,20 page files,19 models,12 migrations and12 audio hashes |
| `git diff --check` | **PASS**; Git emits line-ending conversion notices for this Windows checkout |
| `git fetch origin` and branch comparison | **PASS**; main matched origin/main before the documentation commit |

TEST_DATABASE_URL and ENGINE_LIVE_URL were unset in the audit shell (checked as booleans without printing values). No dedicated isolated database was established, so database tests were not run; no production/shared database was used as a substitute. Builds were not rerun for this Markdown/example-only change. Commit-time hooks and final publication are recorded in the final report; the commands above are the independently executed validation evidence.

The first documentation commit's pre-commit hook also passed both applications' lint/typecheck, including Prisma generation. Final publisher review reconciled server `session.ended` and `channel.closed` signals, and the documentation checker now verifies named realtime messages against source. Staged additions were reviewed for scope and common private-key/token patterns with zero matches; that pattern scan is a limited check, not a guarantee that arbitrary prose cannot contain sensitive data.

This task did not configure/run DB integration, real SMTP delivery, engine-live/benchmark, manual browser or production deployment. No destructive setup/cleanup commands were executed. Existing local installs were reused. Runtime source was not changed; the sole configuration edit replaces the example engine address with an unset/commented placeholder.

## Keeping docs current

For a runtime change, update the affected guide/catalog and OpenAPI if wire contracts change; preserve existing milestones as dated history. Add a feature inventory row for new routes/dialogs/jobs/direct-link controls, not only navigation. Reconcile flags with actual mount/transport/controller/persistence. Run `node docs/check-docs.mjs`; then the checks appropriate to the actual runtime change. Treat old plans, generated schemas, build success and historical prompts as secondary evidence to code/tests.
