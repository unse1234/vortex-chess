# Operations and troubleshooting

Operate one backend instance owning all game clocks/presence/engine work. See [deployment](deployment.md) for exact configuration and [database](database.md) for durability/retention. Procedures below describe operator work; this documentation task did not mutate a live database, send email, start games or load-test a service.

## Health and diagnostics

| Check | Meaning / limits |
| --- | --- |
| GET `/api/health/live` | HTTP process response; no DB/SMTP/engine check |
| GET `/api/health/ready` | SELECT 1 succeeds;503 generic if DB unavailable; does not verify migrations/tables/SMTP/engine |
| GET `/api/health` | basic browser latency ping, returns region local; not geolocation/performance telemetry |
| Authenticated GET `/api/engine-games/status` | cached5-second configured/readiness/name view; reserves nothing |
| EmailJob state | provider submission progress; SENT is not proof of recipient inbox delivery |

Nest process logs include bootstrap/resumed game count, mail disabled/worker failures, expiry/session sweep warnings, warm cache count, game load/write failures and engine attempt/stale/repair messages. API exception filter logs generic error names; game/engine services can log bounded diagnostic messages and identifiers. There is no central log redaction/audit system or support dashboard. Keep request bodies, cookies, bearer/reset tokens and private database/SMTP configuration out of externally shared logs.

`GameMetrics.summary()` provides bounded in-memory queue/validate/commit/emit/total percentiles over accepted moves; `EngineMetrics.summary()` separates gate queue, round trip, reported search time and outcomes/unsearched replies. They are injectable/internal, with no HTTP `/metrics` route or production exporter. A restart clears them. The frontend health ping does not measure move synchronization. No new benchmark or performance measurements were made for this audit.

## Startup, deploy and restart

