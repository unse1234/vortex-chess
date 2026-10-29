# Vortix Chess — Consolidated Product and Implementation Plan

> **Historical planning document.** Preserved for dated decisions and original verification reports. Current scope, setup and contracts are superseded by the [feature catalog](feature-catalog.md), [current documentation index](../README.md), [deployment guide](deployment.md), [API notes](api.md) and [current testing evidence](testing.md). Old future-work statements, UCI-process proposals and test/performance counts are not proof of current functionality.


> **Friends/social milestone (29 October 2026):** Username discovery, durable friend requests, paginated friendships, friends-only presence, casual challenges through existing invitations, and directional blocks across social interactions and random matchmaking are implemented. API mode enables /friends and private block settings. This supersedes earlier Friends exclusions only; Google login, public rooms, chat and other deferred features remain disabled. See [policy, module ownership, migration, deployment support and verification](Friends_Social_Management.md).

> **Rated matchmaking milestone (28 October 2026):** Rated random human games, independent Bullet/Blitz/Rapid `elo-v1` profiles, atomic settlement and paginated competition-rank leaderboards are implemented. This supersedes earlier ratings/leaderboard exclusions below. Password recovery is also implemented; Google authentication, tournaments, XP, seasons and other deferred features remain disabled. See [policy, architecture, deployment and verification](Rated_Matchmaking_Elo_Leaderboards.md).

> **Random matchmaking milestone (28 October 2026):** Casual, unrated random human matching is implemented end to end with exact time-control compatibility, durable account-scoped searches, bounded automatic readiness, shared game admission, authenticated personal events, refresh/restart recovery and the existing PvP arena. This supersedes earlier Coming Soon/no-route exclusions of random matchmaking only. Ratings, rankings, engine fallback, public browsing and other deferred features remain unavailable. See [behavior, API contracts, migrations, verification and limits](Random_Matchmaking_Milestone.md).


> **Engine gameplay milestone (26 October 2026):** Player-versus-engine games are implemented against the teammate's deployed engine service. **Topology update: NestJS calls a FastAPI service over HTTP/JSON, which speaks UCI to the engine internally; this supersedes §17's instruction to spawn a UCI executable from NestJS.** The browser never calls the engine service. Engine turns are server-owned: clock-aware movetime, chess.js validation and the same atomic move/clock/result pipeline as player moves, one search per game identified by game and revision, stale replies discarded, bounded concurrency and retries, restart recovery, and an explicit engine-failure abort outcome (no winner, no draw). See [contracts, configuration, failure policy and measured latency](Engine_Gameplay_Milestone.md). Evaluation, hints, accuracy and automated review remain unavailable.

> **History/replay/manual-analysis scope update (26 October 2026):** Participant-only backend-paginated history, original replay and temporary manual variations for finished games are implemented. This explicitly supersedes earlier exclusions of all branching and dedicated analysis routes. Active-game review remains read-only. Engine play, evaluation, hints, accuracy and automated review remain unavailable. See [contracts, state ownership and verification](History_Replay_Analysis_Milestone.md).

> **Foundation/auth milestone (22 October 2026):** NestJS + PostgreSQL/Prisma email/password authentication and frontend API integration are implemented. See [endpoint contracts, setup, decisions and verification status](Backend_Authentication_Milestone.md). API mode is now the frontend default; MSW demo mode requires explicit opt-in. Rooms, invitations, games, Socket.IO, UCI and evaluation remain later backend milestones.

> **Rooms/invitations milestone (22 October 2026):** Private rooms with revisioned settings and readiness, username/email invitations bound to account ids, durable notifications, authenticated Socket.IO presence/realtime and an outbox-driven offline invitation email are implemented and connected to new room setup, waiting-room and invitation-landing screens. See the [contracts, delivery policy and verification](Rooms_Invitations_Notifications_Milestone.md). Game creation from a ready room, rules, moves, clocks and the UCI engine are next; real email delivery awaits provider credentials.

> **Gameplay milestone (26 October 2026):** A ready room starts exactly one server-authoritative game. Moves, draw offers, resignation and official clocks run through one serialized pipeline (chess.js validation, single-statement revision-guarded PostgreSQL commits, command deduplication, broadcast only after commit), with automatic threefold/fifty-move/insufficient-material draws, timeout adjudication, restart recovery from the full move history and a connected game screen. See the [contracts, adjudication and clock policy, recovery and measured performance](Gameplay_Milestone.md). History/replay and temporary manual analysis are delivered by the follow-up milestone above. UCI engine play and evaluation remain deferred.


> **Current V1 scope and authentication override (22 October 2026):** Sign in uses **email + password only**. Sign up requires **username, email, password and password confirmation**; usernames remain required for invitations. Existing third-party authentication and password recovery are **Coming Soon** and inactive. This decision overrides older authentication/provider proposals and the broad design inventory below.

V1 includes session handling/sign out, private player invitations by username or email, accept/decline and invitation notifications/toasts, teammate-engine gameplay, supported room/time/color settings, board/clocks/moves/promotion/draw/resign/results, independent earlier-move review with Back to Live, history and completed-game replay. Password visibility, board orientation and navigation remain supporting controls. Preserve existing service/mock-backed screens; scope availability does not imply that every V1 flow is already implemented.

Everything else is **Coming Soon**: tournaments/leaderboards, ratings/ranks, XP/rewards/seasons, 2v2/public rooms/variants, voice/general chat, advanced friend management, engine evaluation/hints/accuracy/statistics, and existing deferred profile/settings/preferences. Engine move generation remains V1; engine evaluation does not. Do not add UI or routes just to advertise deferred features.

The frontend's typed scope map is `frontend/src/config/capabilities.ts` (`features`). Shared Coming Soon presentation lives in `components/display/`; route availability and existing deferred destinations live in `config/routes.ts`. Deferred controls use native disabled elements without handlers or hrefs. Deferred panels mount static unavailable presentations, avoiding queries and subscriptions. Existing deferred routes render the same unavailable screen on direct access. Keep the implemented room/history destinations accessible.

The three layers remain unchanged: Axios/services and realtime adapters handle transport, TanStack Query/hooks coordinate data, and screens/components render presentation. Domain services/types/utilities stay outside generic `lib/`. Mock authentication remains explicit MSW demo behavior (demo sign in: `haseeb@vortex.io`, any password with at least eight characters); API mode never silently falls back to it.


