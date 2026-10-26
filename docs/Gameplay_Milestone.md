# Authoritative player-vs-player gameplay milestone

Updated: 26 October 2026. Follows the [rooms, invitations and notifications milestone](Rooms_Invitations_Notifications_Milestone.md). This is phase 4 ("PvP core") of the [project plan](Vortix_Chess_Project_Plan.md#19-implementation-sequence-and-completion-gates).

A ready room now starts exactly one game. The server owns the game: legal moves, turn, clocks, draw offers, results and the durable move record. Moves travel over the existing authenticated Socket.IO connection, are validated with chess.js, are committed to PostgreSQL in one statement and are only then broadcast. The existing game screen is connected to it: board, promotion dialog, players, clocks, move list, draw and resign controls, connection state and the result dialog.

Out of scope, as agreed: UCI engine play, evaluation and analysis, and the full history/replay browsing milestone. Their data is persisted now (initial position, UCI move list, SAN, positions, clocks, PGN). A minimal live review cursor is included because move input must be disabled while reviewing.

## Local setup

In `backend/`:

```powershell
npm ci                  # adds chess.js 1.4.0
npm run db:migrate      # applies 202610260001_room_started_status and 202610260002_games
npm run start:dev
```

No new environment variables. The frontend needs no new settings.

## Database changes

Two migrations. The enum value is added on its own so later migrations can reference it after it is committed.

| Migration | Change |
| --- | --- |
| `202610260001_room_started_status` | `RoomStatus` gains `STARTED` |
| `202610260002_games` | Tables `Game`, `GameParticipant`, `GameMove`, `GameCommand`; enums `GameStatus`, `GameColor`, `GameResult`, `GameTermination`, `GameCommandKind` |

| Table | Contents | Constraints |
| --- | --- | --- |
| `Game` | Room reference, status, `revision`, `ply`, initial and current FEN, immutable time control, both remaining times as of `turnStartedAt`, pending/declined draw offer, result, termination, PGN, start/end timestamps | **`roomId` unique: one game per started room.** Revision ≥ 1, ply ≥ 0, clocks ≥ 0, time control in the room's range. An active game has a running clock (`turnStartedAt` set) and a finished one does not. Result, termination and `endedAt` are recorded together, exactly when finished; decisive terminations have a winner and draw terminations do not. No draw offers on finished games. |
| `GameParticipant` | Colour and account per game | Primary key (game, colour); unique (game, user); index (user, created) for history |
| `GameMove` | Ply, colour, actor, request id, UCI, SAN, captured piece, resulting FEN, server receipt time, time used, both clocks after the move | **Primary key (game, ply): a ply can be recorded once.** UCI format, non-negative clocks |
| `GameCommand` | Ledger of applied commands: actor, request id, kind, canonical content ("fingerprint"), resulting revision | **Primary key (game, actor, request id): command deduplication**, persisted across reconnects and restarts |

Participants, moves and commands reference users with `ON DELETE RESTRICT`: an account that has played cannot be deleted silently. Deleting accounts needs an explicit anonymization policy, which is future work. Prisma's diff of the migrated database against the schema is empty.

## Starting a game

`POST /api/rooms/:roomId/start` with `{ expectedRevision }`. Host only.

In one transaction, under the room row lock that already serializes every room change, the server checks that the room is open, the revision is the one the host confirmed, both seats are filled and both players are ready. It then:

1. Creates the game with colours from the host's preference (`random` uses `crypto.randomInt`), copies the time control, sets the standard start position and starts White's clock.
2. Closes the room's pending invitations.
3. Marks the room `STARTED` and bumps its revision.

After the commit, both seat holders receive `room.updated` with `status: "started"` and `gameId`, and the waiting room navigates to `/games/:gameId`. Reloading the room (or opening an accepted invitation) returns the same `gameId` and redirects again.

A repeated or concurrent start returns the already started room with the same `gameId`. The room lock decides the race; `Game.roomId` is unique as a second guard. Started rooms never expire. Settings, readiness, cancel and leave requests on them return 409 `room_started`; invitation actions report `room_full`.

## Server design

```
backend/src/modules/games/
  rules/chess-rules.ts       chess.js validation + our adjudication policy (pure)
  rules/pgn.ts               final PGN from the durable SAN record
  clocks/game-clock.ts       official clock arithmetic (pure)
  clocks/server-clock.ts     the single, non-decreasing source of server time
  services/game-state.ts     immutable committed state, reconstruction from history
  services/game-store.ts     warm state per game, per-game serial lanes, single-flight loads
  services/game-repository.ts persistence: revision-guarded single-statement commits
  services/game-commands.service.ts  the authoritative pipeline
  services/game-metrics.ts   move timeline measurements
  games.service.ts           creation from rooms, snapshots, channel authorization, presence, restart
  games.gateway.ts           Socket.IO commands
  games.controller.ts        GET snapshot + HTTP fallback for the same commands
```

The gateway and the controller only validate transport input and call `GameCommandsService`. There is one rules implementation.

### Warm state and reconstruction

Each active game is kept in memory as an immutable `GameState` plus its move list, repetition table and command ledger. A game that is not warm is rebuilt by replaying its complete accepted move history from the initial position inside a repeatable-read snapshot, checking every stored resulting position; any mismatch refuses to load the game (`GameIntegrityError`). The latest FEN alone is never used to rebuild, because repetition depends on history. Finished games stay warm for five minutes after their last read.

### Move pipeline

A move command carries `gameId`, `requestId`, `expectedRevision`, `from`, `to` and optional `promotion`. The actor is the socket's (or bearer token's) authenticated account; a payload naming anyone else is rejected as malformed.