Use [production rollout](deployment.md#production-rollout): validate env, drain/stop old game owner, apply committed migrations, start one backend, verify health and then the frontend. Do not use rolling overlap or start a temporary second API against the same live DB for diagnostics. Every GamesService bootstrap resets all active turn start timestamps and bumps revisions, restoring last committed remaining balances. The new process reconstructs full history and arms clocks, then repairs engine turns. Downtime and elapsed uncommitted thinking are not charged. Repeated restarts can repeatedly restore time; this is a known policy limitation.

Uncommitted writes are not visible/acknowledged. After ambiguous persistence errors the game cache is evicted; same-ID retry reloads the authoritative ledger. A game that could not be warmed may load on next authorized access; inspect repeated load/integrity failures rather than editing FEN to hide them. Timers retry failed finalization. Finished history is retained in DB; five-minute warm eviction is memory cleanup only.

Graceful shutdown hooks stop timers/subscriptions and cancel engine requests; cancellation does not abort a game. Password issuance tasks are tracked for shutdown. Mail transport closes and leased work can be reclaimed after its lease. There is no backup/restore script, process-manager manifest or automatic data repair command. Provision/test backup and restore in your own isolated environment, and never treat migrations as backups.

## Email delivery

Inspect configuration first without printing secrets: MAIL_TRANSPORT smtp requires MAIL_FROM/SMTP_HOST and optional credential pair; interval 0 prevents timer/nudges, disabled transport leaves all jobs pending. APP_PUBLIC_URL/first CORS origin determines link origin. No mail is sent solely because frontend displays success. Recovery202 can precede actual durable issuance; check whether a reset/outbox row was created after cooldown/cap rules.

Read-only aggregate SQL for a controlled operator console (no addresses/token payloads):

```sql
SELECT kind, status, count(*)
FROM "EmailJob"
GROUP BY kind, status
ORDER BY kind, status;

SELECT status, count(*)
FROM "Room"
GROUP BY status;

SELECT state, count(*)
FROM "MatchmakingSearch"
GROUP BY state;
```

Email transitions: PENDING → PROCESSING → SENT, SKIPPED, FAILED or PENDING retry. Each claim increments attempts and has a lease/lock token. Expired claims below max attempts are reclaimed; exhausted expired claims fail. SMTP4xx/connection errors retry with exponential jitter (default 30 sec, capped1 h),5xx/rejected recipient fail permanently. Job maxAttempts is fixed when enqueued. Stale claim holders cannot finish newer claims. Worker batch10 drains due jobs without overlapping its own run.

SKIPPED can be expected: invitation now answered/expired/cancelled, room closed/full, recipient online/read, interaction blocked; reset replaced/consumed/expired or encrypted payload unavailable. Offline invitation jobs are created only at initial offline detection; disconnecting later does not schedule one. Friendship request events never email. Recovering service does not turn FAILED jobs into PENDING automatically; no retry administration API exists. Review a failed job's specific status/error safely before an independently approved maintenance change or fresh user reset request.

SMTP acceptance followed by a process/DB failure before SENT can result in another delivery after lease expiry. Dedupe enqueue/claim protection is not exactly-once delivery at the provider. Preserve expired/used refresh digests until session lifetime ends, and note reset rows delete linked mail after seven-day expiry retention. Changing signing secret invalidates queued sealed token payloads; users should request fresh links after such a change.

## Realtime and social issues

For socket failures check the same API origin/path, `/api/socket.io` proxy upgrades/polling, allowed browser Origin, current access/session, socket count limit and ingress heartbeat timeouts. NEXT_PUBLIC_REALTIME_URL changes origin only. A session terminated by logout/reset/replay should disconnect; network outage should show reconnect rather than simulated success. An established socket uses database-session validity, not continuous JWT expiry checks. Subscription failure is separate from transport connection.

Game revision gaps trigger snapshot fetch; no-transport reads poll5 seconds and cannot submit moves. Queue status polls independently of the matchmaking page and automatically navigates a committed assignment. Closing tab/logout does not cancel search; cancel explicitly or wait five-minute expiry. Confirmation requires both ready within30 seconds; absent clients expire without game/rating change. Disabling MATCHMAKING preserves status/cancel, but rejects new joins/readiness. Disabling RATINGS suppresses reads/new admission, not settlement of committed rated games.

Presence means authenticated sockets in one process, with default 3-second final-disconnect grace. It is not activity/availability. Stale friends/request state should recover on personal invalidation,15-second polling or reconnect; block/remove updates social revisions and authorized refetch. Blocked pairs cannot discover/invite/newly match, but committed games, history, old inbox and public leaderboard rows remain. Do not diagnose those retained records as failed blocking.

## Engine issues

No provider configured: leave ENGINE_BASE_URL unset intentionally or configure a compatible service. A URL alone is not readiness. Availability can be briefly cached; create checks fresh health. Before increasing admission/concurrency inspect capacity and clock budgets; these are per-process bounds, not remote provider guarantees. HTTP body/status/schema/illegal moves are classified by the adapter; bounded failures abort with no result except genuine timeout adjudication.

Engine thinking occurs outside game lanes/transactions. A late reply after resignation/new revision should be discarded. Refresh/extra tabs should not create searches. Repair runs default 5 seconds and startup/commits also schedule. Set recovery interval 0 only if intentionally disabling that periodic safety pass. No-time state waits for ordinary flag handling; it is not a win awarded for network errors. See [engine](engine.md) for retry/quarantine and performance distinctions. Do not test upstream availability by creating production games or load-testing it.

## Database and maintenance

Startup connection/readiness failure: check private credentials, DB reachability and TLS/provider policy externally. Ready succeeds but domain fails: verify migration status against all12 committed directories; SELECT 1 does not prove schema compatibility. Prisma forces UTC so expiry math agrees with timestamptz. Direct administrative edits bypass many service invariants even when CHECKs succeed. Preserve accepted move history and rating audit consistency when investigating; application exposes no arbitrary repair endpoint.

There is no scheduled general purge for sessions/refresh tokens, inbox, room/invite/social history, games/commands or mail receipts. Reset token sweep clears payloads and deletes rows expired over 7 days; friend requests do not expire. Design and review retention separately. Account deletion is absent and game/rating FKs restrict history loss. Destructive SQL, `prisma migrate reset`, truncate/drop and rewriting applied migrations are destructive maintenance actions, never normal recovery steps. None were run here.

## Known gaps and source inconsistencies

| Finding | Current consequence |
| --- | --- |
| Terms text absent; acceptTerms not retained; email ownership unverified | Signup works without completed legal/ownership workflows |
| Chat/conversation/match-chat mock paths without controllers; voice gate false | No production text/live voice; audio recordings are effects only |
| Upstream score/PV consumed but no evaluation product | No engine analysis bar, hints, saved scores or accuracy |
| Three unused MP3s (illegal, premove, ten-seconds) | Asset presence does not implement warnings/premoves |
| Static UI flags versus runtime options | Real API navigation can exist while backend matchmaking/ratings or engine/mail are unavailable |
| Find Players card still describes casual/unrated, while screen supports Rated | Stale launcher copy; documented behavior follows screen/service |
| Leaderboard Play rated link opens matchmaking without preselecting Rated | User must choose Rated; link text alone does not select it |
| AccountSummary comment mentions rank/progress but renders username and Coming Soon XP | Own email exists in session API, not rendered by that summary; actual ratings composed separately |
| Historical READMEs/plans/milestones include obsolete missing-feature and UCI-process statements | Current guides/catalog supersede those dated scope claims; historical tests remain historical |
| Static OpenAPI shared errors/strictness and social response specificity | Read [API reconciliation](api.md#openapi-reconciliation-notes); no nonexistent API inferred |
| Channel snapshot capture precedes join | Post-join emit reduces race but does not guarantee atomic gap-free subscribe; no durable event replay/cursor |
| Live events/read-count hints lack universal cross-operation revision | Authoritative HTTP reads recover; no exactly-once delivery or full global order claimed |
| Single game owner/startup resets all active turns | Multi-replica rolling deployment unsafe; restarts restore uncommitted thinking time |
| Email/reset issuance and provider acceptance boundaries |202 not durable issuance/delivery proof; SMTP crash window can duplicate sends |
| General retention, distributed limits, socket command limits, hosted CI/backup manifests absent | Operator/tooling work remains, not silently implemented by package scripts |

These findings are recorded without runtime changes. Verification blockers and exact audit commands are in [testing](testing.md).