Updated: 22 October 2026

This is the consolidated plan for the frontend, backend, engine integration and final evaluation phase. It supersedes the earlier broad initial-scope proposal in this document. It incorporates the user's later decisions about invitations, clocks, fast synchronization, live move review, saved history, necessary libraries and confirmed UCI engine communication.

The launcher is reported complete by the user. Its implementation has not been inspected here. Continue from the existing project rather than rebuilding that page. Other items below are planned work, not claims of implementation.

## 1. Product goal and confirmed scope

Build a chess application from the supplied Stitch screenshots and background assets, using Next.js + TypeScript + Tailwind for the frontend and NestJS for the backend. Integrate the teammate's chess engine through a backend-managed UCI process.

The user has chosen screenshots/assets as the implementation reference. Stitch MCP is not a dependency of the workflow. Use the product name Vortix Chess; the source design sometimes spells it Vortex Chess.

| Capability | Delivery |
| --- | --- |
| Sign up and sign in | V1 |
| Sign out and session lifecycle needed for authenticated play | Supporting V1 behavior |
| Player vs player, by invitation to friends | V1 |
| Player vs the teammate's engine | V1 |
| Invite a registered player by unique username or email | V1 |
| Online invitation toast and notification panel | V1 |
| Offline invitation email and saved notification | V1 |
| Server-authoritative clocks, including supported increments | V1 |
| Fast realtime moves and game-state synchronization | V1 |
| Live move list | V1 |
| Browse earlier moves during a live game without altering it | V1 |
| Durable accepted-move records and completed-game history | V1 |
| Completed-game replay and PGN presentation | V1 |
| Temporary manual post-game variations | V1, local and unsaved |
| Engine evaluation and automated analysis | Final phase after core V1 works |
| Other design features | Coming Soon; inactive controls |

Player vs engine requires the engine to choose moves in V1. Evaluation means optional analysis such as numerical score, depth, best-line suggestions and accuracy; that is a separate final phase.

Initial friend matches are proposed as casual/unrated. Rating/Elo progression is not silently included just because the screenshot contains sample ratings.

## 2. Coming Soon behavior

The visual layout can retain unsupported features, with an explicit Coming Soon badge and disabled behavior. Disabled controls must not respond to pointer or keyboard activation or navigate to unimplemented routes.

Examples: tournaments, leaderboards, 2v2, public room browsing, voice/spatial audio, general chat, advanced social/friend management, fog of war, blindfold variants, third-party OAuth and advanced telemetry.

Evaluation panels can retain their visual space with a Coming Soon/unavailable state until the final phase. Fixed Stockfish versions, fabricated latency/accuracy values, kernel anti-cheat claims, XP progression and rankings must not be presented as working features. Existing mock/demo values remain explicitly demo data.

Support for inviting a friend does not require a persistent friend-request/friendship system. V1 can challenge a registered user directly by username or email.

Do not create every deferred module or route in advance. The full design inventory explains possible future work; it does not expand confirmed V1 scope.

## 3. Screen inventory and functional scope

Five main desktop views were inspected in the reference: launcher, sign in, sign up, room setup and play room. History and invitation acceptance extend those flows using the same design language.

| Screen | V1 behavior |
| --- | --- |
| Launcher | Account summary, Play with Friends, Play vs Engine, Create Room, recent games, history link and notifications; deferred entries disabled |
| Sign in | Email and password only, field feedback, visibility toggle, pending/error/success, session restoration |
| Sign up | Unique username, email, password and confirmation, validation, existing-account navigation |
| Room creation | Opponent mode, supported time preset, color preference, create action |
| Existing room | Host/challenger seats, username/email invitation, waiting/readiness, settings before start, start/cancel |
| Invitation acceptance | Resolve invite, preserve destination through auth, accept/decline, expired/cancelled/full/error states |
| Play room | Board, players, clocks, moves, captures, turn/thinking state, flip, draw/resign, result, reconnect and review controls |
| Game history | Current user's completed/aborted game records with pagination and replay links |
| Completed game | Read-only board, full move list, replay controls, result and PGN |

The sign-in design has a recovery link and OAuth buttons, but full password recovery and OAuth were not added to confirmed scope. Keep those entries unavailable until explicitly implemented. Email ownership/verification must be resolved when implementing authentication and email invitations.

Required dialogs/panels include invite recipient selection, promotion, resign confirmation, draw offer/response, game result and notification panel. They do not each need a route.

## 4. Main user journeys

### 4.1 Authentication

1. User signs up with a unique username, email and password.
2. Backend validates identity/input, stores a password hash and establishes the chosen authenticated session.
3. Sign in accepts email and password only.
4. The frontend restores current-session state and opens one authenticated realtime connection per active app tab.
5. Sign out clears user-sensitive cached data and ends that tab's authenticated realtime session.

Recommended identity policy: a normalized, case-insensitively unique username distinct from a non-unique display name. Define email normalization/ownership rules in the backend. Do not trust a client-supplied user ID as the authenticated actor.

The precise session mechanism is a backend implementation decision. Reusing the established dashboard authentication approach is an option; it is not an excuse to copy unreviewed token logic or assume the frontend and API share an origin.

### 4.2 Play with a friend

1. Host creates a private invitation-based room and selects time control/color.
2. Backend creates the room and returns its ID.
3. Host enters the recipient's username or email.
4. Backend resolves a registered recipient to user ID and creates the invitation.
5. Recipient receives the appropriate delivery, then accepts or declines.
6. Acceptance atomically validates the invitation and claims the challenger seat.
7. Both participants see the current room settings and readiness.
8. An authorized start action creates exactly one game, assigns colors, sets the official start time and notifies both players.
9. Both open the same game ID; the backend controls the active game.

Settings are editable only while permitted by the room state. Changing material settings should invalidate previous ready confirmations. The accepted game stores its own immutable starting settings.

### 4.3 Play against the engine

1. User selects Play vs Engine.
2. The room/setup view presents the supported time/color settings.
3. Backend creates a game with a human participant and an engine participant.
4. Human moves use the same validation, persistence and clock pipeline as PvP.
5. When the engine owns the turn, the backend's UCI adapter requests a move from the teammate engine using the accepted position history and official clock limits.
6. Engine output is checked against the current game revision and legal rules, then applied through the same game-command pipeline.
7. The frontend receives the accepted move and clocks over realtime events.

