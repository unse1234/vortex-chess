# Rated matchmaking, Elo and leaderboards — 28 October 2026

> **Historical milestone / handoff.** Preserved for dated decisions and original verification reports. Current scope, setup and contracts are superseded by the [feature catalog](feature-catalog.md), [current documentation index](../README.md), [deployment guide](deployment.md), [API notes](api.md) and [current testing evidence](testing.md). Old future-work statements, UCI-process proposals and test/performance counts are not proof of current functionality.


Rated random human games, independent pool ratings and leaderboards are enabled in real API mode. This milestone supersedes earlier scope exclusions for ratings and leaderboards. Casual random games, private invitations, engine games, audio, password recovery, history, replay and temporary manual analysis keep their existing behavior. Google authentication, tournaments, XP, rewards and seasons remain disabled.

## Policy: elo-v1

The immutable backend policy lives in `backend/src/modules/ratings/rating-policy.ts`:

| Setting | Value |
| --- | --- |
| Initial rating per pool | 1200 |
| K-factor for everyone, including provisional accounts | 32 |
| Provisional period | First 10 settled rated games in each pool |
| Leaderboard placement | Eligible after settlement number 10 |
| Minimum rating | 100 |
| Expected-score scale | 400 |

For ratings A and B captured at official game creation, `expectedA = 1 / (1 + 10 ** ((B - A) / 400))`. The result score is 1 for a win, 0.5 for a draw and 0 for a loss. Calculate `roundedDeltaA = Math.round(32 * (scoreA - expectedA))` **once**, then constrain that shared delta to `[100 - A, B - 100]`. A receives the constrained delta and B receives its exact negative. Normalize negative zero for display/storage. Ratings are never independently clamped.

Examples: 1200 versus 1200 decisive result is +16/-16; an equal-rating draw is 0/0; 1000 drawing 1400 is +13/-13. If a player already at 100 loses, the shared delta may be zero, preserving the total points. There is no provisional K-factor or minimum-move exemption.

### Explicit pool mapping

The backend returns `ratingPool` on every matchmaking preset. The frontend displays that mapping without classifying clocks itself.

| Pool | Exact existing presets (minutes + increment seconds) |
| --- | --- |
| Bullet | 1+0, 2+1 |
| Blitz | 3+0, 3+2, 5+0, 5+3 |
| Rapid | 10+0, 10+5, 15+10 |
| Casual only | 30+0, 30+20; unknown/custom/unlimited clocks have no rating pool |

Custom/unlimited controls remain unsupported by the existing matchmaking input contract. This feature does not introduce them. Each pool has independent current/peak rating, games, wins, draws, losses and provisional status. Existing games and queued searches default to casual; there is no historical backfill.

## Ownership and transactions

- **Games** owns legal moves, clocks, official start and final result. It creates games, validates commands and claims a final revision. Existing disconnect and server-restart clock policies remain authoritative.
- **Ratings** owns policy, calculation, eligibility, profile persistence and settlement. `RatingsService` takes the existing `Prisma.TransactionClient`; its repositories never start nested transactions or call a network service.
- **Matchmaking** owns durable searches, reservations and admission. It reads current rating profiles to pair players and delegates game creation through Games.
- **RatingsReadService** owns personal rating/history reads and leaderboard queries. The module imports Auth and has no dependency on Games or Matchmaking, avoiding a module cycle.

Rated profiles are created idempotently before queue admission. Game creation locks both profiles in ascending user-ID order and captures authoritative current rating and settled-game count on the seats. Mode, rated flag, pool, policy version, time control, official start and seat rating snapshots become immutable; database triggers enforce this too. Queue records are not rating snapshots.

Non-final moves keep the existing single-statement revision-guarded persistence path. A finishing move, resignation, accepted draw or timeout runs that same write **inside one PostgreSQL transaction**, then settles ratings before commit:

1. The `Game` update claims the expected active revision and locks the game row. A stale competing writer changes nothing.
2. Ratings rechecks the persisted official result and rated eligibility and obtains the unique game settlement, if any.
3. Both profile rows are locked in ascending user-ID order, matching creation/profile initialization. Rating/game-count equality with the game-start snapshots is checked before new settlement.
4. Both profile ratings, peaks, counters and revisions are updated, and one settlement plus exactly two participant changes are inserted.
5. The game result, final move/command, both profiles and audit history commit together. Only then are warm state, acknowledgments and events published.

Every game has at most one `RatingSettlement`; every participant has at most one `RatingChange` for that game. Repeated internal settlement safely returns existing changes. Retried commands use the existing command ledger; concurrent instances use the game revision guard and PostgreSQL locks. Definitively rolled-back deadlocks/serialization conflicts are retried at most three attempts (10/20 ms delays); unknown network/commit errors are not replayed blindly. The warm game is evicted on an ambiguous write and recovered from PostgreSQL on the next access.

The existing shared game-admission lock prevents overlapping active games or searches. Until finalization commits, admission still sees the previous game as active; after it commits, the updated profiles are visible in the same commit. Creation additionally refuses a previous finished rated result without its settlement. A new rated game cannot capture pre-settlement ratings.

