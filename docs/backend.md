# Backend implementation

The NestJS API is rooted at `/api`. [AppModule](../backend/src/app.module.ts) composes configuration, database, authentication, health, realtime, rooms, invitations, notifications, matchmaking, social and user search. Games, engines, ratings and mail are wired through their owning modules' imports. Controllers contain transport validation and delegate to services; services own rules/transactions; repositories own persisted access. Source paths below are under `backend/src/modules` unless specified.

## Request lifecycle and modules

`main.ts` creates Nest with its default parser disabled. `configure-app.ts` applies Helmet, removes x-powered-by, sets JSON16 KiB, cookie parsing, no-store, exact-origin credentialed CORS, global API exception filter and the Socket.IO adapter, then enables shutdown hooks. `ConfigurationModule` validates environment names/ranges and reports invalid field names without values. `PrismaService` connects with the PostgreSQL adapter and UTC sessions.

Global HTTP throttling defaults to 120 requests/minute/IP in memory. Controllers override selected endpoints; see [API](api.md#pagination-idempotency-and-rate-limits). `AccessTokenGuard` validates bearer JWT and live database session before protected handlers. Cookie-authentication mutations additionally require exact Origin and CSRF header. `SchemaValidationPipe` runs strict Zod schemas and produces field errors. UUID path schemas and bounded cursor/page schemas reject malformed input. Some endpoints have no explicit query/body schema, so do not assume every unknown input is rejected. Controllers return sanitized views; `ApiExceptionFilter` converts known errors and hides unknown database/server details.

| Owner | Implementation / responsibilities |
| --- | --- |
| `auth/`, `users/` | User normalization, Argon2id password hash, atomic registration, access/refresh issuance, session checks/revocation, recovery; own-session and public-player views differ |
| `health/` | Process ping/live and PostgreSQL SELECT 1 readiness |
| `rooms/` | Exact time presets, host limits, seats/settings/readiness/revision/expiry/start/cancel/leave |
| `invitations/` | Registered recipient resolution, recipient/sender authority, seat claim, transitions, inbox effects and offline-mail decision |
| `notifications/` | Durable deduped owner inbox, read/count and contextual views |
| `mail/` | Transactional outbox enqueue/claim/retry and SMTP transport; no provider calls in domain transactions |
| `realtime/` | Socket authentication, personal/resource channels, session disconnects and ephemeral presence |
| `games/` | Game creation/reconstruction, clocks/rules/commands, history, finished manual preview and engine-turn orchestration |
| `engines/` | HTTP adapter, external response validation, health, admission-independent search gate/retry/budget/metrics |
| `matchmaking/` | Durable search/confirmation/assignment and expiry, pairing/admission locks |
| `ratings/` | Exact preset pools, immutable Elo policy, atomic settlement and authorized read models |
| `social/`, `users/users-search.ts` | Prefix discovery, request/friend/block transactions, privacy and social revisions |

## Authentication and recovery

`AuthService.register` hashes before starting a transaction, then creates User/session/refresh digest atomically. Unique violations become identity field conflicts. Login uses `PasswordService.verify`, including a dummy hash for missing users, and creates an independent session. `issue` signs HS256 JWTs with sub/sid/jti, fixed issuer/audience and short expiry. `AuthCookieService` emits only refresh secrets in HttpOnly cookies.

Refresh locks AuthSession before reading token use, marks its digest used, inserts replacement and updates last-used atomically. Used-token replay commits family revocation before returning401 and closes local sockets. Logout revokes the cookie's family idempotently. HTTP access checks the live session on each request; established sockets use session checks rather than replaying JWT verification for every event. See [security](security.md).

`PasswordRecoveryService.requestReset` awaits lookup then tracks off-response issuance work. A202 is not a durable guarantee that a job was written: a process failure before issuance commits or a caught issuance error can leave no mail job. `PasswordResetRepository.issueInTx` locks User, applies cooldown/hour cap, replaces outstanding tokens and enqueues mail in the same transaction. Reset computes a hash after a cheap validity check, then locks User, conditionally consumes the token, writes password, revokes outstanding tokens/all sessions and enqueues changed-password notice atomically. Exactly one racing reset can consume. Status checks are read-only. Raw reset tokens are encrypted only for eventual email and removed when settled/expired/revoked; [database lifecycle](database.md).

## Rooms, invitations and social concurrency

Room creation locks the host User row so concurrent creates cannot exceed the configured live-room cap. Settings/readiness/start use expectedRevision and a row lock. Material settings invalidate both confirmations. Start checks host/readiness/seats and shared admission, creates one game/participants, cancels pending invites and marks STARTED together. Game.roomId uniqueness is a second duplicate guard. Challenger leave clears seat/readiness; host cancellation closes pending invites in its transaction.

Invitation creation authorizes host before account lookup, locks the canonical social pair, checks block policy and locks Room before pending-invite operations. A partial unique SQL index protects `(roomId,recipientId)` where PENDING. Acceptance locks pair → room → invitation, checks intended recipient, expiry and seat, then changes invitation/room and adds sender notification together. Repeated terminal actions return their appropriate established outcome or a clear conflicting terminal-state error. DeferredFailure lets expiry/revocation changes commit before the request reports a failure. Views never expose other players' emails.

`SocialService.run` uses consistent locks: admission if needed → sender rate lock for new requests → canonical pair → domain rows → sorted User revision rows. The pair advisory lock serializes opposite request sends, accept/cancel/block races and invitation/block interactions. Request acceptance upserts one friendship and notification atomically; immutable terminal requests cannot recreate a removed friendship. Opposite send returns current incoming state. Blocking, under admission/pair lock, creates directional block, deletes friendship, cancels pending requests/invites and bumps both social revisions. Matching/start rechecks blocks. Ongoing committed games/results are untouched. Unblock deletes only the actor's directional block. Transactions have bounded wait/time and retry only recognized database conflicts through `database/retry-transaction.ts`.

## Gameplay and persistence

`GameStore` keeps reconstructed state and one `KeyedSerialQueue` lane/game; different games progress independently. `GameCommandsService.execute` timestamps receipt (socket before validation; HTTP after guards), verifies participant, checks durable command fingerprint first, rejects finished/stale/out-of-turn/illegal actions and adjudicates fallen flags before applying new changes. `chess-rules.ts` uses chess.js for legal move generation/FEN/SAN and custom draw/repetition policy. Browser timestamps are never trusted.

`GameRepository.commitMove` uses a revision/status-guarded SQL CTE to update Game, append GameMove and insert the human GameCommand in one atomic statement. Engine moves use a deterministic turn ID and revision/ply guards without a human ledger row. `commitChange` handles draw/resign/timeout/resumption. Final changes call `commitFinal` with rating settlement inside the same Prisma transaction. Only after successful commit does the command pipeline update memory/repetitions/ledger, timers, emit viewer-specific state and acknowledge. Ambiguous/failed writes evict warm state; the same command retry reloads the ledger or retries safely. Failed timeout saves reschedule.

Clocks charge the side to move from turnStartedAt to server receipt. Accepted moves charge elapsed and add increment once; the opponent starts at that receipt time. Timers and commands share the lane so timeout races have one final result. No lag compensation or disconnect pause exists. A pending draw does not stop the clock; movement declines an opponent offer, and the declined offerer must move before a repeat. Engine draw offers are rejected.

Draw policy: mate takes precedence; then stalemate, detected insufficient material, repetition and 50-move history. Repetition uses first four canonical FEN fields including en passant only when legally capturable. Third occurrence or halfmove clock100 draws automatically. Dead material covers kings only, king plus one bishop/knight versus king and all remaining bishops on the same square shade. Timeout also checks whether the nonflagging side can mate; this is a limited detector, not exhaustive dead-position proof. No claim UI is implemented.

At application bootstrap, `resumeActive` resets turnStartedAt on all ACTIVE rows and increments revisions, preserving last accepted clock balances. State/move/command history reconstructs legality/repetition; timeouts are armed and engine turns recovered. This restores elapsed uncommitted thinking and prevents downtime charges. Do not run overlapping game-owning processes. Finished warm games are evicted after five minutes idle on a60-second sweep; durable records remain.

`GameHistoryService` filters participant-owned finished rows by side/result and pages by endedAt/id descending. `AnalysisPreviewService` authorizes finished participants, reconstructs recorded prefix and checks supplied UCI path in a fresh chess.js instance. It returns FEN/SAN/legal moves only; it never touches live runtimes, clocks, commands, engine or persistence. It reports corrupt recorded prefixes as503 rather than manufacturing a replay.

## Matchmaking

`MatchmakingService` keeps one durable row/account with a revision surviving new searches. Shared admission locks serialize join/cancel/confirmation and room/engine starts; there is no socket-presence correctness dependency. Eligible pairs match exact base/increment/rated/pool, exclude active games/self/blocks and use deterministic oldest queue ordering. Rated pairing uses current locked-pool profiles/window checks; both current tolerances must permit it. Casual pairs are attempted on a joining request; periodic/poll widening work targets rated searches.

Search TTL 5 min; pairing creates confirming rows with one pairId and30-second expiry. Open authenticated clients automatically ready through HTTP. Both ready claims and creation of a single RANDOM game/assignment commit together. Clocks start at creation, not search/pair reservation. Cancellation checks searchId and pending state and releases both reservations with reasons. Matched assignments survive reload until game finish. Every status mutation/read maintenance pass expires due rows; the5-second worker also relays committed revisions to locally connected users. This supports cross-process admission tests, not full multi-instance game ownership.

`MATCHMAKING_ENABLED=false` rejects joins/ready but preserves status/cancel recovery. `RATINGS_ENABLED=false` rejects new rated joins, suspends rated pairing and read endpoints; committed rated games still settle when they finish.

## Ratings

`rating-policy.ts` defines `elo-v1`: three pools, initial1200, K 32, scale400, floor100, provisional until ten settled games. Only listed exact Bullet/Blitz/Rapid presets map to pools. Rated RANDOM games with two distinct human seats snapshot both current profiles/games under sorted rating locks at creation. No historical backfill, private or engine rating settlement exists.

For White, expected score `Ew = 1 / (1 + 10 ** ((Rb - Rw) / 400))`; score is1/0.5/0. `rawDelta = Math.round(32 * (score - Ew))` using JavaScript tie behavior toward positive infinity. Clamp that shared delta between `100 - Rw` and `Rb - 100`, normalize negative zero, then apply `+delta` to White and `-delta` to Black. Both floors and zero-sum are preserved. K does not change during provisional games. Counters/peak/revision and two audit changes update atomically with result. There is no minimum move count: resignation/timeout after official creation can count; search no-shows create no game or rating change.

Eligibility requires rated + RANDOM + FINISHED + decisive/draw result + valid termination; engine failures/aborted excluded. Settlement checks policy/start snapshot consistency and a unique game settlement; repeated calls read existing changes and cannot double-apply. No result/rating write endpoint exists. A global feature flag does not turn off settlement of an already committed eligible game.

`RatingsReadService` synthesizes1200/zero-game views if a profile row does not yet exist. Leaderboards include only leaderboardEligible and at least ten games, compute SQL `RANK` over the full pool before limit/offset, order tied rows by userId and return competition ties (1,1,3). Personal position counts strictly higher ratings. Reads use RepeatableRead for coherent rows/count/rank. Rating history is private keyset pagination; public rankings contain username/id and rating/WDL/games, no email.

## Jobs and shutdown

| Job | Trigger and behavior |
| --- | --- |
| Room/invitation expiry | default 30-sec interval, disable with 0; reads/mutations still enforce expiry; persists terminal states and publishes |
| Password reset cleanup | same expiry interval; clears expired encrypted payloads, deletes tokens expired over 7 days (linked jobs cascade) |
| Mail worker | default 10-sec interval plus after-commit nudge; disabled transport/interval 0 leaves pending jobs; batches10 with leases/retries |
| Realtime session check | default 60 sec; disconnects expired/revoked families; game commands also recheck session at most 5-sec interval |
| Matchmaking maintenance | every 5 sec; expiration/pairing/finished assignments and local event relay |
| Engine repair | default 5 sec,0 disables periodic only; commits/startup still schedule |
| Game timeout / warm eviction | per-turn deadlines; finished cache sweep60 sec |

Timers/subscriptions clean up in lifecycle hooks; engine shutdown aborts requests without finalizing games. Recovery issuance tracks in-flight tasks for shutdown. Mail transport closes on shutdown; durable leased jobs can later be reclaimed. Sessions/refresh history and general game/social/inbox/outbox retention have no scheduled purge. See [operations](operations.md).