Only expose difficulty/settings actually supported by the engine. Do not assume sample Bot Lv.MAX or ELO values are meaningful.

### 4.4 Game completion and history

A game can finish by a supported rules result, resignation, accepted draw or timeout; interrupted/aborted games also need a defined record.

The backend finalizes the result, reason, participants, end timestamp and game summary. It can produce final PGN from the durable move record. The game appears in each human participant's history, and opening it provides read-only replay.

## 5. Invitations and notification delivery

### 5.1 Confirmed registered-user behavior

Both username and email identify registered recipients. Username invites use the recipient's account email for offline delivery without exposing that email to the sender.

| Recipient state | Action |
| --- | --- |
| Registered and online in the app | Save invitation and notification; push toast/notification event |
| Registered and offline | Save invitation and notification; schedule invitation email |
| Already playing another game | Show notification/toast without navigating away; acceptance respects active-game constraints |
| Invitation no longer valid | Show expired, cancelled, declined, already accepted or room-unavailable state |

Online means at least one authenticated app socket is connected, not necessarily that the person is currently on the chessboard. Track presence across tabs/devices. Account existence and presence are separate checks.

Notifications are durable inbox records; a toast is only their immediate presentation. Marking a notification read does not accept the invitation. On reconnect, reload pending/unread notifications so a missed socket event does not lose the invitation.

### 5.2 Invitation lifecycle

States: pending, accepted, declined, cancelled, expired.

Persist sender, target account or target email, room ID, expiration, relevant timestamps and a secure link-token reference where a link is used. Check sender permission, target identity, room availability and expiry in the backend at acceptance time.

Accept/decline/cancel must be idempotent or return a clear current outcome. Two accept attempts must not create two games or occupy the same seat twice. A reused/forwarded link is not permission to enter as the intended recipient.

Email sending is asynchronous and retryable with a delivery record/job. A successful database transaction should not be undone because SMTP temporarily fails. Use an idempotency key to avoid duplicate invitation emails. The online/offline delivery policy needs a defined treatment for a user disconnecting during notification delivery; a notification remains available regardless.

### 5.3 Unregistered email — proposed extension

The user explicitly confirmed registered-user invitations. The earlier suggested flow for an unknown email remains a proposal: send an invitation email, sign up/sign in with the intended identity, then accept and join.

If this extension is selected, preserve the invitation through auth and establish email ownership before binding it to an account. Otherwise, V1 returns a useful account-not-found response. Do not silently implement an open invitation link that grants any account the target seat.

## 6. Frontend architecture: three data layers

This is a confirmed convention, matching the dashboard approach.

| Layer | Owns | Location |
| --- | --- | --- |
| Data fetching/transport | Axios HTTP requests and feature-owned realtime command adapters; typed responses and normalized errors | Feature services |
| Data caching/coordination | TanStack Query keys/options/hooks, mutations, invalidation and realtime cache reconciliation | Feature hooks and queries |
| Presentation | Screens, components, form interaction, navigation and local view state | Screens and components |

HTTP flow: presentation -> query/mutation hook -> Axios service -> API -> cache -> presentation.

Realtime flow: Socket.IO adapter -> feature session hook/reconciler -> the relevant Query cache entry -> presentation. Move commands travel through the corresponding feature command adapter.

React Query is a cache/coordination layer, not the network transport. Axios handles HTTP; Socket.IO handles persistent realtime messages.

Rules:
- Components do not call Axios or attach raw socket listeners.
- Services do not use React hooks or return raw Axios response objects to presentation.
- Current server data has one frontend owner. Do not mirror a live game into Query, Context, Zustand and component state.
- Local view state includes selected historical ply, board orientation, selected square, dialog visibility and tabs.
- Backend owns legal moves, game progression, official clocks/results, invitation validity and dataset filtering/sorting.
- Frontend can validate form shape, format dates, interpolate displayed clocks and render backend-provided move destinations.
- Use one stable browser QueryClient; any future server-prefetch client is request-scoped.
- Stale HTTP refetch responses must not overwrite a newer realtime revision.
- Socket-driven moves update the cache directly instead of invalidating/refetching the entire game for each move.

## 7. Frontend folder structure and dependency boundaries

Use a single Next.js app with feature-based modules. Adapt the existing launcher rather than rewriting working code just to rename folders.

    frontend/
      public/
        branding/
        artwork/
        chess/pieces/
        sounds/
      docs/
        frontend-plan.md
        frontend-contracts.md
        decisions.md
      src/
        app/
          layout.tsx
          page.tsx
          globals.css
          loading.tsx
          error.tsx
          not-found.tsx
          (auth)/
            layout.tsx
            sign-in/page.tsx
            sign-up/page.tsx
          (platform)/
            layout.tsx
            play/page.tsx
            rooms/
              new/page.tsx
              [roomId]/page.tsx
            games/page.tsx
          (invites)/
            layout.tsx
            rooms/join/[inviteCode]/page.tsx
          (arena)/
            layout.tsx
            games/[gameId]/
              page.tsx
              loading.tsx
              error.tsx
        screens/
          shells/
          auth/
          lobby/
          rooms/
          invitations/
          games/
        features/
          auth/
          lobby/
          rooms/
          invitations/
          notifications/
          games/
        components/
          ui/
          layout/
          feedback/
          display/
        providers/
          app-providers.tsx
          query-provider.tsx
          mock-provider.tsx
          session-realtime-provider.tsx
        lib/
          http/
          query/
          realtime/
        config/
          app.ts
          env.ts
          routes.ts
          navigation.ts
          capabilities.ts
        styles/
          tokens.css
          board.css
        hooks/
        types/
        utils/
        mocks/
          browser.ts
          fixtures/
          handlers/
          realtime/
          scenarios/
      tests/e2e/
      .husky/
      .env.example

The invitation landing route has its own lightweight shell so its destination can be preserved before authentication. Accepting still requires the correct authenticated identity. These are nested shells under one root layout.

Within each feature create only subfolders containing real code: components, hooks, services, queries, types, schemas and, where applicable, realtime/providers/constants. Do not scaffold deferred analysis or social modules merely for disabled menu entries. Matchmaking is implemented by the 28 October milestone.