Every command that can change a game (move, resign, draw offer and answer, timeout check) runs in that game's serial lane, in arrival order:

1. **Receipt.** The server records wall-clock receipt time before validation.
2. **Authorization and deduplication.** Non-participants get `game_not_found`. A request id already in the ledger with the same content is answered with the current state and `duplicate: true`; with different content it is refused (`request_id_reused`).
3. **State checks.** Finished game, expected revision, assigned side and turn.
4. **Official clock.** If the side to move had no time left at receipt, the timeout is finalized first and the command is refused.
5. **Rules.** chess.js validates the move; the candidate position, SAN, UCI, legal destinations for the next player, clocks and any result are computed. Nothing in memory changes yet.
6. **Commit.** One SQL statement with data-modifying CTEs updates the game `WHERE revision = expected AND status = 'ACTIVE'`, inserts the move and inserts the ledger entry. All three happen or none do; the primary keys reject a duplicate ply or request id.
7. **Publish.** Only after the commit: the warm state is replaced, the clock timer is rearmed, both players receive `game.updated`, and the sender receives the acknowledgement.

A failed write leaves the published state untouched, produces no broadcast and returns a retryable `command_not_saved`. Because a write can also commit and then lose its reply, any write error drops the warm copy; the next command reloads committed truth, and a retry with the same request id is then answered from the persisted ledger instead of being applied again. A revision mismatch at commit (another writer) is handled the same way (`game_state_conflict`).

Draw offers, answers, resignations and timeouts use the same lane and the same revision-guarded statement, so a move, a resignation, an acceptance and a timeout can never both decide the same state: whichever is first in the lane wins, and the rest see a finished game. A game is finalized once.

## Adjudication policy (casual games)

There is no arbiter and no claim button, so draws that FIDE makes claimable are applied automatically, as most online platforms do. chess.js's `isDraw()` and `isThreefoldRepetition()` are not used.

| Rule | Policy |
| --- | --- |
| Checkmate, stalemate | Immediate, from chess.js move generation. Checkmate takes precedence over every draw rule on the same move. |
| Threefold repetition | **Automatic** on the third occurrence. A position is identified by placement, side to move, castling rights and an en passant square **only when the capture is legal** (FIDE 9.2.3). chess.js prints the en passant square in FEN only in that case, so the first four FEN fields are the key. chess.js's own repetition hash keeps an en passant square that a pin makes illegal, which is why it is not used. The count runs from the initial position over the complete history. |
| Fifty-move rule | **Automatic** when the half-move clock reaches 100 (fifty moves by each side without a capture or pawn move), unless that move is checkmate. The 75-move and fivefold rules are therefore never reached. |
| Insufficient material | **Automatic** for K v K, K + one knight or bishop v K, and positions where all remaining non-king pieces are bishops on one square colour. Other dead positions, such as locked pawn chains, are not detected; players can agree a draw. |
| Timeout | The side to move loses when nothing remains at the instant the server observes it. If the opponent could never checkmate by any legal sequence (FIDE 6.9), it is a draw (`timeout-vs-insufficient-material`). Beyond dead positions, only a lone king can never mate; a lone knight or bishop can mate with the opponent's cooperation, so a timeout against it still loses. |
| Resignation | Any time during an active game, by either player. |
| Draw offers | Either player may offer at any time; one pending offer at a time; repeating your own open offer changes nothing. The opponent may accept (draw by agreement) or decline. Making a move while the opponent's offer is pending declines it (FIDE 9.1.2). Your own offer survives your move. After a decline the same player may offer again only after making a move. |

