# Friends and social management

Implemented 29 October 2026. This milestone enables Friends and friend management in real API mode. It supersedes earlier Coming Soon references to Friends only. Google login, public rooms, text/voice chat, feeds, tournaments, engine evaluation and other deferred features remain disabled.

## Ownership and state

| Owner | Responsibility |
| --- | --- |
| Users / UsersSearchModule | Authenticated normalized username prefix search, safe public identity |
| Social | Friend requests, canonical friendships, directional blocks, shared interaction policy, relationship revisions |
| Invitations | All direct game invitations, room admission, expiration, offline invitation email decisions |
| Notifications | Durable inbox, deduplication, current request state, post-commit delivery |
| Realtime / Presence | Authenticated sockets, per-account connection count, disconnect grace, authorized friend presence invalidations |
| Matchmaking / Games | Pair reservations, final eligibility, atomic game admission, unchanged gameplay and settlement |

There is no second challenge/game creation implementation. Challenge opens `/rooms/new?invite=<username>` and uses the existing username invitation flow. Friends games remain casual/unrated. Friendship never grants room access.

Frontend transport lives in `features/social/services`; TanStack Query options/hooks own all server relationship state. Components only call hooks. Search text, selected section and confirmation dialogs are local UI state. The session bridge composes social, notifications and invitation recovery without sibling-feature imports. No components attach raw sockets or call Axios.

## Request lifecycle and consistency

`PENDING → ACCEPTED | DECLINED | CANCELLED`. Each send after a terminal request creates a new identity; old identities remain available to notifications. There is at most one pending request per unordered pair, enforced by a PostgreSQL partial unique index. Friendships have a canonical ordered UUID pair and a unique index. Foreign keys, self checks, pair ordering/membership checks and directional block uniqueness live in the migration.

Self requests fail. Same-direction retries return the existing outgoing request, without a second notification or rate charge. Opposite-direction sends return incoming and require explicit acceptance. Only the recipient can accept/decline; only the sender can cancel. An unrelated account receives 404 for a private request. Repeated terminal actions return current state and never recreate a removed friendship. Sending to an existing friend returns Friends.

Acceptance checks blocks, creates the unique friendship, updates the request and inserts the accepted notification in one transaction. Decline and cancel produce no extra notification/email. New sends are limited per account per rolling hour, with a pair-wide resend cooldown based on the last request update. Retries of existing pending requests remain idempotent inside these limits. An account advisory lock serializes the hourly budget across backend workers.

Removal deletes the relationship for both participants and revokes friend presence. It does not block, cancel pending game invitations or modify games/ratings/history. Future requests are allowed subject to cooldown and rate policy. No relationships are inferred from old games or invitations.

## Blocking policy

A directional block is owned only by its creator. Restrictions apply if either direction exists. Blocking atomically removes friendship, cancels pending friend requests in either direction and invalidates pending direct game invitations. New username/email challenges, friend requests, invitation acceptance and future casual/rated random pairing are prohibited. Previously emailed invitation links fail on acceptance. A queued invitation email rechecks eligibility immediately before delivery; delivered mail cannot be recalled.

Discovery excludes restricted pairs. Interaction failures use `interaction_unavailable` / generic unavailable feedback and never identify block direction. No block-specific notification is sent. The block list returns only the actor's records; there is no blocked-me endpoint. Unblock removes only the actor's record and restores nothing. A remaining opposite block still restricts interactions.

A committed game always continues, including a game committed immediately before a concurrent block. Blocks do not touch game commands, clocks, history or rating settlement. An accepted room that has not started cannot create a new game between a restricted pair.

## Locks and delivery

`social/interaction-policy.ts` is the shared policy boundary. Every conflicting social mutation, direct invitation create/accept and matchmaking final pair uses the same PostgreSQL transaction advisory lock over a canonical UUID pair. No process-local lock contributes to correctness.

Acquisition order is game admission when needed → sender rate lock for request sends → canonical pair → room → invitation/request rows → sorted User revision rows. Room start acquires admission/pair before locking its room; a changed seat yields a revision conflict rather than taking a different pair lock out of order. Matchmaking's existing global admission lock serializes queue/game creation with blocking. Candidate SQL excludes blocks; reservation and final ready/creation both recheck policy. Transactions use the existing bounded retry helper for definitively rolled-back serialization/deadlock errors. Repositories receive the caller's transaction; no nested independent transaction or email/socket call runs while domain locks are held.

`User.socialRevision` increases for both accounts on each relationship change. Post-commit personal `social.updated` events contain `{eventId: "social:<userId>:<revision>", revision}` only. Event ids/revisions survive retries and the events never carry snapshots that could restore old state. No block reason is included. Durable notifications use their existing unique dedupe keys and stable ids. Delivery rechecks blocks and pending/accepted relationship eligibility where applicable. Notifications remain durable if a socket event is missed.