| Boundary | Rule |
| --- | --- |
| app | Route conventions, metadata, params and layout composition; thin page files |
| screens | Compose complete views and coordinate independent features |
| features | Own domain UI/behavior/contracts and depend on shared foundations |
| components | Shared presentational primitives; no game or auth data fetching |
| providers | App lifecycle and dependency composition |
| lib | Generic transport/cache mechanics; no imports from feature modules |
| types | Only genuinely shared contracts, such as user summary/time control |
| utils | Pure presentation helpers; no backend business rules |

Screens may combine games, invitations and notifications. A feature must not reach into a sibling feature's private implementation. Enforce dependency directions with lint restrictions. Use direct imports and avoid broad barrels/circular dependencies. Avoid a giant global services or types file.

Server Components handle route/static composition where appropriate. Forms, board, timers, notification interactions and Query/socket providers are focused Client Components. Keep session connection ownership beneath the shared root providers so shell changes do not create duplicate connections.

## 8. Games feature structure and board boundary

    features/games/
      components/
        board/
          game-board.tsx
          chessboard-adapter.tsx
          promotion-dialog.tsx
        players/
          player-card.tsx
          captured-pieces.tsx
        clocks/game-clock.tsx
        moves/
          move-list.tsx
          replay-controls.tsx
          reviewing-indicator.tsx
        controls/game-controls.tsx
        dialogs/
          resign-dialog.tsx
          draw-dialog.tsx
          game-result-dialog.tsx
        game-history-list.tsx
        recent-game-list.tsx
      hooks/
        use-game-query.ts
        use-game-commands.ts
        use-game-session.ts
        use-game-clock.ts
        use-game-review.ts
        use-game-history-query.ts
      services/
        game.service.ts
        game-realtime.service.ts
      queries/
        game.keys.ts
        game.options.ts
      types/
        game.types.ts
        game-api.types.ts
        game-command.types.ts
      realtime/
        game-events.types.ts
        reconcile-game-state.ts
      providers/game-session-provider.tsx

Only the chessboard adapter imports react-chessboard. It receives a displayed position, orientation, highlights, interaction permission and move-request callback. Screen code is independent of library-specific options.

The accepted current position always comes from the backend. Immediate drag/selection/pending feedback is local presentation. A pending visual does not commit an authoritative move. Moving is disabled during historical review, resynchronization, opponent turns or a pending command.

## 9. Backend responsibilities and module structure

NestJS owns business logic, persistence, authenticated realtime gateways and the engine bridge. Next.js server rendering does not move chess authority into the frontend project.

Recommended database direction: PostgreSQL with Prisma, subject to the backend setup decision and versions already used in the actual project. No database has been provisioned or schema applied by this plan.

    backend/src/
      main.ts
      app.module.ts
      modules/
        auth/
        users/
        rooms/
        invitations/
        notifications/
        games/
          dto/
          services/
          rules/
          clocks/
        engines/
          engines.module.ts
          engines.service.ts
          contracts/
            engine.interface.ts
          uci/
            uci-engine.adapter.ts
            uci-process.ts
            uci-parser.ts
            uci-session.types.ts
        realtime/
          gateways/
          presence/
          contracts/
        mail/
          jobs/
          templates/
      database/
      config/
      common/
        errors/
        guards/
        pipes/

Feature modules own their services and persistence access. Controllers/gateways validate the transport input and invoke the same application services. Game rules and move processing do not get duplicated in HTTP handlers, socket handlers and the engine adapter.

Games owns authoritative state, accepted move commands, clocks and finalization. Engines exports a bounded best-move interface; it does not independently alter game records. Realtime owns transport connections/rooms/presence and forwards authenticated commands. Notifications/mail handle delivery without blocking the move pipeline.

## 10. Standard chess behavior

Use chess.js on the backend for move generation/validation, position progression and notation helpers. The teammate engine chooses its own moves; chess.js is not the AI opponent.

Support standard moves including castling, en passant, promotion and checks. Backend adjudication covers checkmate, stalemate, resignation, agreed draw and timeout, plus an explicitly documented draw policy for repetition/move-count/dead-position cases.

Do not assume a library's generic draw boolean automatically implements every claimable/automatic tournament rule. Define the online game's policy and test the selected rules, including timeout/draw edge cases.

When restoring an active game, replay its initial position and complete accepted move sequence. Reconstructing only from latest FEN would lose history-dependent rule context. FEN is a rendering/position field, not the complete session.

## 11. Authoritative move pipeline and fast sync

Socket.IO with NestJS gateways is the planned realtime direction. Authenticate the connection and authorize game subscriptions. Server-selected user channels deliver invitations/notifications; game channels deliver participant updates.

A move request contains game ID, a unique request ID, expected game revision, source, destination and optional promotion. The backend derives the actor from authentication.

Processing:
1. Accept only an authorized participant's command for a current active game.
2. Process commands for each game sequentially, including move, timeout and game-ending actions.
3. Check expected revision, side to move, official clock and legal move.
4. Compute a candidate next position, notation, clock state and potential result.
5. In a short transaction, append the move and update the game using a revision check. Persist request identity so retries cannot apply the same command twice.
6. Publish the committed state in memory and acknowledge/broadcast its new revision.
7. The frontend reconciles the event into its cache and appends the immutable move entry.
8. Trigger engine work only when the accepted resulting state requires an engine turn.

An unsuccessful save does not produce a successful accepted-move event. Database writes cannot simply be postponed until the end in the name of speed.

Socket.IO delivery is not exactly-once by default. Application request IDs, durable moves, revisions and resynchronization provide the required correctness. A lost acknowledgement means an uncertain outcome; retrieve/reconcile the authoritative state or retry the same idempotent command, never invent a new duplicate move.

### 11.1 Payload and recovery design

Normal updates carry a compact authoritative live state plus the newly accepted move: game/revision/ply, FEN, turn/phase, clocks and any result. Do not transmit the entire accumulated history, account profiles and unrelated panels on every move.

Initial load and reconnect return a complete authorized snapshot and history/missing moves. Revision and ply are different: revision can change for non-move events, while ply counts individual accepted moves.

On reconnect, reauthenticate/rejoin, establish a defined synchronization boundary, and obtain a state at least as new as events already observed. If a gap exists, keep move input disabled until repaired. Older HTTP results, duplicate events and events for a previously open game must not roll the board back.

