# Player-versus-engine gameplay milestone

Updated: 26 October 2026. Follows the [gameplay](Gameplay_Milestone.md) and [history/replay](History_Replay_Analysis_Milestone.md) milestones. This is phase 5 ("Engine play") of the [project plan](Vortix_Chess_Project_Plan.md#19-implementation-sequence-and-completion-gates).

A signed-in player can start a timed game against the teammate's engine from the launcher. The server owns the engine's turns: it asks the engine service for a move, validates the reply with chess.js and applies it through the same atomic move, clock and result pipeline as a player's move. Authentication, rooms, PvP gameplay, clocks, history/replay and temporary manual analysis are unchanged.

Out of scope, as agreed: evaluation bars, best-move hints, accuracy and automated review. Temporary manual analysis stays independent and never calls the engine. No Elo or difficulty labels are shown, because the service exposes none.

## Integration boundary

**This supersedes the plan's §17 instruction that NestJS spawn a UCI executable.**

```
Browser ──Axios/Socket.IO──▶ NestJS ──HTTP/JSON──▶ FastAPI engine service ──UCI──▶ teammate's engine
```

- The browser only talks to our API. It never sees the engine service URL.
- NestJS has no UCI process manager and installs no replacement engine.
- Base URL: `https://chess-engine-production-b495.up.railway.app` (`ENGINE_BASE_URL`).

### Upstream contract as consumed

Read from the service's `/openapi.json` (title "Lightweight Chess Engine API", version `0.1.0-phase6`) on 26 October 2026.

| Endpoint | We send | We accept |
| --- | --- | --- |
| `GET /health` | — | `{ status, engine, ready }`, all required. `ready: false` blocks new games. |
| `POST /analyze` | `{ fen, limits: { movetime } }`: a six-field FEN and **exactly one** limit. For game turns it is always a clock-aware `movetime` (10–30 000 ms). We never send `depth`/`nodes` with it, and never rely on the documented default of depth 6. | `{ success: true, bestmove, ponder, score, depth, nodes, nps, time_ms, pv, timed_out }`. Every field is validated at runtime. `bestmove`, `ponder` and every `pv` entry must match `^[a-h][1-8][a-h][1-8][qrbn]?$` (promotion suffix included). `score` is null or `{ type: "cp" \| "mate", value: int }`. |

Only `bestmove` can become a game move. `ponder` and `pv` are validated but never applied. No undocumented fields (such as move history) are sent.

**Observed deviations from the published schema:**

- **Nested error bodies.** Error bodies arrive as FastAPI's `{"detail": {"success": false, "error": …, "detail": …}}` rather than the documented top-level `ErrorResponse`. 422 uses `{"detail": [ … ]}`. The adapter accepts all three; the HTTP status decides the classification.
- **Unsearched replies.** Some replies report a legal move with `depth: 0, nodes: 0, time_ms: 0`. This happened on a cold first request (`a2a3` from the start position), and in 1 of 5 live smoke requests. A repeat of the same position returned `depth 7, nodes 7, time_ms 0`, which looks like a cache hit. The contract does not say these are invalid, so they are accepted, logged as a warning and counted (`unsearched`) in the engine metrics. The teammate should confirm whether depth 0 means "no search" (for example a fallback move).

## Local setup

In `backend/`:

```powershell
npm ci                  # adds axios 1.20
npm run db:migrate      # applies 202610260004_engine_enums and 202610260005_engine_games
npm run start:dev
```

Set `ENGINE_BASE_URL` in `backend/.env` (see [.env.example](../backend/.env.example)); leave it unset to disable engine games. The frontend needs no new settings.

## Configuration

All values are validated at startup ([environment.ts](../backend/src/config/environment.ts)).

| Variable | Default | Meaning |
| --- | --- | --- |
| `ENGINE_BASE_URL` | unset (disabled) | Engine service base URL. http(s) without credentials, query or fragment; HTTPS required in production. |
| `ENGINE_SEARCH_MOVETIME_MS` | 200 | Search allowance per engine move (10–30 000). Shortened when the engine's clock requires it. |
| `ENGINE_TRANSPORT_RESERVE_MS` | 1500 | Engine clock kept back for HTTP travel and the service's own queueing. About twice the measured p95 round trip (below). |
| `ENGINE_COMMIT_RESERVE_MS` | 150 | Engine clock kept back for validating, committing and publishing the move. |
| `ENGINE_REQUEST_TIMEOUT_MS` | 10 000 | Upper bound for one analyze request, whatever the clock allows. Must cover the allowance plus the transport reserve. |
| `ENGINE_HEALTH_TIMEOUT_MS` | 3000 | Health check limit. |
| `ENGINE_MAX_CONCURRENT_SEARCHES` | 1 | Searches in flight across all games. Kept conservative until the service's capacity is known. |
| `ENGINE_MAX_QUEUED_SEARCHES` | 16 | Searches waiting for a slot; more are refused (`capacity_exhausted`). |
| `ENGINE_MAX_ACTIVE_GAMES` | 4 | Admission: active engine games on the server. Also, one active engine game per account. |
| `ENGINE_MAX_ATTEMPTS` | 3 | Attempts per engine move, counting the first. Only selected transient failures are retried. |
| `ENGINE_RETRY_BASE_MS` | 300 | Exponential backoff base with jitter, bounded by the remaining clock. |
| `ENGINE_ABORT_QUARANTINE_MS` | 2000 | After a request that may still be running upstream, its slot stays reserved for the requested movetime plus this. |
| `ENGINE_RECOVERY_INTERVAL_SECONDS` | 5 | Periodic repair of engine turns that were never scheduled. 0 disables it; commits and startup still schedule. |

## Database changes

Two migrations, split because new enum values must be committed before constraints can use them.

| Migration | Change |
| --- | --- |
| `202610260004_engine_enums` | `GameResult.ABORTED`, `GameTermination.ENGINE_FAILURE`, enums `GameMode` (`FRIENDS`, `ENGINE`) and `ParticipantKind` (`PLAYER`, `ENGINE`) |
| `202610260005_engine_games` | `Game.mode`; `GameParticipant.kind`, `engineName`, nullable `userId`; nullable `GameMove.actorId`; index `(mode, status)`; constraints below |

- **No fake user.** A seat is either an account (`kind PLAYER`, `userId` set) or the engine (`kind ENGINE`, `engineName` set to the name the service reported at creation, `userId` null). A CHECK enforces exactly one.
- **Moves belong to a seat.** `GameMove (gameId, color)` references `GameParticipant`. Engine moves have a null `actorId`; their `requestId` is derived from (game, revision), see below.
- **Aborted games.** `ENGINE_FAILURE` ↔ `ABORTED`, and only in engine games. The result/termination CHECK was rewritten to cover it; decisive and draw terminations are unchanged.
- **Engine games have no room** (`mode = ENGINE` ⇒ `roomId IS NULL`).

Prisma's migration diff against the schema is empty on a freshly migrated database.

## Contracts

[OpenAPI](../backend/openapi.json) is now v1.4.0.

| Method and path | Result |
| --- | --- |
| `GET /api/engine-games/status` | `{ available, configured, engine }` from the service health, cached 5 s. Reserves nothing. |
| `POST /api/engine-games` | Body: the room setup contract, `{ timeControl: <supported preset>, colorPreference: "white" \| "black" \| "random" }`. → 201 `{ game }` (complete snapshot). |

Errors from `POST /api/engine-games`:

| Status | Code | When |
| --- | --- | --- |
| 400 | `invalid_request` | Unsupported preset or colour |
| 409 | `engine_game_active` | The account already has an active engine game. The body adds `gameId`. |
| 503 | `engine_unavailable` (retryable) | Health failed, timed out or reported `ready: false` |
| 503 | `engine_capacity_reached` (retryable) | Admission limit reached |
| 503 | `engine_not_configured` | `ENGINE_BASE_URL` is unset |

Changes to existing contracts:

- **Game snapshots** gain `mode` (`friends` \| `engine`) and `engineTurn` (below). Players gain `kind: "engine"`; the engine seat's `id` is the literal `"engine"`, never an account id.
- **Results.** `status.result.outcome` can be `aborted` with reason `engine-failure`. The PGN result token is `*` with the Termination tag "abandoned; engine service failure".
- **Draw offers** are refused in engine games (409 `draw_offers_unavailable`), and `canOfferDraw`/`canRespondToDraw` are always false. The engine service has no way to answer an offer.
- **History** items have `mode: "engine"` and `result: "aborted"` where applicable; the opponent is `{ id: "engine", username: <engine name>, kind: "engine" }`.

**Realtime.** Everything else is unchanged: moves and resignation use `game.move` and `game.resign`, and the `game:<id>` channel delivers `game.snapshot` and `game.updated`. One new event:

| Event | Payload |
| --- | --- |
| `game.engine` | `{ id, revision, engineTurn }`, where `engineTurn` is `{ revision, color, phase: "queued" \| "thinking" \| "retrying", attempt, since }` or null. It is progress, not game state: it never changes the revision and describes the game only while `revision` matches. Publications for a game are serialized, so phases arrive in order. |

Snapshots include the current `engineTurn`, so reloads and rejoins show it without waiting for the next event.

## Server design

```
backend/src/modules/engines/                 (no game knowledge)
  engine.types.ts            application-facing interface, DTOs, limit ranges, UCI format
  engine-errors.ts           normalized failures: retryable / may-still-run
  http/engine-http.contract.ts  zod schemas for the upstream contract
  http/http-engine.adapter.ts   Axios adapter: keep-alive, deadlines, status → error mapping
  search-gate.ts             bounded concurrency + bounded FIFO queue + quarantine
  engines.service.ts         retry policy within a caller-supplied budget, health/readiness
  engine-metrics.ts          round trip vs engine time vs queueing
backend/src/modules/games/
  clocks/engine-budget.ts    clock-aware search budget (pure)
  services/engine-turns.service.ts  server-owned engine turns (orchestration)
  services/game-commands.service.ts shared move computation; applyEngineMove, abortForEngineFailure
  engine-games.controller.ts status + creation
```

Games depends on Engines; Engines knows nothing about games, clocks or persistence. `EngineTurnService` depends on `GameCommandsService` through a post-commit hook (`onCommitted`), so there is no dependency cycle. Player moves and engine moves share one move computation (`moveChange`): chess.js validation, the clock charge and increment, repetition and every game-ending rule.

### Creation

1. **Readiness.** A fresh `GET /health` (not the cached status) must succeed with `ready: true`.
2. **Admission, in one transaction.** A transaction-scoped advisory lock serializes engine-game creation. It refuses a second active engine game for the account and enforces `ENGINE_MAX_ACTIVE_GAMES`. It then creates the game (`mode ENGINE`, standard position, room preset) with one player seat and one engine seat, and starts White's clock.
3. **After commit:** the game is warmed, its clock timer armed and its engine turn considered. If the engine plays White, its opening search starts now.

Health is not a reservation: a later search can still find the service busy, which the retry policy handles.

### An engine turn

After every committed change (player move, resignation, timeout, abort, startup resumption), `EngineTurnService.consider(state)` runs:

1. Commit and publish the player's move normally (unchanged pipeline).
2. If the game ended, nothing more happens.
3. If the engine owns the next move, it captures the game id, revision, engine colour, authoritative FEN and the engine clock's deadline.
4. It publishes `game.engine` (`queued`, then `thinking`).
5. It requests a move outside every database transaction and outside the game's command lane. Resignation, timeouts and other games are never blocked.
6. On the reply it records the receipt time, then re-enters the game's serial lane (`applyEngineMove`).
7. In the lane it re-checks committed state: still active, same revision, engine to move, and the official clock at receipt. If the clock ran out first, normal timeout adjudication is committed instead.
8. chess.js validates `bestmove` in the authoritative position. A promotion needs its suffix; a reply without one is rejected.
9. The move is committed through the same revision-guarded single statement as player moves: game row, move row, clocks and result.
10. It is broadcast only after a successful commit.

**Identity and duplicates.** At most one search runs per game. A turn is identified by (game id, revision); its move's `requestId` is a UUID (version 8) derived from that pair. Scheduling the same turn again (commit hook, startup, repair pass, repeated calls) is ignored while it runs. The revision guard and the `(gameId, ply)` primary key make an engine move apply at most once.

**Stale replies.** A reply for an older revision is discarded even if it happens to be legal in the newer position. That covers resignation, timeout, abort, a restart's resumption, or any other revision change. If a newer engine turn becomes due while an older search is in flight, it starts once the older one settles: still one search per game.

**Null `bestmove`.** Our own rules decide whether the position is terminal. In practice it never is, because checkmate and stalemate end the game at the move that produced them. A null move in a position with legal moves is an engine error.

**Lost write replies.** If saving the engine move fails, it is retried after 100, 500 and 1500 ms. If a write committed but its reply was lost, the retry finds the turn stale. The committed state is then broadcast again, so players see the move rather than a stuck "thinking" state. If every save attempt fails, the turn is forgotten and the repair pass schedules it again under the same identity.

### Clocks and the search budget

The engine's queueing, HTTP travel and thinking are all charged to its own running clock, from the receipt of the player's move to the receipt of the engine's reply. For each attempt, including after queueing:

```
available = remaining − transportReserve − commitReserve
movetime  = min(allowance, available, 30 000)       → no request if movetime < 10
timeout   = min(requestTimeout, remaining − commitReserve)
```

A budget below the service's 10 ms minimum is never rounded up past the clock. There is then no request, and the clock decides through normal timeout adjudication. Example with the defaults: 1.75 s left gives a 100 ms search and a 1.6 s deadline; 1.65 s left gives no search. Waiting in the queue, retries and backoff all come out of the same remaining time.

### Capacity

- **Admission:** active engine games are limited server-wide and per account.
- **Search gate:** `ENGINE_MAX_CONCURRENT_SEARCHES` slots and a bounded FIFO queue shared by all engine games. A waiter gives up at its clock deadline.
- **Quarantine:** an aborted HTTP request does not prove the remote search stopped. After our own deadline, a connection lost after sending, or shutdown, the slot stays reserved for the requested movetime plus `ENGINE_ABORT_QUARANTINE_MS` before another search may use it.

### Failure policy

No infrastructure-failure policy existed, so this milestone defines one. **After bounded recovery attempts, an engine-service failure aborts the game: result `ABORTED`, termination `ENGINE_FAILURE`, no winner, no draw, clocks frozen at the abort.** Moves are never substituted, clocks never paused or reset, and no win is awarded because the service failed. If the engine's clock has actually run out, normal timeout adjudication applies instead.

| Failure | Normalized as | Retried? | Outcome if it persists |
| --- | --- | --- | --- |
| 409 | `busy` | Yes, within the clock | Aborted |
| 503, 502 (gateway while the service is down) | `unavailable` | Yes | Aborted |
| Connection refused / DNS (nothing reached the service) | `unavailable` | Yes | Aborted |
| Connection broken after sending | `connection_lost` | Yes, after the quarantine | Aborted |
| 504 | `upstream_timeout` | No | Aborted |
| 200 with `timed_out: true` | `search_timed_out`. Partial-result semantics are unconfirmed, so its `bestmove` is not used. | No | Aborted |
| No response by our deadline | `deadline_exceeded` (slot quarantined) | No | Aborted; if the deadline came from the engine's clock, the clock decides (timeout) |
| 400 | `invalid_position` (our FEN rejected) | No | Aborted |
| 422 | `invalid_request` | No | Aborted |
| Malformed body, undocumented status, bad move format | `contract_violation` | No | Aborted |
| Illegal move or missing promotion suffix | — | No | Aborted |
| Null move in a non-terminal position | — | No | Aborted |
| Not enough clock for a 10 ms search | `no_time` (no request sent) | — | The clock decides (timeout) |
| Shutdown during a search | `cancelled` | — | Nothing changes; the next startup reschedules |

Upstream failures are never reported as a player's illegal move. Failures affect only their own game: other engine games keep their own turns, and PvP games never touch the engine.

### Recovery

- **Restart.** The existing policy resumes every active game's turn at startup (revision bumped, downtime not charged). Engine turns are then scheduled from the resumed state. A reply to a search started by the previous process can no longer apply: the revision moved on.
- **Repair pass.** Every `ENGINE_RECOVERY_INTERVAL_SECONDS`, active engine games are loaded and any due turn without a search is scheduled. This covers failed writes and anything else that missed the commit hook.
- **Browsers never start searches.** Refreshes, extra tabs, reconnects, snapshots and channel joins only read state.

### History, replay and draw rules

Full move history stays in NestJS. The service accepts a FEN, not the move list, so repetition, the fifty-move rule and insufficient material are adjudicated by our existing rules over the complete history. Engine games appear in history and replay like PvP games. Manual analysis of a finished engine game works as before and never calls the engine.

## Frontend integration

| Layer | Code |
| --- | --- |
| Transport | `features/games/services/engine-games.service.ts`: `getEngineStatus`, `createEngineGame` (Axios). `ApiError` now keeps extra error-body fields as `details` (for example `gameId`) and honours the server's `retryable` flag. |
| Cache | `hooks/use-engine-games.ts`: the status query (re-checked on every setup visit, refreshed every 30 s) and the creation mutation, which seeds the game's canonical cache entry. `game.engine` events reconcile into that same entry (`applyEngineProgress`), like presence: no extra GET per move. |
| Presentation | Launcher row "Vs Engine" → `/rooms/new?opponent=engine`: the existing setup form (presets, "You play") with an Opponent panel showing the reported engine name and readiness. Arena: "Engine Match" header, engine seat with name and "Engine service", turn readout and board status from `engineTurn` (queued / thinking / unreachable-retrying), draw button disabled, footer `ENGINE // <name>`. Result dialog and badges for **Aborted** ("No result is recorded"). History rows show Engine/Friends. |

Rules remain on the backend. react-chessboard's default pieces, responsive board sizing and input restrictions are unchanged. MSW demo mode reports engine play as not configured instead of simulating an engine.

**Bug found and fixed during browser checks.** TanStack Query applies a query's `structuralSharing` function to `setQueryData` as well as to fetches. The equal-revision rule kept the cached object, so only the first engine phase ever displayed. Progress now merges by (revision, server time) whichever path delivers it, and a unit test reproduces the old behaviour. Separately, server-side progress publications for a game are now chained: concurrent socket lookups had been able to emit `queued` after `thinking`.

## Measured latency

Environment: the same 2016 laptop as earlier milestones (Windows 10, Node 24.12), PostgreSQL 18 on loopback, reaching the Railway-hosted service over this machine's ordinary internet connection. These numbers come from a small smoke test, not a load test.

| Measured from | What | Result |
| --- | --- | --- |
| Our backend (keep-alive), 5 analyze requests with 200 ms movetime | **HTTP round trip** | p50 **611 ms**, p95 755 ms |
| Same requests | **Engine-reported `time_ms`** | p50 **54 ms**, p95 131 ms; 1 reply unsearched (depth 0) |
| Our backend, 9 accepted moves (player and engine) | **Server processing**, receipt → emitted | p50 15.9 ms, p95 20.2 ms (validate 4.2, commit 8.8 p50). Only 9 samples, cold process. |
| Socket client | Player move acknowledged → engine move received | 544–767 ms |
| Socket client | Engine game created → opening move recorded (includes the health check) | 1066 ms |
| Browser (production build, live engine) | Tap → engine reply visible on the board | 966 ms and 939 ms (round trips 567 and 687 ms, engine 66 and 148 ms) |
| `curl` without keep-alive | Full request including TLS setup | 0.67–1.2 s (TLS ≈ 0.3 s) |

So in this environment about 0.5 s of each engine move is network and service overhead, separate from the search itself. The earlier ~8 s observations did not reproduce here; they are environment-specific and should be measured from the production host. The server-processing target (p95 < 20 ms) excludes engine time, as the plan requires. This small sample sits at the boundary and is not a sizing result; see the [gameplay milestone](Gameplay_Milestone.md#performance) for the load benchmark.

Reproduce with:

```powershell
$env:ENGINE_LIVE_URL='https://chess-engine-production-b495.up.railway.app'
$env:TEST_DATABASE_URL='<dedicated test database>'
npm run build; npx vitest run --config ./vitest.config.e2e.ts test/engine-live.e2e-spec.ts
```

## Verification

Run against an isolated PostgreSQL 18 cluster on loopback (port 55440) with fresh databases. Every migration applied from scratch, and the Prisma diff is empty. The development database was not used.

- **Backend:** typecheck, lint and production build clean. **142 unit tests** (70 before), **60 integration tests** (40 before), with the load benchmark and the live smoke skipped by default.
  - Adapter tests run against a real local HTTP server: one documented limit per request; reply mapping; promotion suffixes and null moves; nine malformed reply shapes; non-JSON bodies; `timed_out`; every documented status, including nested error bodies and gateway HTML; our deadline versus caller cancellation; connection lost after sending versus refused; health contract; limit ranges.
  - Gate, retry and budget: concurrency and FIFO order, the queue limit and its deadline, quarantine, which kinds are and are not retried, budget-bounded retries, metrics.
  - Engine turns, using the real pipeline over the in-memory repository:
    - opening move as White and reply after a player move, with only `bestmove` applied;
    - promotion with and without the suffix, null move, malformed and illegal replies;
    - retry then success, retry exhaustion, timeouts not retried;
    - shortened budget and unaffordable search;
    - resignation and flag during a pending search, a stale-revision reply;
    - duplicate scheduling, concurrent games with out-of-order replies;
    - save failure and lost write reply, restart recovery, ordered progress publication.
  - Mutation checks: removing the revision check, the duplicate guard, the retry classification, the null-move check or the publish chain each made the relevant tests fail.
- **Integration** ([engine-games.e2e-spec.ts](../backend/test/engine-games.e2e-spec.ts); real HTTP, Socket.IO and PostgreSQL, with an HTTP double of the FastAPI service and a controllable server clock), 20 tests:
  - status authorization;
  - both colours, with seats persisted, no fake user, and readiness checked before the clock;
  - a complete timed game to checkmate, with exact official clocks per move, PGN, history, replay, and manual analysis making no engine request;
  - engine promotion `bxa8=Q`; draw offers refused;
  - eight failure kinds aborting without a winner, plus busy and dropped-connection retries;
  - resignation answered within 1 s during a pending search, then the reply discarded;
  - flag during a pending search;
  - two concurrent games with out-of-order replies;
  - refreshes, a second tab and a reconnect starting no searches, while both tabs receive the move once;
  - restart recovery applying exactly once with downtime not charged;
  - readiness failure, `ready: false`, the per-account limit and a concurrent server-wide admission race.

  All existing auth, rooms and PvP game suites still pass.
- **Live smoke** ([engine-live.e2e-spec.ts](../backend/test/engine-live.e2e-spec.ts), opt-in): 3/3 passed against the deployed service through the real backend and clock. Two games and five analyze requests.
- **Frontend:** typecheck, lint (feature boundaries included) and production build clean. **66 unit tests** (57 before): engine-progress reconciliation including the structural-sharing case, aborted wording, engine board status, `ApiError` details.
- **Browser** (Playwright 1.62, headless Chromium; real API on :3002, production build on :3003, engine double with a control endpoint), **19/19 checks**:
  - launcher entry; setup shows the engine name and readiness, with no strength labels;
  - arena shows the engine seat, header and footer; draw offer disabled; no search before the player's first move;
  - queued and thinking states during a slow search, then the engine reply;
  - a reload and a second tab start no searches, and both tabs receive the move once;
  - resignation;
  - engine as White opens, with the board oriented for Black;
  - an unrecoverable 503 shows "unreachable/retrying", then the Aborted dialog;
  - history shows Engine and aborted/loss rows; replay with the engine in the PGN;
  - unavailable engine blocks setup;
  - setup and arena at 390 px without horizontal overflow; no page errors.

  A separate **live browser smoke** against the deployed engine played two moves and resigned (timings above). Scripts and screenshots are outside the repository in the session scratchpad.

Not run: other browsers, real mobile devices, multiple API instances, sustained load against the service (deliberately; no budget was defined), and the teammate's own pytest suite. Its source was not treated as evidence that it passes.

## Remaining limitations and upstream questions

- **Capacity of the service is unknown.** It is unknown whether it serves concurrent searches or answers 409 when busy. Defaults are one search in flight and four active games server-wide. Raise them only after measuring on the production host.
- **Cancellation.** The service has no cancel endpoint. An aborted HTTP request may leave a search running, which is why slots are quarantined.
- **`timed_out: true`.** Whether its `bestmove` is a usable partial result is unconfirmed, so it is treated as a failure.
- **Unsearched replies** (depth 0, 0 nodes) are accepted but need explaining (see above).
- **Combined limits.** Whether `movetime` with `depth` or `nodes` behaves as "whichever comes first" is unconfirmed, so only one limit is ever sent.
- **History.** The service accepts only FEN. The engine cannot see repetition history and may walk into a repetition draw that our rules adjudicate.
- **Default depth.** The documented default (depth 6) is never relied on.
- **Draw offers** are unavailable against the engine until the service can evaluate or answer them.
- **First-move timing** is as in PvP: White's clock starts at creation, so with the engine as White its first search is charged from creation.
- **Bullet.** With about 0.6–0.8 s of transport per move, the engine spends most of a 1+0 clock on overhead and can lose on time. That is normal adjudication, not a service failure.
- **Single instance.** Engine turns, the gate and timers are in-process, like the rest of game ownership. Multiple API instances need game ownership routing first.
- **Committed `.env.example`** contains a concrete database password and JWT secret from before this milestone. They should be treated as compromised placeholders and never used outside local development.