Engines, ratings and arbiters are outside this policy.

## Server-authoritative clocks

- The supported presets are the room's (1+0 to 30+20); the game copies them at start.
- Only the side to move is charged, from the server time its turn started (`turnStartedAt`) to the server time a command is received. Increment is added exactly once, when a move is accepted. The opponent's clock starts at the same receipt instant.
- Browser timestamps never enter the calculation. The command contains none.
- Move against timeout is decided by server receipt time. A move received 1 ms before the deadline is accepted even if the lane processes it later; a move received at the deadline loses on time.
- A timer is armed at each commit for the running side's deadline. When it fires it enters the lane like a command and decides from the current server time, so a late timer still ends the game and an early one only reschedules. Every command also re-checks the deadline itself.
- Persisted: both remaining times as of `turnStartedAt`, updated with each committed change; and both clocks after every move on the move record. Display ticks are never written.
- Disconnects do not pause clocks. A disconnected player's clock keeps running; while it is their turn, the opponent's view of them reads "Disconnected · clock running".
- Server time is wall-clock milliseconds (so it can be compared across restarts) but never decreases within a process.
- White's clock starts when the game is created. There is no first-move grace period, so on a 1+0 game the seconds spent opening the board count. A Lichess-style grace period with an abort rule is a possible follow-up.

### Restart and downtime policy

When the API starts, every active game's current turn restarts at that moment with the time the side to move had when its turn began (`turnStartedAt` is reset and the revision bumped). Nobody is charged for downtime, and nobody can lose on time because the server was down. The side to move is refunded whatever it had already used on that turn before the outage; the opponent's clock is unaffected. Clients reconnect, rejoin and resynchronize to the bumped revision. This assumes a single API instance, as the rest of the deployment does.

## HTTP contract

[OpenAPI](../backend/openapi.json) is now v1.2.0. All endpoints need `Authorization: Bearer <access token>`.

| Method and path | Who | Result |
| --- | --- | --- |
| `POST /api/rooms/:roomId/start` | Host | `{ room }` with `status: "started"` and `gameId`. 409 `room_not_ready`, `room_revision_conflict`; 403 `not_room_host` |
| `GET /api/games/:gameId` | The two players | `{ game }`: complete snapshot. Anyone else gets 404 `game_not_found` |
| `POST /api/games/:gameId/moves` | Player | HTTP fallback: `{ requestId, expectedRevision, from, to, promotion? }` → `{ game, duplicate }` |
| `POST /api/games/:gameId/resign` | Player | `{ requestId }` |
| `POST /api/games/:gameId/draw-offer` | Player | `{ requestId }` |
| `POST /api/games/:gameId/draw-offer/response` | Player | `{ requestId, response: "accept" \| "decline" }` |

Room views gain `gameId` and `viewer.canStart`, and `status` can be `started`.

Command errors keep `{ code, message }` and add `retryable` and, when known, the authoritative `game` state: 404 `game_not_found`; 409 `game_finished`, `stale_revision`, `not_your_turn`, `request_id_reused`, `draw_offer_pending`, `draw_offer_cooldown`, `no_draw_offer`; 422 `illegal_move`, `promotion_required`, `promotion_not_allowed`; 503 (retryable) `command_not_saved`, `game_state_conflict`, `game_unavailable`.

The realtime path is primary; on HTTP the receipt time is taken after authentication.

## Realtime contract

Same Socket.IO server, path and authentication as the rooms milestone.

**Channel `game:<gameId>`.** `channel.join` is authorized for the two players only, from the socket's account. Every join, including each automatic rejoin after a reconnect, is answered with a complete snapshot. That snapshot is the synchronization boundary.