### 11.2 Performance design

- Establish and keep a persistent connection before active play.
- Keep a warm validated active-game state on the owning server instead of replaying database history on every move.
- Use short local/co-located durable writes; keep email, full-history reads and engine analysis outside the move critical path.
- Update Query cache from the accepted event without an additional GET per move.
- Keep messages compact and isolate board, clock and notification subscriptions.
- Choose backend and database regions using measured latency to intended players.
- Run CPU-heavy engine work outside the main Node event loop with bounded concurrency.

Use separate performance budgets instead of treating all latency as one number:

| Measurement | Agreed target / interpretation |
| --- | --- |
| Server receives a move -> validates -> durable transaction commits -> emits accepted update | Engineering target: p95 below 20 ms under the stated representative workload |
| Player sends a move -> opponent's board displays the accepted update | Network + server processing + browser rendering; aim for the lowest measured result, with approximately 100 ms or less as the initial healthy regional budget |
| Full player-to-player synchronization around 20 ms | A favorable nearby-network goal only, not a universal promise; achievable conditions must be established by measurement |
| Local drag/selection/pending feedback | Respond immediately and render at the next available frame while authoritative acceptance remains separate |

p95 below 20 ms means that 95% of measured server move-processing samples finish in less than 20 ms. The server measurement includes application queueing and the minimal durable save, not just legal-move validation. It is a target for the implementation, not an existing benchmark or proof that every request will meet it.

End-to-end latency is approximately A-to-server network travel + server processing + server-to-B travel + rendering. For illustration, roughly symmetric 40 ms round-trip connections for both players plus 5 ms server processing give about 20 + 5 + 20 = 45 ms before rendering. Faster server code alone cannot make that example a 20 ms end-to-end exchange. Browser frame scheduling and any intentional piece animation must also be measured separately from event delivery.

The earlier 100 ms figure is an initial regional performance budget, not an artificial delay or a reason to stop optimizing below it. Keep backend/database placement, persistent WebSocket transport, compact messages, warm active state, direct Query cache updates and isolated renders as the primary optimization work. Preserve the durable accepted-move transaction while optimizing its cost.

Record p50, p95 and p99 under documented concurrency, server/database placement and client network conditions. Measure the server timeline, client acknowledgement round trip, opponent event receipt and first visible board update separately; do not subtract uncorrected wall-clock timestamps from unrelated devices. Engine thinking time has its own search/clock budget and is excluded from the move-synchronization target.

Begin with a continuously running backend instance capable of persistent connections. If the system later uses multiple instances, shared broadcasting alone is insufficient: assign/coordinate game ownership and retain atomic revision checks. Do not add Redis/Kafka or a distributed topology to V1 without evidence it is required.

## 12. Clocks and time controls

Each side has remaining time. Only the running side consumes it. Supported presets can include 1+0, 3+2, 5+0 and 10+0; finalize the preset list when building room settings. For 3+2, each side starts with three minutes and gains two seconds after each accepted completed move.

Backend:
- Owns official start/turn timestamps, remaining milliseconds, increment and result.
- Checks time at authoritative command receipt, not at an untrusted browser timestamp.
- Serializes timeout and move commands so both cannot win the same state transition.
- Applies increments once for accepted moves.
- Checks timeout/rules even if a scheduled timeout task was delayed.
- Stores timing state with each accepted move and final result.

Frontend:
- Displays a smooth local interpolation anchored to backend time data.
- Corrects drift on authoritative events and resync.
- Never declares a winner from its own interval reaching zero.
- Keeps clock updates isolated from board rendering.

Proposed normal disconnect policy: clocks continue, and the player can reconnect. A network disconnect does not silently pause the match. Document backend-restart/downtime and abort policies during implementation rather than pretending recovery always preserves uninterrupted clocks.

## 13. Move recording, live review and history

### 13.1 Persist accepted moves during play

Save every accepted individual move, not just the final PGN.

A move record includes game ID, ply, actor/color, source/destination/promotion or normalized move string, SAN notation, resulting FEN, timestamp and both clocks at acceptance. Persist the initial position separately on the game.

The move insert and game update occur atomically. At completion, finalize the result, end timestamp and PGN/summary. This supplies recovery and history without a second authoritative move list.

### 13.2 Independent viewing cursor

The backend live game and a user's viewing cursor are separate.

Use a local selected ply, with a distinct live/latest state. A user can view move 12 while the authoritative game continues at move 20. Only that user's displayed board changes.

Controls:
- Starting position.
- Previous individual move.
- Next individual move.
- Click a notation entry.
- Back to Live/latest.
- Flip orientation.

During historical review:
- The board is read-only.
- Official live clocks continue and remain visibly live.
- New accepted moves append to history and update live state.
- The chosen historical position does not jump automatically.
- Show Reviewing move N, new-move count and current-turn indication.
- Back to Live returns to the current accepted position, then permits movement only if it is that user's turn and the session is synchronized.

Historical positions are immutable backend-produced FEN snapshots. They can be read from an already loaded move list or fetched/cache-keyed by game ID and ply. Navigation does not undo, resend or apply a move to the real game.

Active-game review remains read-only. Finished-game temporary manual branches are supported by the scope update above; they never change the recorded game.

### 13.3 Completed-game history

History shows date, mode, opponent/engine identity, assigned side, time control, result and duration/summary where available. Backend paginates and applies business filtering/sorting.

Completed replay uses the same board/move-list components in read-only mode. Every game remains accessible only under its intended participant/access policy; an ID alone does not authorize reading it.

Useful cache identities:
- Live game: game ID.
- Accepted moves: game ID and paging parameters if needed.
- Historical position: game ID and ply.
- History list: current account scope and list parameters.
- Invitations/notifications: authenticated account scope and relevant filters.

These are separate datasets, not competing mutable copies of current live state.

## 14. Database model proposal