### Result eligibility

Only games created explicitly as rated, in `RANDOM` mode, with two distinct registered human seats and a supported pool are eligible. Checkmate, resignation and official timeout count immediately after official start, even at zero moves. Timeout uses the existing chess rules, including a draw when the opponent cannot checkmate. Valid automatic/agreed draws score 0.5 each.

Disconnecting does not settle a result; existing reconnect/clock rules apply. Failed arrival expires before a game exists and has no rating effect. Infrastructure aborts have no scored result and are ineligible; the current infrastructure-abort path is engine-only and engine games are always casual. Friend games, casual games, engine games, history reads, replay and manual analysis never settle ratings. No API accepts a client rating, delta, pool override, policy override or game outcome.

## Matchmaking behavior

`POST /matchmaking/join` adds optional `rated: boolean`, defaulting to **false** for existing clients. A different mode or clock requires cancelling the current search. Pairing requires distinct eligible accounts, identical rated/casual mode and exact initial time **and increment**. Rated games additionally require the same pool and both players' current rating windows:

| Time waiting | Maximum rating difference |
| --- | --- |
| 0–under 15 seconds | 100 |
| 15–under 30 seconds | 200 |
| 30–under 60 seconds | 400 |
| 60 seconds onward | Any rating in the same exact time control/pool |

A new player cannot be pulled outside their own narrow window by someone who waited longer. Joining prefers the oldest compatible opponent (`queuedAt`, then `userId`). Status/polling and the five-second maintenance sweep also pair waiting **rated** searches as windows widen, without requiring another arrival. The existing casual join ordering is preserved.

Reservations, readiness, five-minute search expiry, 30-second arrival expiry, stale-search-ID protection, match-versus-cancel ordering, one queue row per account and cross-instance/restart recovery retain the original matchmaking guarantees. Both confirmations are required before creation starts clocks. No fallback changes mode or time control or inserts an engine opponent.

## Database and deployment

Apply additive migration `202610280004_ratings` after the existing password-reset migration:

```powershell
npm --prefix backend run db:migrate
npm --prefix backend run prisma:generate
```

It adds `RatingPool`, `PlayerRating`, `RatingSettlement`, `RatingChange`, rated game/search metadata and game-seat start snapshots. Composite primary keys enforce user/pool and game/participant uniqueness; foreign keys bind changes to the game settlement, participant and opponent. Checks protect the floor, rating arithmetic, result scores and consistent counters. Profile ordering and personal-history indexes support the read paths. Existing tables/data remain present and historical games stay casual.

Configuration (documented in `backend/.env.example`):

- `MATCHMAKING_ENABLED=true`: existing overall admission gate.
- `RATINGS_ENABLED=true`: rated admission and rating/leaderboard reads. Turning it off preserves status/cancel recovery and settlement of already started rated games. Disable both flags to stop all new matchmaking.
- `MATCHMAKING_RATING_WINDOWS=15:100,30:200,60:400`: increasing `seconds:maxDifference` bounds, unrestricted after the last bound. Startup rejects invalid/non-widening configuration.

Deploy migration and backend before the frontend. When upgrading from an older backend, drain/stop its writers before enabling rated admission; old binaries do not know how to settle ratings. No dependency or Prisma upgrade, new service, Redis, event bus, global browser store or external deployment is required. API mode enables UI; MSW demo mode retains Coming Soon for ratings/leaderboards. Google auth stays disabled. Normal Git push is the only publication performed by this task.

## HTTP and event contract

All paths below are under `/api`, require the existing Bearer session guard and return `Cache-Control: no-store`. Identity always comes from the authenticated account. Queries and mutation bodies are strict, validated contracts. Invalid queries/body fields return 400, missing/ended sessions 401, incompatible admission 409, throttling 429 and disabled capabilities 503.

| Endpoint | Contract |
| --- | --- |
| `GET /matchmaking/options` | Existing options plus `ratingsEnabled`, `policyVersion`, `ratingWindows` and `ratingPool` per preset |
| `GET /matchmaking` | Existing status/revision plus `rated`, `ratingPool`; authoritative recovery |
| `POST /matchmaking/join` | `{ timeControl: { initialMs, incrementMs }, rated?: boolean }`; defaults casual |
| `POST /matchmaking/ready`, `/cancel` | Existing `{ searchId }`, revisioned status; cancellation never undoes a committed match |
| `GET /ratings/me` | `{ policyVersion, items }`; all three profiles, including virtual 1200/zero-game defaults before first rated queue admission |
| `GET /ratings/me/history` | Optional `pool`, `limit` (default 25, max 100), opaque `cursor`; `{ items, nextCursor }`, ordered by timestamp and game ID descending |
| `GET /leaderboard` | Required `pool`, `page` (default 1, max 1,000,000), `limit` (default 25, max 100); `{ pool, page, limit, total, asOf, items }` |
| `GET /leaderboard/me` | Required `pool`; profile plus `status: ranked | provisional | ineligible`, global `rank` or null, `asOf` |