| Event | Payload |
| --- | --- |
| `game.snapshot` | `{ game }`: complete state with the full move history, players and presence. On join and rejoin only. |
| `game.updated` | Compact committed state: `id`, `revision`, `ply`, `fen`, `status`, `clocks` (`remainingMs`, `runningSide`, `serverTime`), `lastMove`, `checkSquare`, `drawOffer`, the receiving viewer's permissions, legal destinations (only for the player to move), `endedAt`, and `move` (the newly accepted move, or null for non-move changes). **Never the accumulated history.** Each player receives their own view. |
| `game.presence` | `{ id, userId, online }`. Not game state; never changes the revision. |

**Commands**, each acknowledged with `{ ok: true, duplicate, game }` or `{ ok: false, error: { code, message, retryable }, game }`, where `game` is a compact `game.updated` payload:

| Event | Payload |
| --- | --- |
| `game.move` | `{ gameId, requestId, expectedRevision, from, to, promotion? }` |
| `game.resign` | `{ gameId, requestId }` |
| `game.draw.offer` | `{ gameId, requestId }` |
| `game.draw.respond` | `{ gameId, requestId, response }` |

Revision and ply are separate: the revision increases on every persisted change (moves, offers, declines, results, restart resumption); ply counts accepted half-moves.

Socket.IO is not treated as exactly-once delivery:

- **Duplicate or stale events** (revision ≤ cached) are ignored.
- **Missing events.** Only the next revision is applied, and a move update must carry the next ply. Anything further ahead is a gap: move input is disabled and a fresh snapshot is fetched until the cache reaches the highest observed revision.
- **HTTP snapshots arriving after newer realtime updates** cannot roll the board back: every fetch passes the same higher-revision-wins rule.
- **Old events from a previously viewed game** are ignored by id, and the session provider is keyed by game.
- **Lost acknowledgements.** A command without an answer is *uncertain*. Input stays disabled, and once the connection is live and synchronized the identical command (same request id) is sent again. The server either applies it once, answers it from the ledger, or refuses it as stale. A command is never sent while disconnected: the adapter refuses instead of letting Socket.IO buffer it for later.
- **Token renewal and rejoining** use the existing adapter: a rejected handshake refreshes the session once and reconnects; every reconnect rejoins channels and resynchronizes.

## Frontend integration

| Layer | Code |
| --- | --- |
| Transport | `features/games/services/game.service.ts`: `getGame` (Axios) and `sendGameCommand` (realtime request). `lib/realtime` gains `request()` with acknowledgement timeouts and `RealtimeRequestError` (`not-connected` = never sent; `timeout` = uncertain). |
| Cache and coordination | `providers/game-session-provider.tsx` owns the game's single TanStack Query entry. Snapshots reconcile by revision; `game.updated` and acknowledgements go through `applyGameUpdate` (append the new move, or report a gap). `hooks/use-game-commands.ts` runs one command at a time and resolves uncertain ones. No second store holds live state. |
| Presentation | Board (behind `chessboard-adapter.tsx`, the only `react-chessboard` import), promotion dialog, player cards with captures and presence, clocks, move list with review, draw and resign dialogs, result dialog, connection status. |

Local feedback stays immediate but distinct from accepted state. A dropped or tapped move is shown provisionally (amber outline, "TRANSMITTING", or "CONFIRMING WITH SERVER" while uncertain) until the server's state replaces it; a refused move snaps back. Moves are disabled during the opponent's turn, while a command is pending or uncertain, while connecting, reconnecting or resynchronizing, while reviewing an earlier move, and after the game ends. Legal destinations, turn, check and results always come from the server.

Clocks interpolate locally from the authoritative readings, anchored at the browser time each state arrived, and are corrected by every update and resynchronization. A clock reaching zero in the browser shows 0:00 and nothing else; only the server ends the game.

Review: selecting a move in the list shows that move's stored position read-only with Start/Prev/Next and "Back to live (+N)". The live game, clocks and new moves continue; only the viewer's board changes. Full history and completed-game replay browsing remain the next milestone.

Demo mode (`NEXT_PUBLIC_API_MOCKING=enabled`) follows the same contracts: the scripted demo game answers commands through the mock realtime client's `request`. Its generated move list now includes each move's position and capture, derived offline with chess.js.

## Performance