| Entity | Purpose and main information |
| --- | --- |
| User | ID, unique normalized username/email, password hash, display/profile and email-ownership state |
| AuthSession | Session/refresh lifecycle if required by the chosen auth design |
| Room | Host, mode, time/color settings, lifecycle, revision and created game reference |
| RoomParticipant | Seats, authenticated participants and readiness |
| Invitation | Sender, target account/email, room, status, expiry and token reference |
| Notification | Recipient, invitation reference, type, created/read timestamps |
| Game | Mode/status, initial/current FEN, revision/latest ply, clocks/time control, start/end, result/reason and final summary/PGN |
| GameParticipant | Color and human/engine identity; engines are not fake registered users |
| GameMove | Ordered immutable accepted move, resulting position, timestamps and clock snapshot |
| DeliveryJob/Outbox | Reliable asynchronous invitation email/delivery bookkeeping |

Constraints include unique usernames, one move per game/ply, command idempotency scoped to game and actor, occupied-seat uniqueness and one created game per started room. Useful indexes serve a user's games ordered by time, game's moves ordered by ply, pending invitations and unread notifications.

Game results and clocks are updated transactionally with moves. Outbox/mail records use their own lifecycle rather than overwriting invitation acceptance state.

This is a logical model, not a migration or generated Prisma schema. Implement against the chosen pinned backend/database versions.

## 15. HTTP and realtime contract outline

These are proposed contract responsibilities, not existing endpoints.

| HTTP area | Responsibilities |
| --- | --- |
| Auth | Sign up, sign in, current session, sign out and any required session renewal |
| Rooms | Create/read/update permitted settings and initiate start/cancel |
| Invitations | Resolve username/email, create/list/inspect/accept/decline/cancel |
| Notifications | Paginated inbox, unread count, mark read |
| Games | Initial authoritative snapshot, accepted moves/positions, own history and completed record |

Game move/draw/resign commands use the realtime path, all invoking the same game application service. Do not create separate rules implementations if HTTP fallbacks are added.

Illustrative realtime events: game subscription/resync, move command/ack, game updated/ended, draw offered/resolved, invitation created/updated, notification created and room updated. Final names/payloads go into docs/frontend-contracts.md before integration.

Authorization, stable error codes and idempotency are part of each contract. The UI consumes permitted actions rather than trusting a role supplied in a query string.

## 16. Routes and feature gating

| Route | Scope |
| --- | --- |
| / | Entry redirect to /play; unauthenticated access reaches sign in |
| /sign-in | Sign in |
| /sign-up | Registration |
| /play | Launcher |
| /rooms/new | Friend-room setup draft |
| /rooms/new?opponent=engine | Engine-mode setup using the same form/screen |
| /rooms/[roomId] | Created-room waiting/readiness/settings |
| /rooms/join/[inviteCode] | Invitation landing; correct auth identity required to accept |
| /games | Current user's history |
| /games/[gameId] | Active game or completed replay based on server state |
| /games/[gameId]/analysis | Finished-game temporary manual analysis; engine assistance remains deferred |

Notifications remain a panel. Draw, resign, promotion, invite picker and result remain dialogs/panels.

The `/matchmaking` route and Find Players/1v1 shortcut now open casual random matching, as delivered by the 28 October milestone. Leaderboards, tournaments, public lobbies and general social/settings destinations remain disabled.

Define capabilities centrally and enforce server permissions as well as UI disabled state. Query parameters only prefill setup; they never grant game access or enable unsupported modes.

## 17. UCI engine integration and final evaluation

> **Superseded transport (26 October 2026):** the teammate's engine is deployed behind a FastAPI HTTP/JSON service that speaks UCI internally. NestJS uses an HTTP adapter and does not spawn or manage a UCI process; §17.2's process lifecycle, per-game processes and output draining do not apply. Ownership, validation, clock and stale-output rules below still hold. See the [engine gameplay milestone](Engine_Gameplay_Milestone.md).

### 17.1 Confirmed communication and ownership

UCI (Universal Chess Interface) is the confirmed backend-to-engine protocol. The teammate supplies a UCI-compatible executable; NestJS launches and communicates with it over stdin/stdout. Browser-to-backend communication remains Axios for HTTP and Socket.IO for realtime events.

The ownership chain is: frontend move intent -> Games application service -> chess.js validation and durable game state -> UCI engine adapter when it is the engine's turn. A returned engine move goes through the same validation, clock, commit and broadcast pipeline as a human move. The UCI adapter never writes game records or directly broadcasts an accepted move.

Define an application-facing interface such as requestBestMove({ initialPosition, movesUci, limits }, { gameId, expectedRevision, signal }). Keep UCI command formatting, process handles and output parsing private to the engines module. The frontend neither runs the engine nor sends raw UCI commands.

### 17.2 Process lifecycle and UCI commands

Use Node.js built-ins node:child_process.spawn and node:readline. Spawn the configured executable asynchronously with explicit arguments and shell disabled; do not use synchronous process APIs in request/move handling. Read stdout as complete lines, including lines split across stream chunks. Drain stderr separately and keep diagnostic output bounded.

| Stage | Backend action | Required response / behavior |
| --- | --- | --- |
| Initialize process | Send `uci` | Read engine identity and advertised options until `uciok`; apply a startup deadline |
| Configure | Send `setoption name ... value ...` only for supported advertised options while idle; then `isready` | Wait for `readyok` before starting work |
| Start a new game | Send `ucinewgame`, then `isready` | Wait for `readyok`; do this at the game boundary, not before every turn |
| Set position | Send `position startpos moves e2e4 e7e5 ...`, or `position fen <initialFen> moves ...` | Reconstruct the position using the initial state and complete accepted coordinate-move history |
| Search | Send `go wtime <ms> btime <ms> winc <ms> binc <ms>` | Read optional `info` output until `bestmove <move>`; use `go movetime <ms>` only if the agreed engine implementation requires a fixed budget |
| Cancel / deadline | Send `stop` | Drain that search's `bestmove` before any next search; a `readyok` alone does not prove a search has ended |
| Shut down | Send `quit` | Allow a bounded graceful exit, then terminate an unresponsive process |

UCI moves use coordinate notation such as e2e4 and e7e8q. The backend converts accepted moves to this format and validates each returned move with chess.js. SAN remains useful for the displayed move list and PGN; it is not the engine command format.

Keep the complete move sequence for repetition-sensitive positions. Sending only the latest FEN does not convey earlier occurrences. If the engine reports no move, check the backend's legal moves and terminal state; never apply a no-move sentinel as a chess move.

### 17.3 Search isolation, timing and failure handling