Frontend recovery cancels in-flight social HTTP queries before invalidating the relationship cache. Every HTTP query consumes its AbortSignal. Username search has separate cache keys per debounced term, no previous-term placeholder data, and hides old results during debounce. Stale event revisions are ignored; even a delayed valid event can only refetch the current database snapshot. Reconnect refetches friends, requests, blocks/search if mounted, invitations and notifications. Friends/request polling every 15 seconds also recovers lost invalidations. Read pages include a consistent database revision from a repeatable-read snapshot.

Inbox state updates in every tab. Stable notification ids deduplicate toasts/audio; visible tabs claim presentation with Web Locks plus a bounded local-storage ledger, then call the existing toast/audio mechanisms. Browsers without Web Locks/storage retain best-effort cross-tab / per-tab deduplication. Old inbox reads never play sounds or toasts. Current terminal request state makes historical request notifications non-actionable.

## Presence and deployment support

Only accepted, unblocked friends receive ONLINE/OFFLINE status through their friends list. No last-seen timestamps, activities or game links exist. Presence invalidations go only to currently authorized friends on authenticated personal channels; they contain no subject identity/status, so delayed delivery cannot reveal presence after access is revoked. Arbitrary `presence:<id>`, `friend:<id>` and another account's personal-channel subscription requests are rejected. HTTP lists independently enforce friendship and blocks.

Presence counts every authenticated tab/device. One valid connection keeps an account online; closing one of several does not change status. A configurable short grace avoids offline/online flicker after a brief disconnect. Existing session revocation disconnects session sockets; the existing periodic session check catches expired/revoked sessions. Socket connection caps remain unchanged.

**Supported deployment: one backend instance.** Presence and Socket.IO delivery remain in memory, as in the existing deployment. PostgreSQL relationship/pairing correctness and request budgets are shared across processes, but the presence map is not. A Redis Socket.IO adapter alone is insufficient: horizontal deployment additionally requires shared authenticated connection/session presence with grace/expiry, cross-instance session revocation and relationship/presence event delivery. These are not installed/configured by this milestone. Do not deploy multiple API instances and claim correct online status or immediate revocation across instances. HTTP/reconnect recovery does not make an in-memory presence map distributed.

## Contracts