The engineering target is **server receipt → emit p95 below 20 ms under representative load**. The server records, per accepted move: receipt → lane start (queue), → candidate ready (validation, including authorization, clock and rules), → statement returned (commit), → emitted to both players (emit).

**Environment.** One laptop: Intel Core i5-6300U (2 cores / 4 threads, 2016), 8 GB RAM, Windows 10. PostgreSQL 18.6 on the same host over loopback with durable commits (`fsync=on`, `synchronous_commit=on`). Node 24.12. Load clients are real Socket.IO clients in a separate Node process on the same machine, so server, database and clients compete for two cores. Each game is a 10+5 game created through the real start command; clients play random legal moves chosen from the server's own legal-destination lists, 40 plies per game.

Run it with `GAME_BENCH=1 TEST_DATABASE_URL=… npx vitest run --config ./vitest.config.e2e.ts test/games.bench.e2e-spec.ts` (`GAME_BENCH_GAMES`, `GAME_BENCH_PLIES`, `GAME_BENCH_THINK_MS`, `GAME_BENCH_OUT`).

Server pipeline, milliseconds:

| Load | Moves/s | Queue p95 | Validate p95 | Commit p50 / p95 | Emit p95 | **Total p50 / p95 / p99** | Max |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 100 games, 2–8 s think (≈ blitz pace) | 18 | 0.08 | 1.5 | 3.1 / 5.5 | 0.6 | **4.4 / 7.4 / 12.5** | 173 |
| 50 games, 0.5–1.5 s think | 42 | 0.11 | 1.7 | 3.2 / 8.0 | 0.8 | **4.7 / 10.0 / 16.9** | 281 |
| 100 games, 0.5–1.5 s think (stress) | 84 | 0.12 | 4.1 | 4.8 / 25.1 | 1.3 | **6.6 / 29.5 / 63.3** | 194 |

All runs: 0 rejected moves; 4,100, 2,050 and 4,100 accepted moves.

Client-observed, loopback only (no real network): acknowledgement round trip p50/p95 = 5.5/10.1 ms at 18 moves/s, 6.1/13.6 ms at 42 moves/s, 9.1/44.5 ms at 84 moves/s. Sender → opponent receipt is within 0.5 ms of the acknowledgement in each run.

**Interpretation.** The target is met at blitz pace (100 concurrent games) and at 42 moves/s, and missed at 84 moves/s on this hardware, where the database commit's tail grows as two cores are shared by PostgreSQL, the server and 200 client sockets. A single isolated commit costs p50 2.3 ms / p95 4.1 ms; with back-to-back commits from 10–25 games, PostgreSQL here sustains roughly 560–670 commits per second. The occasional 170–280 ms maxima occur in every run and look like host stalls (disk flush or OS scheduling); they were not investigated further.

Two measured optimizations shaped the pipeline. chess.js verbose move generation builds two FEN strings per candidate move and cost 2.4 ms per call on this CPU; legal destinations are now built from per-square SAN lists (0.2 ms), checked against chess.js over random games and special-move positions. Move evaluation fell from 8.3 ms to 0.5 ms. The first benchmark also ran the 200 clients inside the server process, which inflated server timings through event-loop contention (commit p95 289 ms); clients now run in their own process.

Not measured: real networks and regions, browser rendering time, multiple API instances, and production hardware. The plan's ~100 ms player-to-player budget is network-dominated and needs measurement from real client locations.

## Verification

Run against the isolated PostgreSQL 18 test cluster on loopback (port 55432). Your development database (`backend/.env`) was not touched.

**Totals:** backend typecheck, lint and build clean; **65 unit tests** (31 new); **38 integration tests** (16 auth, 13 rooms, 9 games) with the benchmark file skipped by default. Frontend typecheck, lint (including feature boundaries) and production build clean; **54 tests**. Baseline before the changes: 34 backend unit, 29 integration and 52 frontend tests, all passing.