For V1, keep one long-lived engine process per active human-engine game, subject to a global capacity limit and CPU/memory budgets. Do not spawn a new process on every move. Reserve capacity and complete initialization before starting the game clock; release the process when the game ends. Queue or reject unavailable capacity visibly before starting another engine game.

Each process has exactly one active search. UCI output does not echo application request IDs, so record game ID, expected revision, process generation and a local search token in the adapter. After cancellation, drain the old search before reuse; if it cannot be drained by the deadline, discard that process and initialize a replacement rather than reassigning ambiguous output. Ignore late responses from obsolete processes or completed games.

Apply a returned move only if the same game is still active at the expected revision and engine turn. Recheck the official clock, then validate and commit the move through Games. Stale, malformed or illegal output must not alter the game.

Set a search deadline from the engine's official remaining clock, allowing time for stopping, transport and move commitment. Wait for engine thinking outside database transactions and the per-game command lock. An engine search must not block human moves in other matches. Engine thinking is measured separately from the p95-below-20-ms server move-processing target.

Handle startup timeout, readiness timeout, search timeout, process exit and invalid output explicitly. Persist enough game history to reconstruct a session after a process restart. Do not silently pause clocks, reset remaining time or substitute random moves; expose engine availability and apply the agreed restart/failure policy. Keep executable paths and allowed options in backend configuration.

Use a small UCI test process to exercise protocol lifecycle and failures, then verify the actual teammate binary on the target host. UCI transport is confirmed; executable packaging, supported options and capacity remain implementation choices.

### 17.4 Evaluation remains the final phase

After PvP, engine play, clocks, recovery and replay work:

- Discover the actual engine's supported `info` output, including depth, `score cp`, `score mate` and principal variation where available.
- Define score perspective and units; preserve lower/upper-bound meaning if emitted before presenting a score as exact.
- Run review searches under separate resource limits so evaluation cannot delay live games or mutate their engine sessions.
- Add evaluation UI and best-line replay only for supported outputs.
- Add move-quality/accuracy only with an explicitly defined analysis method.
- Show win probability only if supported by a calibrated method.
- Keep opponent-assisting analysis out of live competitive human games; start with completed-game review or explicitly eligible training.

UCI is a protocol, not an engine or an analysis guarantee. Do not require Stockfish-specific options or a nonstandard `eval` command from the teammate engine. Difficulty controls and screenshot metrics must reflect its actual capabilities.

## 18. Development libraries, frontend design and mocks

### 18.1 Necessary libraries and ownership

Keep the existing Next.js, React, TypeScript, Tailwind and NestJS toolchain. Add the following packages only in the application and phase that need them.

| Library / package | Where it belongs | Work it provides / boundary |
| --- | --- | --- |
| react-chessboard | Next.js Client Component, behind the board adapter | Board rendering, drag/drop, animations, custom pieces and styling; accepted positions still come from the backend |
| chess.js | NestJS games/rules services | Legal-move generation/validation, position progression, FEN/SAN/PGN and ending-rule helpers; the teammate engine provides AI moves, and our application owns clocks/adjudication policy |
| socket.io-client | Frontend realtime transport adapters | Authenticated persistent connection, acknowledgements and reconnect events; UI components do not manage raw sockets |
| @nestjs/websockets + @nestjs/platform-socket.io; socket.io when imported directly | NestJS realtime module | Socket.IO gateways and rooms; application revisions, authorization, durable history and deduplication remain required |
| axios | Feature HTTP services through the shared HTTP client | HTTP request/response boundary for auth, rooms, invitations, notifications and history; explicit DTO types and boundary validation remain our responsibility |
| @tanstack/react-query | Feature queries/hooks and query provider | Server-data cache, query/mutation state and direct accepted-event cache reconciliation |
| react-hook-form + @hookform/resolvers + zod | Feature forms and schemas | Form state, schema integration and input feedback; backend independently validates requests and permissions |
| node:child_process + node:readline | Backend engines/uci adapter | Native asynchronous process management and line-based UCI communication; built into Node.js, no npm installation |
| msw | Development-only mocks | Realistic HTTP responses while the backend is being built; not a production synchronization dependency |

Frontend runtime additions: react-chessboard, axios, @tanstack/react-query, socket.io-client, react-hook-form, @hookform/resolvers and zod. Backend chess/realtime additions: chess.js and the NestJS Socket.IO packages above, with socket.io declared when backend code imports it. UCI requires no extra wrapper package for this plan. MSW belongs in development dependencies.

PostgreSQL/Prisma remains the recommended persistence direction; confirm it before adding its packages. Reuse or select the backend auth, validation and mail implementations during their phases rather than adding competing packages now. This is the scoped feature dependency list, not a replacement for framework-required dependencies.

Keep the confirmed three data layers: transport services -> cache/coordination hooks -> presentation. Socket events reconcile the same canonical live-game cache. Do not add another global store just to duplicate that state. Browser chess.js is not needed for this plan: backend-produced FEN snapshots support board display and historical viewing.

These libraries shorten implementation work; they do not replace our invitation lifecycle, server clocks, durable move pipeline, independent live-review cursor or access checks. Keep the teammate's UCI engine for AI moves; no Stockfish replacement package is required.

### 18.2 Design and mocks

During frontend implementation:
- Use supplied screenshots/background and shared semantic tokens.
- Keep the emerald action color #10B981, amber accent #F59E0B, indigo accent #6366F1 and dark-neutral foundation #141923 as reference inputs.
- Use Space Grotesk/Inter/JetBrains Mono if they remain the selected project fonts.
- Adapt desktop composition for tablet/mobile rather than scaling the whole screenshot.
- Provide keyboard-accessible forms, dialogs, buttons and tap/click board interaction.
- Keep meaningful loading/empty/error/offline states.

Use the same services/hooks with mock responses; components do not import fixture arrays. MSW can handle browser HTTP requests; it cannot intercept a Server Component's requests. Start mock infrastructure before query-driven client UI mounts.

Use a scripted in-process realtime adapter behind the application contract for frontend scenarios. Native WebSocket interception is not automatically a Socket.IO mock.

Fixtures demonstrate a valid move sequence, promotion, rejected move, engine thinking, online invite, offline notification catch-up, draw/resign/result and live review during new arrivals. Full arbitrary local chess play is not promised by a presentation mock.