Profile fields: pool, current/peak rating, settled games, wins/draws/losses, monotonic revision, provisional flag and placements remaining. History adds game/opponent public identity, pool, before/delta/after, score, policy and timestamp. Public leaderboard identity is limited to account ID and username; no email, auth or private account fields.

The database calculates **competition rank over the entire eligible pool before pagination**, with deterministic user-ID ascending order inside ties. Equal ratings rank `1, 2, 2, 4`. Profiles with fewer than ten games or `leaderboardEligible=false` are excluded. The latter is reserved for account moderation and has no player-writable endpoint. Counts/ranks and each page use one Repeatable Read snapshot. The browser never downloads the full board to calculate rank.

Game snapshots and compact `game.updated` events add `rating: { rated, pool, policyVersion, snapshots: { w, b }, changes }`. Start snapshots contain rating, settled-game count and provisional status; committed final changes contain before/delta/after/score for each side. Game history adds rated/casual metadata and the viewer's historical change. The existing game revision guards those values against stale events/fetches. After settlement, personal `ratings.updated` carries `{ gameId, pool }` as an invalidation hint only, after commit.

`backend/openapi.json` documents the read and matchmaking contracts. There are no manual-rating or client-result endpoints.

## Frontend

Axios services own transport; TanStack Query hooks own reads, cache, mutations and recovery; screens compose features. Shared rating wire types and a display-only change component avoid sibling feature imports. The architecture lint includes the new ratings feature.

The matchmaking screen selects Rated/Casual and displays the server-mapped pool/rating/provisional state. Unsupported rated clocks show a casual-only explanation and cannot enter the queue. Mode/clock are retained from durable search state on refresh. Arena/replay player cards display immutable starting ratings, and result dialogs/history display committed before/after/delta. Replay/manual analysis display the historical result without recalculation. Account summary shows all three independent pool ratings.

Leaderboard tabs have server-paginated 25-row pages, a current-user placement card, personal rating history and loading/empty/error/retry states. Global leaderboard refresh is bounded to one minute while mounted (plus explicit user refresh). Personal profiles/placement poll every 30 seconds and refresh on reconnect, session focus and committed settlement invalidations. Leaderboards are not invalidated after moves. Personal profile revisions and leaderboard snapshot timestamps reject older responses; existing game reconciliation prevents an older game snapshot from rolling back settlement. Session replacement clears private caches.

## Verification

Verification uses local PostgreSQL 18, the installed Prisma 7.10.1 and separate dedicated test/QA databases, never the project's development or production database.

- Prior work: 151 backend unit tests, 123 frontend tests, 81 PostgreSQL integration tests; lint/typecheck and production builds passed before preservation commit `9e1f441` was pushed to main.
- Implementation: backend and frontend lint/typecheck and production builds pass; **198 backend unit tests** and **129 frontend tests** pass. The full integration run passed **97 tests**, with four pre-existing opt-in live-engine/benchmark skips. This includes the existing auth/recovery, invitation/room, gameplay/history/analysis, engine-service-double and casual matchmaking suites. The final focused ratings run passed all 16 tests.
- New real-PostgreSQL suite covers rated/casual and increment separation, current mutual windows, failed arrivals, authoritative/immutable creation snapshots, zero-move resignation, full checkmate, unequal draws, pool independence, floor conservation, exactly ten placement games, history pagination, duplicate/concurrent/two-instance finalization, restart/reconnect recovery, transaction rollback with an injected audit-write failure, real serialization-failure retries, eligible/tied/global leaderboard ranks, paging bounds, auth and client-input rejection.
- Pure tests cover calculation inputs, rounding, unequal draws, floor conservation, eligibility, configurable window boundaries and bounded retry policy. Frontend tests cover stale in-flight profile/placement reads and independent pool reconciliation.
- Browser: Chromium through the installed Playwright runtime (Browser plugin unavailable), real local production frontend at `http://localhost:3000`, real local API at `http://localhost:3001/api`, and a separate PostgreSQL QA database. Two isolated contexts signed in, chose rated Blitz 3+2, refreshed a queued search, entered the same game, resigned, and saw matching committed -16/+16 results. Reload reopened the persisted result, and game/rating history showed it. Leaderboard checks passed for three pools, provisional and empty states, 27 eligible fixture players paginated 25+2, deterministic ties `1,2,2,4`, and injected 503 feedback followed by successful Retry. Desktop 1440×1000 and mobile 390×844 screenshots were inspected, including the account summary. There were no page/runtime errors or framework overlays. Console responses were the initial signed-out session check (401) and the deliberate error-state response (503); no unexpected application errors occurred. Screenshots and the temporary harness remain outside Git in the system temporary directory.

## Limits

The existing single shared PostgreSQL admission lock favors simple correctness over high queue throughput. Pair queries and global rank queries have not been load-benchmarked for a large public deployment. No anti-collusion system, seasons or rating-based friend/engine games are introduced. The existing multi-instance Socket.IO delivery remains local to each worker; bounded HTTP reads recover missed personal rating invalidations. Existing active-game clock/restart and gameplay ownership limits remain documented in the gameplay milestone. Real production engine-service and SMTP-provider integrations are not part of this ratings verification.
