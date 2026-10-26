# Private rooms, invitations, notifications and presence milestone

Updated: 22 October 2026. Follows the [authentication milestone](Backend_Authentication_Milestone.md).

This milestone adds private two-seat rooms, invitations to registered accounts by username or email, a durable notification inbox, authenticated Socket.IO realtime with presence, and an outbox-driven offline invitation email. The frontend room setup, waiting room, invitation dialog, notification panel and invitation landing page are connected to the real API.

It ends at a populated, synchronized waiting room. Creating a game from a ready room, chess rules, moves, official clocks, UCI engine integration and evaluation are the next milestones. "Start match" was a disabled Coming Soon control in this milestone; the [gameplay milestone](Gameplay_Milestone.md) implements it, adds the `started` room status and `gameId`, and closes pending invitations at start.

Before this milestone the frontend had no room setup, waiting room or invitation landing screen (`/rooms/new` was a placeholder), and the notification popover was a static empty state. These screens were built in the existing launcher design language: tokens, `Panel`, `Dialog`, `Popover`, toast and button primitives. The previous friend-picker invite dialog depended on a friends API that is outside V1 scope; "Play with Friends" now asks for a username or email, as the project plan specifies.

## Local setup

Same as the authentication milestone, plus one migration. In `backend/`:

```powershell
npm ci
npm run db:migrate      # applies 202610220002_rooms_invitations_notifications
npm run start:dev
```