All endpoints require the existing bearer session and return safe public identities (`id`, `username`, `avatarUrl`) only. No endpoint accepts another account id as the owner of private lists. Unknown query fields are rejected. See the committed OpenAPI for complete schemas/errors.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/users/search?search=Al` | Normalized username prefix; minimum 2, maximum 20 characters; includes viewer-specific relationship/request id |
| GET | `/social/friends` | Accepted unblocked friends and authorized presence |
| GET | `/social/requests?direction=incoming\|outgoing` | Actor's pending requests |
| POST | `/social/requests` | `{userId}`; idempotent send/current relationship |
| POST | `/social/requests/:id/accept` | Recipient only |
| POST | `/social/requests/:id/decline` | Recipient only |
| POST | `/social/requests/:id/cancel` | Sender only |
| DELETE | `/social/friends/:userId` | Remove own relationship with this player |
| GET | `/social/blocks` | Only the actor's blocked accounts |
| POST | `/social/blocks` | `{userId}`; block |
| DELETE | `/social/blocks/:userId` | Remove only the actor's block |

Lists/search use `limit` (1–50, default 20), opaque `cursor`, optional normalized prefix `search`, and return `{items, nextCursor, revision}` ordered by createdAt/id descending. Reuse a cursor with the same filters. Mutations return authoritative `{relationship, revision}` and request actions also return the request's current state. Friend request state uses uppercase enum values; relationship discovery states are `none`, `incoming`, `outgoing`, `friends`. Generic unavailable mutation outcomes may use `unavailable`.

Personal events: `social.updated` (stable id/revision), `social.presence` (authorized snapshot invalidation), existing `notification.created` / `notification.read`, existing `invitation.updated`. Notification types add `friend.request.received` and `friend.request.accepted`; their `friendRequest` field includes the durable id and current state.

UI routes: `/friends` with Friends, Incoming Requests, Sent Requests and Find Players; `/settings/blocked-accounts` for private block management. Username discovery is separate from random matchmaking. The lobby sidebar links to management and challenges online or offline friends through existing invitations. Remove/block/unblock confirmations use the existing accessible native dialog.

## Configuration and rollout

| Variable | Default | Bounds / meaning |
| --- | --- | --- |
| `FRIEND_REQUEST_MAX_PER_HOUR` | 30 | 1–500 new requests per sender in a rolling hour; database-enforced budget |
| `FRIEND_REQUEST_COOLDOWN_SECONDS` | 300 | 0–86400 between requests for the same pair after a terminal outcome |
| `PRESENCE_DISCONNECT_GRACE_MS` | 3000 | 0–30000 after last disconnect |

1. Back up the deployment database and apply `202610290001_social` with `npm --prefix backend run db:migrate` before starting the new backend. The migration is additive; existing games, invitations, ratings and users are preserved. No friendship backfill occurs.
2. Run `npm --prefix backend run prisma:generate` and build/deploy the backend with the installed Prisma 7/Nest 12 versions. Configure the limits/grace above. Keep one API instance.
3. Build/deploy the frontend. Real API mode enables Friends/socialManagement. Explicit MSW demo mode keeps management unavailable and never pretends requests were sent. No new dependencies are required.
4. Keep existing SMTP settings for offline game invitations. Friend requests never enqueue emails. Existing Google/public-room/chat and other Coming Soon gates are unchanged.

## Verification

Tested against fresh, isolated PostgreSQL 18 databases, separately for integration and browser QA. The development database was not used. The test fixture disables the generic IP throttle to exercise domain races/rate limits directly; the configurable account budget still runs against PostgreSQL.

- Backend: lint/typecheck/build pass; **202 unit tests** and **113 PostgreSQL/HTTP/Socket.IO integration tests** pass. The **16 social integration tests** cover actors, self/duplicate/opposite requests, concurrent sends/accepts/cancel/block, unique friendships, notification rollback, shared hourly budgets, cooldown, pagination, safe projections, directional block ownership, remove/unblock, invitation creation/acceptance races, email skipping, old emailed links, casual/rated pairing and blocking races, committed-game rating settlement, unauthorized subscriptions, multi-tab/grace, presence revocation and stable event ids. Existing authentication, password recovery, gameplay, engine HTTP-adapter, matchmaking, ratings and history suites pass.
- Four opt-in live-engine/benchmark tests are skipped. No live external engine check was needed for this social feature.
- Frontend: lint/typecheck/production build pass; **134 tests** pass. Social regression tests cover distinct search keys, input bounds, cancellation of old HTTP reads before cache recovery, reordered/duplicate event revisions, and non-actionable/historical notification sound behavior. Existing game audio and replay/manual analysis tests pass.
- Migration applies from an empty database through all 12 migrations. Prisma validation passes; `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` reports **no difference**. While checking this, the existing MatchmakingSearch schema metadata was aligned to its deployed SQL migration (explicit NoAction on FK updates and the existing PostgreSQL-truncated index name). Existing database constraints/indexes and matchmaking behavior are preserved; no extra migration is needed for that metadata alignment.
- The OpenAPI JSON parses and all local schema references resolve. Browser QA caught a missing DELETE CORS method; it was corrected and covered by an allowed-origin/denied-origin preflight integration test. No dependencies were added. The example environment now contains placeholders instead of credentials.

**Browser: 21 checks passed**, using the installed Playwright/Chromium runtime because the Browser plugin was unavailable. The real production frontend at port 3010 used the real backend/isolated database at port 3011, three independent signed-in accounts, additional tabs, and desktop 1440px/mobile 390px viewports. The external engine provider and actual mail delivery were disabled for this browser fixture. Exercised:

- Authenticated Friends entry and empty states; username discovery/safe summaries; send/Pending/Sent Requests; visible-recipient realtime toast; explicit acceptance and live friendship.
- Third-account private-list/presence isolation; multiple tabs staying Online until the final disconnect/grace.
- Offline friend Challenge → existing setup/create-room/invite flow. Removal through confirmation revokes friendship while preserving the pending game invitation.
- Block through confirmation hides discovery and prevents accepting that old invitation. Private blocked-account settings and confirmed Unblock work on mobile and restore no friendship.
- Decline updates the sender search; sender cancellation removes recipient actions; reconnect restores a missed request; reload restores accepted friendship.
- A relationship removal synchronizes the actor's other tab. An injected request failure displays its error and leaves Add Friend available.
- Existing lobby sidebar entry works. Desktop and mobile screenshots were inspected; no mobile page overflow or browser page errors occurred.

Local QA artifacts: `C:/Users/Unse/AppData/Local/Temp/vortix-social-browser-qa/` (report and screenshots). These are not committed application assets.

Not verified: real SMTP-provider delivery, production HTTPS/proxy/WSS, multiple backend instances, non-Chromium browsers, or cross-tab presentation fallback in browsers without Web Locks/storage. Presence/realtime is supported only on one backend instance as documented above. The existing SMTP adapter/outbox integration tests use a fake transport and verify offline invitation policy and cancellation checks; friend requests never send email.