- **Backend unit tests:** rules (castling both sides and through attack, en passant and its expiry, every promotion choice and the promotion errors, checkmate, stalemate, each insufficient-material case, threefold and fifty-move with mate precedence, the pinned en passant repetition key, timeout against a lone king, PGN), a randomized equivalence check of the legal-destination map against chess.js, clocks (charging, single increment, flag at the exact deadline), and the command pipeline over an in-memory repository with failure injection (failed save, write that commits and loses its reply, duplicates, request id reuse, competing moves, move versus timeout by receipt time, late and early timers, draw offer flow, single finalization, reconstruction and tamper detection).
- **Backend integration tests** (`test/games.e2e-spec.ts`, real HTTP, Socket.IO clients and PostgreSQL, with a controllable server clock): room start authorization and five concurrent starts producing one game; colours and settings; complete games with castling, en passant and underpromotion, and checkmate; compact broadcasts; unauthorized, illegal, out-of-turn, stale and malformed commands persisting nothing; retries applied once, reused ids refused, competing moves from two tabs; increments, move-versus-timeout ordering and a late timer; draw decline, cooldown, acceptance racing resignation, resignation; clocks running through a disconnect and resynchronization on rejoin; **a PostgreSQL trigger forcing the move insert to fail: no broadcast, no state change, and the retry applies it once**; and **a full restart**: a new application instance rebuilds the game from history, resumes the clock, recognizes a pre-restart request id, and draws by threefold repetition using occurrences from before the restart.
- **Mutation check:** with per-game serialization removed from the compiled code, the duplicate-retry and acceptance-versus-resignation tests failed. Serialization was restored by rebuilding.
- **Integration files run serially.** In parallel, every application instance booted by the auth and rooms suites runs the startup resumption and bumps the revision of the games suite's active games. The revision guard refused the resulting stale writes (`game_state_conflict`, nothing applied twice), but the suites need the database to themselves, as the rooms suite already did.
- **Browser (Playwright 1.62, headless Chromium 153)**: two accounts in separate browser contexts against the real API (on the test database, started and restarted by the script) and the running `next dev`. 39 checks per run:
  - Sign-up through the UI; room setup with an invitation (3+2, host White); accept; both ready; Start match enabled only for the host; both players land on the same `/games/:id`; one game row.
  - Turn indication; out-of-turn taps send nothing; the move-entry field exists only on the player's turn.
  - A dragged move and tapped moves; en passant; underpromotion through the promotion dialog; both castlings; each move appears on the opponent's board.
  - Reload mid-game restores the history and lets the player move.
  - Offline: the player sees "connection lost" with moves paused, a move made meanwhile does not reach them, and after reconnecting the missed move appears and moving resumes.
  - Review an earlier move (read-only), Back to Live, and the first tap afterwards is taken.
  - **API restart mid-game**: both players see the drop, the game resumes (revision bumped, ply unchanged), both resynchronize and play continues.
  - Draw offer, the opponent's dialog, decline, and the "declined" toast; official clocks persisted.
  - 390 px layout without horizontal overflow; resignation shows Defeat and Victory; the database holds the finalized result and PGN; reloading the room leads back to its game; no page errors.

  The browser runs found a real bug. Jumping into or out of review animates many pieces at once, and react-chessboard attributes a tap to whichever animating piece passes under the pointer, so a tap in the first ~180 ms after Back to Live could select the wrong piece and the move was lost (1 of 4 runs). The board now animates only single live moves. After the fix, four complete runs passed 39/39. Two further runs aborted before finishing because the API process the script spawns did not answer its health check within 30 s (once at the first start, once at the mid-game restart). I could not reproduce this with the API's output captured, or in six isolated stop/start cycles (ready in 2.6–3.2 s each), so its cause is unknown.

## Remaining work and limits

- **Single instance.** Warm state, timers, lanes and presence are in-process. Multiple API instances would need game ownership (routing each game to one instance) in addition to the existing revision guards, which already prevent double application. Redis or distributed ownership was not added, as agreed.
- **Performance at high load.** The 20 ms p95 target is missed at 84 moves/s on the test laptop. Production sizing needs measurements on the target host, with the database placed near the API.
- **First-move timing.** White's clock starts at game creation; there is no abort or first-move grace period.
- **Dead positions** beyond the listed material cases are not detected automatically.
- **Account deletion** is blocked for accounts with games until an anonymization policy exists.
- **Live review** remains read-only (list selection and stepping). Completed history, replay and temporary manual analysis are now delivered by the [history milestone](History_Replay_Analysis_Milestone.md); recent games use the authorized backend endpoint.
- Engine play (UCI), evaluation, ratings, spectators and chat remain later milestones or Coming Soon.