Mail is disabled by default (`MAIL_TRANSPORT=disabled`): invitation emails are recorded as `PENDING` outbox jobs and nothing is sent. To send, set `MAIL_TRANSPORT=smtp` and the `MAIL_FROM`/`SMTP_*` variables (see [configuration](#configuration)). The frontend needs no new settings; Socket.IO uses the API origin and `<API path>/socket.io` (`http://localhost:3001/api/socket.io` locally).

## Database changes

Migration `backend/prisma/migrations/202610220002_rooms_invitations_notifications/migration.sql` adds four tables and six enums. Prisma's diff of the migrated database against the schema is empty.

| Table | Purpose | Key constraints |
| --- | --- | --- |
| `Room` | Host and challenger seats, readiness, settings, status, `revision`, `expiresAt`, `closedAt` | Distinct seats; challenger readiness requires a challenger; `READY` requires both seats ready; `closedAt` set exactly for `CANCELLED`/`EXPIRED`; time control within 1 min–3 h and increment within 0–180 s; revision ≥ 1 |
| `Invitation` | Sender, recipient **account id**, room, `addressedBy` (USERNAME/EMAIL), status, `expiresAt`, `respondedAt` | **Partial unique index: one `PENDING` invitation per (room, recipient)**; no self-invitations; `respondedAt` set exactly for accepted/declined |
| `Notification` | Recipient, actor, type, invitation and room references, `readAt` | Unique `dedupeKey` (one row per logical event); partial index on unread rows |
| `EmailJob` | Transactional outbox: kind, `dedupeKey`, recipient, invitation, status, attempts/maxAttempts, `availableAt`, lease token, provider message id and response, skip reason | Unique `dedupeKey`; attempts ≤ maxAttempts; lease token present exactly while `PROCESSING` |

Seats live on the `Room` row, so one `SELECT … FOR UPDATE` serializes every seat claim, settings change, readiness change and cancellation for a room. Deleting a user cascades their rooms, invitations, notifications and jobs; a challenger's deletion frees the seat.

## HTTP contract

[OpenAPI JSON](../backend/openapi.json) (v1.1.0) is the machine-readable contract. All endpoints below require `Authorization: Bearer <access token>`. They do not use cookies, so the cookie CSRF guard does not apply. Errors keep the `{ code, message, fieldErrors? }` shape. CORS now allows `PATCH`.

| Method and path | Who | Result |
| --- | --- | --- |
| `GET /api/rooms/options` | Any signed-in user | Supported presets (`1+0`, `2+1`, `3+0`, `3+2`, `5+0`, `5+3`, `10+0`, `10+5`, `15+10`, `30+0`, `30+20`), colour preferences, room/invitation lifetimes |
| `POST /api/rooms` | Any signed-in user | 201 `{ room }`; `{ timeControl: { initialMs, incrementMs }, colorPreference? }`; 409 `too_many_active_rooms` |
| `GET /api/rooms/:roomId` | Seat holders | `{ room }`; everyone else gets 404 `room_not_found` |
| `PATCH /api/rooms/:roomId/settings` | Host | `{ expectedRevision, timeControl?, colorPreference? }`; material changes reset both readiness flags |
| `POST /api/rooms/:roomId/ready` | Host or challenger | `{ expectedRevision, ready }`; 409 `room_not_full` until a challenger is seated |
| `POST /api/rooms/:roomId/cancel` | Host | Idempotent; cancels pending invitations in the same transaction |
| `POST /api/rooms/:roomId/leave` | Challenger | 204; frees the seat and resets readiness |
| `POST /api/rooms/:roomId/invitations` | Host | 201 `{ invitation }`; `{ recipient: "<username or email>" }` |
| `GET /api/rooms/:roomId/invitations` | Host | `{ items }`, newest first |
| `GET /api/invitations?role=received\|sent&status=pending\|all&cursor&limit` | Current user | Keyset-paginated `{ items, nextCursor }` |
| `GET /api/invitations/:id` | Sender or recipient | `{ invitation }`; others get 403 `invitation_wrong_account` with no details |
| `POST /api/invitations/:id/accept` \| `decline` | Recipient | `{ invitation }`; repeats return the existing outcome |
| `POST /api/invitations/:id/cancel` | Sender | `{ invitation }`; idempotent |
| `GET /api/notifications?cursor&limit` | Owner | `{ items, nextCursor, unreadCount }`, newest first |
| `GET /api/notifications/unread-count` | Owner | `{ unreadCount }` |
| `POST /api/notifications/:id/read` | Owner | `{ notification, unreadCount }`; other accounts get 404 |
| `POST /api/notifications/read-all` | Owner | `{ unreadCount }` |

Room snapshots carry `revision`, `status` (`waiting`, `ready`, `cancelled`, `expired`), settings, both seats (player, `ready`, `online`, assigned `color` or null for random), `expiresAt` and the viewer's permitted actions (`role`, `canEditSettings`, `canInvite`, `canCancel`, `canLeave`, `canSetReady`). Invitation views carry the effective status, `addressedBy`, sender and recipient profiles, a room summary with `availability` (`open`, `full`, `closed`, `joined`) and the viewer's permitted actions. Player profiles are `{ id, username, avatarUrl }`. **No room, invitation or notification payload contains another account's email address**, including invitations addressed by email.

Conflict codes: `room_revision_conflict`, `room_not_full`, `room_full`, `room_cancelled`, `room_expired`, `too_many_active_rooms`, `invitation_pending`, `invitation_accepted`, `invitation_declined`, `invitation_cancelled`, `invitation_expired`. Other codes: `account_not_found` (404, with `fieldErrors.recipient`), `self_invitation` (400), `not_room_host`, `not_room_challenger`, `not_invitation_recipient`, `not_invitation_sender`, `invitation_wrong_account` (403), `invalid_cursor` (400).

### Concurrency and idempotency

- **Revisions.** Every persisted room change increments `revision`. Settings and readiness requests must send the `expectedRevision` they were based on; a mismatch is 409 `room_revision_conflict` and nothing is written. Readiness is therefore a confirmation of specific settings: a challenger's "ready" for settings the host has since changed is rejected. Repeating the current readiness or unchanged settings is a no-op without a revision bump.
- **Acceptance** first authorizes the caller as the invitation's recipient, then locks the room row and the invitation row, in the same order as cancellation (room, then invitation). Under the locks it checks status, expiry, room availability and the challenger seat, then seats the challenger, resets readiness, bumps the revision, marks the invitation accepted and writes the sender's notification, all in one transaction. Concurrent accepts by different invitees yield one success and `room_full` for the rest; a repeated accept by the same recipient returns the accepted invitation.
- **Duplicate invitations.** Creation holds the room lock, so concurrent duplicates serialize; the partial unique index is a second guard. A stale pending invitation that has expired is marked expired first and no longer blocks a new one. Declined, cancelled and expired invitations never block re-inviting.
- **Room limit.** Room creation locks the host's user row, so `MAX_ACTIVE_ROOMS_PER_USER` holds under concurrent requests.

### Expiry

Rooms expire `ROOM_TTL_MINUTES` after creation. Invitations expire after `INVITATION_TTL_MINUTES`, never later than their room. Expiry is enforced on every relevant operation, not only by the background job:

- Reads compute the effective status, so a past-due pending invitation reads as expired.
- Room reads, mutations and channel subscriptions first persist due room expiry (with a revision bump) and publish it.
- Invitation reads and actions persist due invitation expiry; an accept or decline against an expired invitation commits the expiry and then returns 409 `invitation_expired`.

An in-process sweep (`EXPIRY_SWEEP_INTERVAL_SECONDS`, default 30) also expires due rows and publishes the changes.

## Realtime contract

Socket.IO 4 runs on the API's HTTP server at path `/api/socket.io`, through a NestJS gateway. The frontend `lib/realtime/socket-realtime-client.ts` adapter implements the existing transport-agnostic `RealtimeClient` contract.

**Authentication.** The handshake sends `auth: { token: <access token> }`. The server verifies the JWT and that its database session is still active, exactly as HTTP requests are verified. Handshakes from a browser `Origin` outside `CORS_ORIGINS` are refused, including the WebSocket transport that CORS does not cover. Each account may hold at most `REALTIME_MAX_SOCKETS_PER_USER` sockets. A connection is not cut when its 5-minute access token expires. Instead, sign-out and refresh-token replay revocation disconnect that session's sockets immediately (with a final `session.ended` event), and a periodic check (`REALTIME_SESSION_CHECK_SECONDS`) disconnects sockets whose session was revoked or expired by any other path. On reconnect the adapter reads the current token. If the server rejects it, the adapter calls the auth feature's refresh once and reconnects, or stops if the session has ended.

**Envelope.** Every server event is emitted as `event` with `{ channel, type, payload }`.

| Channel | Membership | Events |
| --- | --- | --- |
| `user` | Joined by the server for the authenticated account; never requested by clients | `notification.created { notification, unreadCount }`, `notification.read { ids, all, unreadCount }`, `invitation.updated { invitation }` (to sender and recipient, each with their own view), `session.ended`, `connection.rejected` |
| `room:<roomId>` | Client sends `channel.join { channel }` with an acknowledgement; the server authorizes seat holders only, from the socket's account | `room.updated { room }` (each subscriber receives their own viewer-specific snapshot), `room.presence { roomId, userId, online }`, `channel.closed` (access lost, e.g. after leaving) |

Commands: `channel.join` and `channel.leave`, acknowledged with `{ ok: true }` or `{ ok: false, error: { code, message } }`. User ids, room ids and channels supplied by clients are never trusted on their own. A join returns `forbidden` unless the socket's own account holds a seat. Socket.IO room names are server-internal.

**Delivery and recovery.** Events are emitted only after the database transaction commits. Socket.IO delivery is at-most-once, so recovery is part of the contract:

- After every successful room-channel join, including each automatic rejoin after a reconnect, the server sends a fresh `room.updated` snapshot. This is the synchronization boundary.
- After a reconnect the frontend refetches notifications and invitations.
- Without a connection, the waiting room polls over HTTP every 5 seconds.
- Room snapshots from HTTP and realtime pass one reconciliation rule: a lower revision never replaces a higher one, so stale HTTP responses cannot roll a room back.
- Presence is not persisted room state. `room.presence` patches seats without changing the revision.

**Presence.** An account is online while it has at least one authenticated socket in any tab or on any device. Closing one tab does not mark it offline. Presence is in-memory for the single-instance deployment; Redis or another shared store is deliberately not introduced. Presence is never exposed to someone who merely sends an invitation; seat holders see each other's online state in the room.

## Delivery policy

When an invitation is created, its notification and, for offline recipients, its email job are written in the same transaction as the invitation.

| Recipient state at commit | Saved | Delivered |
| --- | --- | --- |
| At least one authenticated socket | Invitation + notification | `notification.created` and `invitation.updated` on the user channel; the frontend shows a toast and updates the inbox and badge |
| No socket | Invitation + notification + `EmailJob` (`dedupeKey invitation-email:<invitationId>`) | Email through the outbox worker; the inbox shows the notification on next sign-in |

- **Rechecks before sending.** Immediately before sending, the worker rechecks the invitation and skips the job, recording the reason, if it is no longer pending (`invitation_cancelled`, `invitation_expired`, …), if the room is closed (`room_closed`) or full (`room_full`), if the recipient has come online (`recipient_online`, since they will see it in-app), or if they have already read the notification (`notification_read`). The email goes to the recipient's current account address.
- **Disconnecting during delivery.** A recipient who appears online at commit but disconnects before the event arrives gets no email. The saved notification is recovered from the inbox on reconnect or reload. This is the defined treatment of that race.
- **Duplicates.** Notifications and jobs are deduplicated by unique keys. Clients deduplicate inbox entries and toasts by the stable notification id, so a repeated delivery never adds a second entry or toast.
- **Already in a match.** A toast never navigates. It offers a link, so a player on the arena route is not interrupted.
- **Reading never answers.** Marking a notification read never accepts or declines its invitation. Accepting requires the landing page, signed in as the invited account.

**Email outbox.** The provider call is never made inside a domain transaction. The worker claims due jobs with `UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED)`, recording a per-claim lease token and incrementing attempts. Concurrent workers take disjoint jobs, and a completion only applies with the matching token. A crashed worker's lease expires after `MAIL_LEASE_SECONDS` and the job becomes claimable again, until attempts are exhausted. Transient failures (connection errors, SMTP 4xx) retry with exponential backoff from `MAIL_RETRY_BASE_SECONDS`, capped at one hour with jitter, up to `MAIL_MAX_ATTEMPTS`. SMTP 5xx and recipient rejections fail permanently. Errors are stored without message bodies.

A job is marked `SENT` only when the SMTP provider accepts the recipient, and the provider's message id and response line are stored. Provider acceptance is not proof of inbox delivery. Bounce and complaint processing is not implemented.

The mail module is domain-free. Features register a handler per job kind that rechecks validity and renders the message. The invitation email (`renderInvitationEmail`) has text and HTML parts with escaped user content, a link to `<APP_PUBLIC_URL>/rooms/join/<invitationId>`, the host's username, the time control and the expiry.

## Security and privacy decisions

- Invitations bind to the recipient's **account id**, resolved on the backend. The link only identifies an invitation. Anyone other than the sender or recipient gets 403 `invitation_wrong_account` with no details, and only the recipient can accept or decline.
- The sender sees the recipient's username, never their email, whether they invited by username or email. Payload-level tests assert this.
- The invitation endpoint authorizes the room first, so only a room's host can look up accounts. `account_not_found` necessarily reveals whether a username or email is registered. That endpoint is throttled to 20 per minute per IP, and room creation to 20 per minute.
- **Email ownership is still not verified**, as recorded in the authentication milestone. An invitation addressed by email goes to the account that registered that address. The sender sees the resolved username after inviting, so a mismatch is visible. Verifying email ownership is follow-up work before email addresses can be treated as proven identities. Invitations to unregistered emails are outside this milestone.
- Host-only and challenger-only actions are enforced on the server. The UI renders the `viewer` permissions it receives.

## Frontend integration

The three layers are unchanged:

| Layer | New code |
| --- | --- |
| Transport | `features/rooms/services`, `features/invitations/services` and `features/notifications/services` (Axios); `lib/realtime/socket-realtime-client.ts` (generic Socket.IO adapter; no feature imports) |
| Cache and coordination | `queries/` and `hooks/` in each of those features; `realtime/` reconcilers (`reconcileRoom`, `reconcileInvitation`, `insertNotification`, `markRead`, `patchInvitation`) |
| Presentation | `features/*/components`, `screens/rooms/*`, `screens/invitations/*`, `providers/session-realtime-bridge.tsx` |

ESLint boundary rules now cover the `rooms`, `invitations` and `notifications` features: no sibling-feature, screen or mock imports. Components never attach socket listeners or call Axios directly. `RealtimeProvider` owns one connection per signed-in account. It reconnects only when the account changes, and disconnects on logout or session end, so React StrictMode and route changes do not create duplicate connections or listeners. `SessionRealtimeBridge` mounts the personal-channel reconcilers once.

| Route | Screen |
| --- | --- |
| `/rooms/new?invite=<username or email>` | Room setup (draft until "Create room"). `invite` only prefills the field. |
| `/rooms/[roomId]` | Waiting room: seats with online state, ready check, host-editable settings (read-only for the challenger), invitation form and list (host), cancel (host) and leave (challenger) |
| `/rooms/join/[invitationId]` | Invitation landing: pending (accept/decline), accepted (open room), declined, cancelled, expired, room full, room closed, wrong account (switch account), not found |

"Play with Friends" opens a username/email dialog that continues to room setup, and the social sidebar's invite action prefills the friend's username. The notification popover in the lobby and room headers shows the unread badge, keyset pages ("Load older"), mark-read and mark-all-read, and links to the invitation or room. Toasts deduplicate by notification id and link without navigating.

Invitation links survive authentication. Protected routes redirect to `/sign-in?next=<path>`, `/rooms/join/*` and `/rooms/*` are allowed `next` destinations, and the sign-in and sign-up switch links now carry `next`. "Switch account" on the wrong-account screen signs out and returns to sign-in with the invitation as the destination.

Demo mode (`NEXT_PUBLIC_API_MOCKING=enabled`) returns an empty notification inbox. Room and invitation flows require the real API.

## Configuration

New backend variables, validated at startup (see [`.env.example`](../backend/.env.example)):

| Variable | Default | Meaning |
| --- | --- | --- |
| `APP_PUBLIC_URL` | First `CORS_ORIGINS` entry | Base URL for emailed links; HTTPS required in production |
| `ROOM_TTL_MINUTES` | 120 | Absolute room lifetime (5–1440) |
| `INVITATION_TTL_MINUTES` | 30 | Invitation lifetime, capped by the room's (1–1440) |
| `MAX_ACTIVE_ROOMS_PER_USER` | 5 | Open rooms a host may hold |
| `EXPIRY_SWEEP_INTERVAL_SECONDS` | 30 | Background expiry sweep; 0 disables it |
| `REALTIME_SESSION_CHECK_SECONDS` | 60 | Revoked/expired-session socket check |
| `REALTIME_MAX_SOCKETS_PER_USER` | 10 | Connection cap per account |
| `MAIL_TRANSPORT` | `disabled` | `disabled` (jobs stay `PENDING`) or `smtp` |
| `MAIL_FROM`, `SMTP_HOST` | — | Required for `smtp` |
| `SMTP_PORT` / `SMTP_SECURE` / `SMTP_REQUIRE_TLS` | 587 / false / true | Implicit TLS or STARTTLS; TLS cannot be disabled in production |
| `SMTP_USER` / `SMTP_PASSWORD` | — | Set together, or neither |
| `MAIL_WORKER_INTERVAL_SECONDS` | 10 | 0 disables the in-process worker |
| `MAIL_MAX_ATTEMPTS` / `MAIL_RETRY_BASE_SECONDS` / `MAIL_LEASE_SECONDS` | 5 / 30 / 120 | Retry limit, backoff base, claim lease |

Frontend: optional `NEXT_PUBLIC_REALTIME_URL` if Socket.IO is served from a different origin than the API. A same-origin reverse proxy must forward `/api/socket.io` with WebSocket upgrade.

New packages, pinned to the installed NestJS 12.2.0 line or to releases at least two weeks old: `@nestjs/websockets` 12.2.0, `@nestjs/platform-socket.io` 12.2.0, `socket.io` 4.8.4, `nodemailer` 10.0.15, `@types/nodemailer` 8.0.2 (dev), `socket.io-client` 4.8.4 (backend dev for tests; frontend runtime).

## Verification

Run against the isolated PostgreSQL 18 test cluster on loopback (port 55432) used by the authentication milestone; the pre-existing local PostgreSQL service was not touched. The cluster was started for this work and stopped afterwards. Results:

- **Baseline before changes:** backend typecheck, lint, 20 unit tests and 16 HTTP/PostgreSQL tests passed; frontend typecheck, lint and 37 tests passed.
- **Migration:** `prisma migrate deploy` applied `202610220002_…`; `prisma migrate diff` of the database against the schema is empty.
- **Backend:** typecheck and lint clean; **34 unit tests** (schemas, views, presence, email escaping, configuration); **29 integration tests** with real HTTP, real Socket.IO clients and PostgreSQL (16 existing auth + 13 new), with no Node/pg deprecation warnings. A mutation check removed the accept-path row locks from the compiled code: the concurrency tests then failed (three concurrent accepts all "succeeded"; a double accept bumped the revision twice). The locks were restored.
- **Frontend:** typecheck, lint (including the new feature boundaries) and production build clean; **52 tests** (15 new: room/invitation/notification reconciliation, stale-revision rejection, notification dedupe, invite field validation, and the Socket.IO adapter's join-once, rejoin-after-reconnect, leave-on-last-unsubscribe, token renewal and stop-after-sign-out behavior).
- **Browser (Playwright 1.62 + headless Chromium):** run against the real API at `localhost:3001` and the `next dev` server already running at `localhost:3000`, with separate browser contexts per account. **24 checks passed with no page errors**:
  - Play with Friends → username → room setup (3+2, host White) → room created and invitation sent; the host page never contains the recipient's email.
  - Online recipient: realtime toast and unread badge, no email job. Mark-as-read clears the badge and leaves the invitation pending. Reload restores the inbox.
  - Accept from the landing page; the host's waiting room shows the challenger (online) live, with an accepted toast.
  - Both ready → status "Both ready" with Start match disabled (Coming Soon). The host switches to 5+0 → both readiness flags reset, the challenger sees the new settings and a reset notice, and the database confirms `WAITING` with both flags false.
  - Two recipient tabs: closing one keeps them online; closing the last shows them offline to the host.
  - Offline recipient invited by email (typed in upper case): one durable job, sent through the SMTP adapter to a local SMTP sink (`250 2.0.0 Ok: queued as …`, attempts 1). The message links to `/rooms/join/<id>` and contains no host email; the host sees only the username.
  - The signed-out email link redirects to `/sign-in?next=/rooms/join/<id>`, and the register link keeps `next`.
  - A different signed-in account sees "This invitation is for another account", with no details and no actions. "Switch account" → sign in as the recipient → back on the invitation (390 px mobile, no horizontal overflow).
  - Decline → the host gets a toast and the list updates live. Host cancels → the open landing page switches to "cancelled" live. A database-expired invitation shows "expired" and the expiry is persisted on read.
  - Two accounts click Accept at the same moment: exactly one holds the seat (confirmed in the database), and the other sees "Room full" with no accept action.
  - Host cancels the room → the challenger's waiting room becomes read-only live.
  - Challenger goes offline (network emulation) → "Reconnecting…". Meanwhile the host changes settings and sends a new invitation. Back online, the challenger shows the new settings without reload and the missed invitation is in the inbox.
  - A recipient on the arena route gets the toast and stays on the page. Lobby → room setup → lobby keeps one socket, and sign-out closes it.
  - Desktop 1440 px and mobile 390 px screenshots were reviewed.
- **SMTP adapter, called directly against the sink:** accepted messages return the provider response; a `550` recipient rejection is permanent; a refused connection is retryable; `SMTP_REQUIRE_TLS=true` refuses a relay without STARTTLS.
- **Dependency audit:** production audit reports 0 vulnerabilities for backend and frontend.

Not run: delivery through a real email provider (no credentials), production HTTPS/WSS, multiple API instances, and browsers other than Chromium.

Run the integration suites against a database that no other API instance is using. A running development API's mail worker shares the outbox and can legitimately claim the test's jobs; this was observed and is why the suite needs exclusive use.

## Remaining work and limits

- **Real email delivery is unverified.** No provider credentials were available. The SMTP adapter and outbox were verified against a local protocol-level SMTP sink; actual inbox delivery, SPF/DKIM/DMARC and bounce handling need a configured provider.
- Game creation, rules, moves and clocks are delivered by the [gameplay milestone](Gameplay_Milestone.md). There is still no active-game constraint on accepting an invitation while playing another game.
- Presence, the email worker, the expiry sweep and rate limiting are in-process, matching the single-instance deployment. Multiple API instances would need a Socket.IO adapter (e.g. Redis), shared presence and rate limiting. The outbox claim already works across instances.
- Email ownership verification and invitations to unregistered emails remain future scope.
- Notification retention and cleanup of old outbox rows are not scheduled. Example maintenance: `DELETE FROM "EmailJob" WHERE "completedAt" < now() - interval '30 days';`.
- Production HTTPS/WSS deployment and proxy WebSocket upgrade have not been exercised.
