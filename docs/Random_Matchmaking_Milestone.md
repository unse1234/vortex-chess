# Random matchmaking — 28 October 2026

Authenticated accounts can use **Find Players / Play Online → Find Match** to enter a casual, unrated human game. This milestone supersedes the older plans' exclusion of random matchmaking. Friend invitations, private rooms and engine games retain their own setup flows. Ratings, Elo, rankings, engine fallback, public browsing and all other deferred capabilities remain disabled.

## Lifecycle and clocks

1. Choose any existing room time-control preset, including increment. Compatibility requires exact `initialMs` **and** `incrementMs` equality; there are no rating or skill bands.
2. A search lasts **five minutes** from its original join. Duplicate joins return the existing search without extending its lifetime. A different preset conflicts until the current search is cancelled.
3. Joining claims the oldest compatible waiting account (`queuedAt`, then `userId` as a stable tie-breaker). Both accounts enter a durable **confirming** reservation with a **30-second** deadline. No game or clock exists yet. The authenticated session bridge automatically confirms each participating account; any of its tabs/devices can confirm.
4. The second confirmation atomically consumes both reservations and creates exactly one `RANDOM` game with server-assigned random colors. The existing game creation convention starts White's clock at this commit. Both clients navigate to `/games/{gameId}`. Normal arena commands, legal moves, increments, persistence, draw offers, resignations, timeout adjudication, final results, PGN, history, replay and manual post-game analysis apply.
5. If both confirmations do not arrive in time, both reservations become idle with `arrival_expired`. There is no game, penalty, result or automatic requeue. The user may search again.
6. Before the game commits, cancellation releases the search and any reserved opponent. After commit, cancellation returns the existing assignment and does not undo the game. Standard game disconnect/clock behavior applies once both accounts have confirmed; readiness is consent to start, not a continuous connection guarantee.

Disconnecting, closing a tab, navigating or signing out **does not cancel** a search. Another tab/device may still be active. Searches/reservations survive until cancellation or their persisted deadline, without socket-presence counting or heartbeat leases. The UI explains this policy and exposes Cancel Search. Refresh restores the original search, elapsed time, selected preset and reservation. A missed assignment is returned by the authoritative status query while the game is active; finished games are available through history and their existing route.

## Persistence and concurrency

`MatchmakingSearch` is one durable row per account (`userId` primary key), with a new UUID `searchId` for each search, a monotonically increasing account revision, settings, queue/deadline timestamps, reservation UUID, readiness, game assignment and final idle reason. Internal reservation/account fields are not exposed in personal events. Assignments reference the existing Game and use its two registered-player seats; engine seats are never synthesized.

Every queue mutation, expiry operation and eligibility read runs under PostgreSQL transaction advisory lock `vortix:game-admission`. **Friend-game creation and engine-game admission acquire the same lock** before checking eligibility. An active game of any mode prevents a new search or new game. A live search/reservation prevents a friend or engine start until cancellation. Creating/configuring a private room still works normally; its start can return `409 matchmaking_active` or `409 active_game_conflict`.

The final two-seat claim, active-game check, game/participant insertion and both assignment updates share one transaction. Concurrent instances, duplicate joins/confirmations, match-versus-cancel and friend-start-versus-search therefore have a single order. A stale cancel/confirmation carries the old `searchId` and cannot affect a newer search. A failed transaction commits neither a partial claim nor a partial game. There is no in-memory queue or process-local correctness lock.

Expiry is checked inside each status/mutation transaction and by a five-second maintenance sweep. Startup requires no array reconstruction: the next operation uses PostgreSQL's persisted queue/reservation/readiness/assignment. Existing game bootstrap recovery reconstructs active games and follows the established clock restart policy; server downtime is not charged.

## HTTP and realtime contract

All endpoints are below `/api`, use the existing Bearer access-token/session guard, and derive the account from `request.user.id`. Bodies are strict Zod objects; client player IDs and unsupported presets are rejected. POSTs return 200. Existing error normalization and throttling apply.

| Endpoint | Request | Response / behavior |
| --- | --- | --- |
| `GET /matchmaking/options` | none | `enabled`, existing `timeControls`, `defaultTimeControlId`, `searchTtlMs: 300000`, `arrivalTtlMs: 30000` |
| `GET /matchmaking` | none | Authoritative account status; also enforces expiry and clears finished-game assignments |
| `POST /matchmaking/join` | `{ timeControl: { initialMs, incrementMs } }` | Idempotent current search/reservation/active assignment; incompatible active search returns `409 search_already_active` |
| `POST /matchmaking/cancel` | `{ searchId }` | Current status after idempotent cancellation; stale IDs and already committed matches are unchanged |
| `POST /matchmaking/ready` | `{ searchId }` | Idempotent readiness; second valid confirmation creates the game transactionally |

The status object contains `revision`, `state` (`idle`, `searching`, `confirming`, `matched`), `searchId`, `timeControl`, `queuedAt`, `expiresAt`, `ready`, `gameId`, `reason`, `serverTime`. An account that has never searched has revision 0 and nullable fields. Idle reasons include `cancelled`, `opponent_cancelled`, `search_expired`, `arrival_expired`, `game_finished`. A matched status always has a game ID.

Events use the existing authenticated Socket.IO `event` envelope on the personal `user` channel:

```json
{ "channel": "user", "type": "matchmaking.status", "payload": { "matchmaking": "<status object>" } }
{ "channel": "user", "type": "matchmaking.found", "payload": { "matchmaking": "<matched status object>" } }
```

The publisher addresses each account's authenticated server-owned socket room, including every tab/device; no public subscription or client-supplied recipient is accepted. Immediate publication happens after commit. A five-second per-worker relay reads committed revisions for **only that worker's authenticated connected accounts**, so a worker also emits changes committed by another worker. Its bounded connection-scoped revision map suppresses redundant relay events and is not authoritative state. No distributed Socket.IO adapter or Redis dependency is introduced.

Delivery is at-most-once and may repeat/reorder around immediate publication, relay and reconnect. Events trigger an authoritative HTTP refetch. The session-level bridge owns one subscription, cleans it up, confirms reservations and navigates at most once per assignment. Query structural sharing applies account revision ordering to HTTP and mutation completions, preventing a slow response from restoring a cancelled search or replacing a newer assignment. Active status polls every two seconds (idle: ten seconds), including HTTP recovery when realtime is disconnected. Logout clears sensitive queries through the established session policy.

## Frontend boundaries and flags

- Axios operations and the personal-event adapter live in `features/matchmaking/services` and `realtime`.
- TanStack Query options, commands, revision reconciliation and readiness/recovery coordination live in the feature's `queries` and `hooks`.
- The screen composes these hooks and the existing time-control picker. It presents idle, searching, cancelling, preparing/matched, disconnected and error states, elapsed search time, retry and cancellation. The shared bridge stays mounted across platform/arena routes; its runtime pathname hook has a Suspense boundary for Next.js cache-component prerendering.

Backend `MATCHMAKING_ENABLED` defaults to `true` with this paired implementation. `false` refuses joins and readiness (`503 matchmaking_disabled`) but preserves status/cancel recovery. The frontend capability is enabled only in real API mode; the existing standalone MSW demo keeps matchmaking Coming Soon. The live Find Match button additionally requires successful backend options with `enabled: true`, supported presets and loaded current status. Missing, older or disabled backends cannot start a search. All other deferred feature flags are unchanged. No fabricated counts, waits or ratings are shown.

## Migration and rollout

No runtime dependency was added. This uses existing PostgreSQL/Prisma, NestJS, Socket.IO, Axios and TanStack Query.

Apply both migrations in order **before starting the new backend**:

1. `202610280001_random_mode` adds `RANDOM` to `GameMode` in its own migration so PostgreSQL can commit the enum before use.
2. `202610280002_matchmaking` creates the account-keyed queue/assignment table, state/pair/assignment constraints, foreign keys and compatibility/FIFO indexes. No existing rooms, seats, games or history records are rewritten.

```powershell
cd backend
npm.cmd run db:migrate
npm.cmd run build
```

Deploy the matching frontend build against that API (`NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_API_MOCKING=disabled`) with explicit frontend CORS origin and matching cookie settings. Production Next.js builds require access to the project's existing Google Fonts. For a staged rollout, start the backend with `MATCHMAKING_ENABLED=false`, deploy the frontend and then enable the backend. Disabling admission later does not abort games; queued users can still read/cancel and reservations still expire.

## Verification

Dedicated local PostgreSQL databases were created/migrated for automated integration and browser checks; the normal application database was not migrated or used for test accounts. Test fixtures use the real registration service for concurrency batches to avoid the intentional five-signups-per-minute HTTP limit. Integration HTTP access and Socket.IO authentication remain real.

| Check | Result |
| --- | --- |
| Backend build, typecheck, lint | Passed |
| Backend unit suite | 142 passed |
| Full PostgreSQL integration regression | 71 passed, 4 opt-in benchmark/live-engine tests skipped |
| Matchmaking cases | Auth/strict identity, presets/increments, self-match/duplicate joins, oldest compatible account, concurrent six-account matching and duplicate confirmations, cancel/join and cancel/confirm races, stale cancels, friend-start/active-game conflicts, five-minute/arrival expiry, multi-tab delivery, disconnects and three backend restart boundaries, runtime flag disabled, two independent backend instances |
| Real transport game | Two authenticated Socket.IO clients enter a random 3+2 game, play `f3 e5 g4 Qh4#`, and verify checkmate, four persisted moves, increments, PGN, random-mode history and next-search eligibility |
| Frontend unit suite | Passed, including stale HTTP/mutation reconciliation and subscription cleanup |
| Frontend build, typecheck, lint | Passed after fixing the new bridge's Suspense boundary |

Browser verification details and final rerun counts are recorded below when the rendered two-client check completes.

## Remaining limits

The shared admission lock intentionally serializes short admission/queue transactions across all presets. Status expiry maintenance currently scans pending/finished-assignment rows; this is a correctness-first implementation, not a high-volume matchmaking benchmark. Sharding locks or moving to an outbox/notification transport would require measured load evidence and a coordinated admission design.

The relay makes **matchmaking** notifications work across backend instances without a new dependency. The existing gameplay runtime, game-channel presence, game restart handling and deployment topology are preserved; this milestone does not redesign live-game workers or certify general horizontally distributed arena hosting. HTTP status remains the recovery authority when events are delayed or lost. No live external engine load test was run; existing engine integration regressions use their HTTP service double.