Use explicit demo/mock mode. Real API failures must not silently turn into successful mock auth/game commands.

## 19. Implementation sequence and completion gates

The launcher is user-reported complete. Preserve it and audit only as needed when connecting these phases.

| Phase | Work | Completion gate |
| --- | --- | --- |
| 1 — Frontend V1 | Remaining auth/setup/invite/notification/game/history UI; Coming Soon flags; mocks through the three layers | Main journeys and empty/error/pending states work responsively with mock data |
| 2 — Backend foundation | Nest modules, database migrations, auth/users/session and contracts | Auth and authorized resource access verified; schema and contracts documented |
| 3 — Rooms/invitations | Username/email resolution, room state, acceptance, notification inbox/presence and offline mail delivery | Two accounts can create/join a room; online/offline/duplicate/expired flows verified |
| 4 — PvP core | Rules, atomic moves, Socket.IO synchronization, clocks, draw/resign/result and persistence | Two real clients complete a valid timed game and recover after disconnect/refresh |
| 5 — Engine play | UCI adapter and native process lifecycle, handshake/readiness, isolated bounded searches, clock limits and validated engine moves | A human-engine game completes through the shared pipeline; stop/restart/stale-output cases are verified against the teammate binary |
| 6 — Integration/replay/history — complete for PvP | Production API/socket paths, live review, completed replay/history and temporary manual post-game variations | Browsing and analysis never mutate saved game state; original moves/results survive reload; temporary branches clear on exit |
| 7 — Quality/performance | Browser/device checks, authorization/concurrency/failure tests and measured latency | Critical flows pass and measured results/remaining limits are documented |
| 8 — Evaluation | Supported analysis UI/backend jobs and review integration | Scores have defined meaning and do not leak into restricted live matches |

Integrate incrementally as backend capabilities become available; phase 6 completes integration rather than delaying all integration until the end. Frontend work can continue while backend contracts are agreed.

## 20. Validation and acceptance

Meaningful verification should establish:
- Two accounts can play only their permitted colors, with legal special moves.
- Concurrent moves/retries/timeouts do not create duplicate plies or conflicting results.
- An acknowledgement is not issued for an uncommitted move.
- Stale HTTP or duplicated realtime events do not roll the board back.
- Reconnect/refresh restores latest state and history without duplicated listeners.
- One user's live-review cursor cannot change either player's authoritative board or clock.
- New moves continue while reviewing, and Back to Live reaches the latest position.
- Both username and email invitations reach the intended account.
- Online invite delivery creates one inbox item and appropriate toast behavior; offline email can retry safely.
- Invitation accept/expiry/cancellation races cannot overfill a room or start duplicate games.
- Completed games can be replayed from their saved moves and current users cannot read unrelated private games.
- UCI startup/readiness, split output lines, bestmove parsing, stop/drain, process exit and restart behave correctly.
- Concurrent engine games cannot consume each other's output; stale/invalid engine moves are rejected without changing game state.
- Engine searches do not block other matches or hold the move transaction/command lock while thinking.
- Feature-disabled controls are inactive for pointer and keyboard.
- Relevant typecheck/lint/build and browser checks pass; tests focus on behavior rather than mirroring markup.

Measure the complete server receive-to-emit path against the p95-below-20-ms target, with database commit included. Report p50/p95/p99 and the tested load/environment. Separately report network/acknowledgement, opponent delivery, first rendered board update and animation completion; a low server time is not proof of 20 ms player-to-player synchronization. Test representative load and realistic network conditions, not only two tabs on localhost.

## 21. Remaining choices to settle during implementation

These are proposals or unresolved details, not reasons to stop frontend work:
1. Teammate engine executable/runtime, target-host deployment, supported UCI options/search/evaluation output and process capacity. UCI itself is confirmed.
2. PostgreSQL/Prisma confirmation and actual package versions.
3. Authentication/session mechanism and email-ownership flow.
4. Whether unknown-email invitations include signup in V1.
5. Exact time presets, room/invite expiry, disconnect/restart policy and draw adjudication policy.
6. Hosting region, expected concurrency and measured end-to-end budget; the server-processing engineering target is p95 below 20 ms, while complete synchronization remains network/render dependent.

Do not reopen already confirmed choices: screenshot-driven frontend work; Axios/React Query/presentation layers; react-chessboard for the board and chess.js for backend rules; UCI for backend-engine communication; friends and engine modes; username/email invitations; online/offline delivery; clocks; fast authoritative sync; independent live review; durable moves/history; evaluation last.

## 22. Reference sources

The feature inventory originally came from the Stitch project at https://stitch.withgoogle.com/projects/17023163125238249697?pli=1 and was subsequently narrowed by the user's explicit scope decisions.

Architecture and data flows are project-specific recommendations. Relevant official library/framework references:
- Next.js organization: https://nextjs.org/docs/app/getting-started/project-structure
- Next.js server/client boundaries: https://nextjs.org/docs/app/getting-started/server-and-client-components
- react-chessboard: https://github.com/Clariity/react-chessboard
- chess.js: https://github.com/jhlywa/chess.js
- TanStack Query: https://tanstack.com/query/latest/docs/framework/react/guides/query-keys
- NestJS gateways: https://docs.nestjs.com/websockets/gateways
- Socket.IO transports: https://socket.io/docs/v4/how-it-works/
- Socket.IO delivery and recovery: https://socket.io/docs/v4/delivery-guarantees/ and https://socket.io/docs/v4/connection-state-recovery/
- Socket.IO rooms: https://socket.io/docs/v4/rooms/
- Prisma transactions: https://www.prisma.io/docs/orm/fundamentals/transactions
- MSW: https://mswjs.io/docs/
- Axios: https://axios-http.com/docs/intro
- React Hook Form and Zod: https://react-hook-form.com/ and https://zod.dev/
- React Hook Form schema resolvers: https://github.com/react-hook-form/resolvers
- UCI protocol reference: https://backscattering.de/chess/uci/
- Official Stockfish UCI documentation (protocol reference; engine-specific extensions are not teammate requirements): https://official-stockfish.github.io/docs/stockfish-wiki/UCI-Protocol-and-Stockfish-Commands.html
- Node.js native process and line-stream APIs: https://nodejs.org/api/child_process.html and https://nodejs.org/api/readline.html
- Browser frame/render timing: https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame
