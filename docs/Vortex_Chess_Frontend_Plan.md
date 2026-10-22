# Vortex Chess — Frontend Architecture and Delivery Plan

> **Foundation/auth milestone (22 October 2026):** NestJS + PostgreSQL/Prisma email/password authentication and frontend API integration are implemented. See [endpoint contracts, setup, decisions and verification status](Backend_Authentication_Milestone.md). API mode is now the frontend default; MSW demo mode requires explicit opt-in. Rooms, invitations, games, Socket.IO, UCI and evaluation remain later backend milestones.


> **Current V1 scope and authentication override (22 October 2026):** Sign in uses **email + password only**. Sign up requires **username, email, password and password confirmation**; usernames remain required for invitations. Existing third-party authentication and password recovery are **Coming Soon** and inactive. This decision overrides older authentication/provider proposals and the broad design inventory below.

V1 includes session handling/sign out, private player invitations by username or email, accept/decline and invitation notifications/toasts, teammate-engine gameplay, supported room/time/color settings, board/clocks/moves/promotion/draw/resign/results, independent earlier-move review with Back to Live, history and completed-game replay. Password visibility, board orientation and navigation remain supporting controls. Preserve existing service/mock-backed screens; scope availability does not imply that every V1 flow is already implemented.

Everything else is **Coming Soon**: random matching, tournaments/leaderboards, ratings/ranks, XP/rewards/seasons, 2v2/public rooms/variants, voice/general chat, advanced friend management, evaluation/analysis/hints/accuracy/statistics, and existing deferred profile/settings/preferences. Engine move generation remains V1; engine evaluation does not. Do not add UI or routes just to advertise deferred features.

The frontend's typed scope map is `frontend/src/config/capabilities.ts` (`features`). Shared Coming Soon presentation lives in `components/display/`; route availability and existing deferred destinations live in `config/routes.ts`. Deferred controls use native disabled elements without handlers or hrefs. Deferred panels mount static unavailable presentations, avoiding queries and subscriptions. Existing deferred routes render the same unavailable screen on direct access. Keep V1 room/history placeholders accessible until their implementations land.

The three layers remain unchanged: Axios/services and realtime adapters handle transport, TanStack Query/hooks coordinate data, and screens/components render presentation. Domain services/types/utilities stay outside generic `lib/`. Mock authentication remains explicit MSW demo behavior (demo sign in: `haseeb@vortex.io`, any password with at least eight characters); API mode never silently falls back to it.


Prepared: 21 October 2026

Status: implementation proposal; no application code or backend has been created by this plan.

## 1. Goal and evidence

Build the frontend first in the existing Next.js + TypeScript + Tailwind project. Reproduce the Stitch design while preparing clean boundaries for the future NestJS backend and the chess engine built by the project teammate.

Source inspected directly in the browser:
https://stitch.withgoogle.com/projects/17023163125238249697?pli=1

Five composed desktop screens were accessible: launcher/home, sign in, sign up, play room, and room setup. A design system card was also visible. Names, ratings, clocks, latency readings, engine versions, messages and positions are design samples rather than evidence of implemented services. Navigation links in the design often point to `#`.

Use **Vortex Chess**, the name confirmed by the project owner and matching the reference design. Keep product naming in configuration so it can be changed consistently without editing every component.

This proposal assumes an authenticated application flow. Guest access, the authentication mechanism, the realtime protocol, and the engine's interface remain backend decisions. Frontend mock authentication is demonstration behavior and does not establish production authorization.

## 2. Screen-derived feature inventory

### 2.1 Sign in — a complete design exists

| Area | Visible feature | Frontend responsibility |
| --- | --- | --- |
| Identity | Email and password only | Accessible form, input state, email validation and clear field errors |
| Password | Show/hide control | Local visibility toggle |
| Session | Maintain session checkbox | Capture preference; backend determines session duration |
| Recovery | Forgot password control | Coming Soon; disabled until implemented |
| Submission | Sign-in button | Pending, success and failure presentation |
| Providers | Steam, Discord, Google | Coming Soon; disabled, no provider requests |
| Navigation | Register link | Navigate to sign up |
| Visuals | Background artwork, branded card, service labels | Shared auth layout and truthful service status presentation |

### 2.2 Sign up — a complete design exists

| Area | Visible feature | Frontend responsibility |
| --- | --- | --- |
| Identity | Username/call sign and generated tag | Form and backend-returned availability state |
| Email | Email input | Format validation; backend handles verification and uniqueness |
| Password | Password, confirmation, visibility and strength indicator | Input assistance and mismatch errors; server enforces policy |
| Preference | Blitz Rush, Positional, Prodigy | Coming Soon; disabled, omitted from registration request |
| Consent | Terms acknowledgment; marketing preference | Terms stay available; marketing is Coming Soon, disabled and omitted from request |
| Providers | Steam and Discord | Coming Soon; disabled, no provider requests |
| Navigation | Return to sign in | Route navigation |

The design's fixed “98% / military-grade” password label is decorative. The implementation should present meaningful validation feedback rather than claim a fixed security score.

### 2.3 Launcher/home — a complete design exists

| Area | Visible feature | Frontend responsibility |
| --- | --- | --- |
| Account | Avatar, username, level, XP/progress, rank | Render account summary returned by the backend |
| Header | Community, notifications, settings, latency, exit | Panels/navigation and available connection status |
| Season | Season name and time remaining | Display season metadata; countdown is presentation |
| Main actions | Play with friends, create room, find players | Open invitation, room creation and matchmaking flows |
| Recent games | Opponent, win/loss, rating, relative time, View All | Recent-game list and links to game records |
| Quick match | 1v1, 2v2, custom room | Supported mode selection; 2v2 needs a separate product definition |
| Social | Friends/chat tabs, search, online/offline lists, presence and last seen | Sidebar and messaging states |

“Exit Game” in a browser must have a defined web action, such as sign out. It must not pretend to close the user's desktop application or browser.

### 2.4 Play room — a complete design exists

| Area | Visible feature | Frontend responsibility |
| --- | --- | --- |
| Match header | Ranked status, time control, region, latency, spectator count | Match metadata presentation |
| Board | 8×8 board, pieces, coordinates, highlighted squares | Controlled `react-chessboard` integration |
| Players | Opponent and self cards, ratings, captured pieces | Display server-authoritative player and capture data |
| Clock | Both clocks, turn indicator, bot calculating state | Smooth visual clocks and mutually consistent turn states |
| Actions | Flip board, offer draw, resign | Local orientation; command and confirmation interfaces |
| Move log | Notation, copy PGN, best/book badges | Display server-produced notation and annotations |
| Analysis | Opening/variation, material balance, depth, evaluation, win probability, accuracy | Optional backend/engine-derived data, with unavailable states |
| Chat | Messages, timestamps, system messages, input and quick phrases | Match conversation and send states |
| Voice | Participants and bot-muted status | Voice panel; media integration is a later capability |
| Spectating | Spectator count and spectator messages | Viewer presentation when authorized |
| Navigation | Arena, telemetry, leaderboard, archives | Connect only to implemented destinations |

Required interaction states not separately drawn: promotion choice, draw offered/received/declined, resign confirmation, game finished, opponent disconnected, reconnecting/resynchronizing, move rejected, command pending, game unavailable, and spectator/read-only mode.

The sample screen shows engine evaluation and best-move information next to a ranked game. In the real product, analysis visibility must be controlled by match policy: a competitive human game should not expose live engine assistance to its players. Analysis can be enabled for review, eligible training, bot play or an appropriately delayed spectator feed. The backend must also withhold restricted analysis data.

### 2.5 Room setup — a complete design exists

| Area | Visible feature | Frontend responsibility |
| --- | --- | --- |
| Identity | Room ID, region, synchronization status | Room summary |
| Invitations | Link, expiry, copy link and invite rivals | Invitation states and copy feedback |
| Sharing | Discord, WhatsApp, Twitch controls | External-sharing entry points only when supported |
| Seats | Host and challenger, readiness and assigned colors | Waiting/joined/ready/left presentation |
| Observers | Spectator count and capacity | Occupancy display |
| Time control | Bullet, Blitz, Rapid, Classic, presets and delay slider | Select available options; server validates effective settings |
| Access | Public or passcode locked | Access controls and passcode field when relevant |
| Modifiers | Voice, rated match, fog of war/blindfold, reactions | Capability-controlled settings |
| Commands | Preset reset, start match, warm up vs bot | Local draft reset and backend-command UI |

Creation and an existing room must be distinguished. `/rooms/new` contains a draft. A real invitation and persistent room ID are only shown after room creation succeeds. `/rooms/[roomId]` represents the created room and its participants. Host-only controls must have an appropriate read-only state for challengers.

### 2.6 Scope interpretation

| Category | Items | Planned treatment |
| --- | --- | --- |
| Designed foundations | Sign in, sign up, launcher, play room, room setup | Implement faithfully, including responsive adaptations |
| Derived support screens | Password recovery/reset, matchmaking queue, invite acceptance, game history | Design extensions needed to complete visible flows; use existing tokens |
| Reusable overlays | Draw, resign, promotion, result, invite picker, notification panel | Components/dialogs; do not create a URL for every action |
| Navigation-only destinations | Leaderboard, tournaments, public lobby browser, settings, profile, standalone community | Plan their eventual URLs; do not treat them as finished designs |
| Unconfirmed gameplay | 2v2, fog of war, blindfold | Do not enable until rules and backend/engine support are defined |
| Unconfirmed integrations | OAuth providers, voice/spatial audio, Twitch overlay | UI can represent unavailable state; integration is separate work |
| Decorative technical labels | Kernel anti-cheat, Vanguard/AEGIS, cryptographic engine, fixed pings, multiple Stockfish versions | Replace with verified capabilities/status or omit from functional UI |

Fog of war and blindfold are different variants despite being combined in one design label. Likewise, “2v2” does not tell us whether the intended game is bughouse, consultation chess or another format. Neither should be encoded as an assumed standard-chess feature.

## 3. Architecture decision

Use a **single Next.js application with feature-based modules and thin route files**. Keep related domain UI, services, hooks, contracts and schemas together. Use one composition layer for screens that combine features, and one shared infrastructure layer for HTTP/query/realtime mechanics.

This is an application architecture decision, not a claim that Next.js requires one universal folder arrangement. Do not introduce microfrontends, a monorepo toolchain, a universal repository factory, or separate domain/application/infrastructure classes for every form. The two meaningful replaceable external boundaries are HTTP and realtime transport.

### 3.1 Proposed project structure

Directory notation below uses indentation. Future modules should only be created when their scope is accepted; do not create empty placeholders for every navigation label.

```text
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
      loading.tsx
      error.tsx
      not-found.tsx
      globals.css

      (auth)/
        layout.tsx
        sign-in/page.tsx
        sign-up/page.tsx
        forgot-password/page.tsx
        reset-password/page.tsx

      (platform)/
        layout.tsx
        play/page.tsx
        matchmaking/page.tsx
        rooms/
          new/page.tsx
          join/[inviteCode]/page.tsx
          [roomId]/
            page.tsx
            loading.tsx
            error.tsx
        games/
          page.tsx
          loading.tsx

      (arena)/
        layout.tsx
        games/[gameId]/
          page.tsx
          loading.tsx
          error.tsx

    screens/
      shells/
        auth-shell.tsx
        platform-shell.tsx
        arena-shell.tsx
      auth/
        sign-in-screen.tsx
        sign-up-screen.tsx
        forgot-password-screen.tsx
        reset-password-screen.tsx
      lobby/lobby-screen.tsx
      rooms/
        create-room-screen.tsx
        room-screen.tsx
        join-room-screen.tsx
      matchmaking/matchmaking-screen.tsx
      games/
        game-screen.tsx
        game-history-screen.tsx

    features/
      auth/
        components/
        hooks/
        services/
        schemas/
        types/
        queries/
      lobby/
        components/
        hooks/
        services/
        types/
        queries/
      rooms/
        components/
        hooks/
        services/
        schemas/
        types/
        queries/
        realtime/
        constants/
      matchmaking/
        components/
        hooks/
        services/
        types/
        queries/
        realtime/
      games/
        components/
          board/
          players/
          clocks/
          moves/
          analysis/
          controls/
          dialogs/
        hooks/
        services/
        types/
        queries/
        realtime/
        providers/
      social/
        components/
        hooks/
        services/
        schemas/
        types/
        queries/
        realtime/

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
        browser-client.ts
        api-error.ts
      query/
        query-client.ts
      realtime/
        realtime-client.ts
        realtime-contract.ts

    config/
      env.ts
      app.ts
      routes.ts
      navigation.ts
      capabilities.ts

    styles/
      tokens.css
      board.css

    hooks/
      use-media-query.ts

    types/
      user-summary.types.ts
      time-control.types.ts
      pagination.types.ts

    utils/
      cn.ts
      format-duration.ts
      format-relative-time.ts

    mocks/
      browser.ts
      handlers/
      fixtures/
      realtime/
        mock-realtime-client.ts
      scenarios/

  tests/
    e2e/

  .husky/
  .env.example
  eslint.config.mjs
  next.config.ts
  tsconfig.json
  package.json
```

The names above are a blueprint, not a requirement to create every subfolder before it contains real code. Unit/integration tests live beside the relevant feature as `*.test.ts(x)`; cross-page browser tests live under `tests/e2e/`.

### 3.2 Folder responsibilities and dependency rules

| Layer | Owns | Must not own |
| --- | --- | --- |
| `app/` | URLs, metadata, params, layout composition, route fallbacks | Large screen markup, chess rules, raw socket handling |
| `screens/` | Page composition, connecting feature outputs, page-level layout | HTTP implementation, backend rules, large data stores |
| `features/` | Cohesive domain behavior, domain UI, hooks, services and contracts | Imports from `app/` or `screens/`; private imports from sibling features |
| `components/ui/` | Generic buttons, inputs, tabs, dialogs and accessible primitives | Authentication, room/game data, HTTP or sockets |
| `components/layout/` | Reusable presentational shell frames/slots | Querying current user, joining games, domain coordination |
| `components/feedback/` | Empty/loading/error/offline presentations | Deciding domain policy |
| `components/display/` | Reused neutral avatar/status/label presentations | Feature-specific player-card behavior |
| `providers/` | Application-level lifecycle and transport composition | Business calculations |
| `lib/` | Generic HTTP, QueryClient construction and realtime mechanics | Importing features or interpreting chess events |
| `config/` | Typed environment, branding, routes, navigation and capability defaults | Live backend snapshots or secrets exposed to the client |
| `types/` | Small contracts used across multiple domains | Every application type in a global `types.ts` |
| `utils/` | Pure display helpers | Legal moves, Elo, matchmaking or timeout decisions |
| `mocks/` | Development fixtures, network handlers and scripted events | Production business logic |

Allowed dependency direction:

1. Route files compose screens and layout composition components.
2. Screens/shell composition can combine several features and shared components.
3. Feature hooks use their own services/query definitions and shared infrastructure.
4. Feature UI uses its feature's contracts and shared generic components.
5. Shared infrastructure and generic components never import feature modules.

For example, `game-screen.tsx` may compose a games board and social match-chat panel. The games feature must not import the social feature. It passes `gameId`, permissions and callbacks through the composition layer. Room-to-game navigation is coordinated by the room screen from a returned `gameId`, rather than by importing game internals into the rooms module.

Enforce these boundaries with ESLint restricted-import rules, not just a README. Use direct imports with the `@/` alias; avoid root barrel files that re-export an entire feature or mix server-only and client code.

Feature services are plain asynchronous functions with typed inputs/outputs; they do not use React hooks. They normalize transport errors and, where needed, map API responses into feature contracts. Components should never receive a raw Axios response/error object. Keep a small feature flat until real complexity justifies another subfolder; naming a directory does not by itself create a useful architectural layer.

### 3.3 Domain ownership

| Feature | Ownership boundary |
| --- | --- |
| `auth` | Sign-in/up/recovery forms, current session query, auth UX and account summary contract |
| `lobby` | Launcher-only presentation, season summary, quick-action cards and home summary data |
| `rooms` | Room draft/settings, invitations, seats, readiness and pre-game lifecycle |
| `matchmaking` | Queue request, searching/cancelled/matched states and handoff to a game |
| `games` | Board, game snapshot, move commands, clocks, history, result and analysis presentation |
| `social` | Friends, presence, conversations, match chat and future voice UI |

Recent-game cards on the launcher are owned by games and composed by the lobby screen. Friends are owned by social, even when displayed on the launcher. Lobby must not become a second owner of those datasets.

Notifications, leaderboard, tournaments and settings become independent features only when implemented. Do not add a generic `dashboard` feature that eventually owns the whole application.

### 3.4 Representative games module

```text
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
    moves/move-list.tsx
    analysis/analysis-panel.tsx
    controls/game-controls.tsx
    dialogs/
      resign-dialog.tsx
      draw-dialog.tsx
      game-result-dialog.tsx
    recent-game-list.tsx

  hooks/
    use-game-query.ts
    use-game-commands.ts
    use-game-session.ts
    use-game-clock.ts
    use-game-history-query.ts

  services/game.service.ts
  queries/game.keys.ts
  queries/game.options.ts

  types/
    game.types.ts
    game-api.types.ts
    game-command.types.ts

  realtime/
    game-events.types.ts
    reconcile-game-snapshot.ts

  providers/game-session-provider.tsx
```

Only `chessboard-adapter.tsx` imports `react-chessboard`. The rest of the app depends on our small board props contract: position, orientation, allowed/highlighted destinations, interaction permission, pending state and move-request callback. This keeps library-specific props out of screens and makes a future library upgrade contained.

Use a controlled board driven by accepted snapshots. During a pending move, return the piece to the accepted position or show a pending affordance; do not commit a new authoritative FEN in the browser. Promotion sends the selected piece as part of the move request. In frontend-only development, scripted accepted snapshots demonstrate the sequence.

## 4. State, rendering and integration boundaries

### 4.1 Single ownership for state

| Data | Owner | Rule |
| --- | --- | --- |
| Current account, friends, rooms, games, history | TanStack Query cache | One authoritative frontend copy of each server snapshot |
| Live game updates | Same game query cache | Realtime updates reconcile into that snapshot; no second game store |
| Dialog open state, selected square, board orientation, active tab | Local state or scoped context/reducer | Keep close to consumers |
| Pending move/command and local interaction coordination | Game-scoped provider and mutation state | Reset on game change; do not persist as game truth |
| Form inputs and errors | Form state + schemas | Validate input shape for usability; backend validates again |
| Shareable filters/pages/selected setup mode | URL search params | Include relevant params in server-data query keys |
| Official rules, clock deadlines, results, rating, eval | NestJS/backend engine | Frontend displays returned values |

No Redux or Zustand is necessary initially. If shared transient UI later outgrows local/scoped state, introduce a focused store with clear ownership; never mirror Query snapshots into it.

Use a stable browser QueryClient; any future server prefetch QueryClient must be request-scoped. Logout clears user-sensitive query data and closes the authenticated realtime session. Query identity includes the relevant game/room ID and list parameters; never reuse one game cache key for every match.

### 4.2 Server and Client Components

Keep route entry points and static layout composition as Server Components where useful. Mark interactive islands as client components: board adapter, forms, chat, interactive settings, timers and Query/realtime providers.

Do not place `"use client"` on the root layout to make one board interactive. A server wrapper may compose client islands; it must not call client hooks. A client island's imported subtree executes on the client, so keep those boundaries deliberate.

Next.js rendering on a server does not make it the owner of game calculations. Chess rules and the teammate engine still belong behind the NestJS boundary. Introduce a Next server-only API adapter only if a later authenticated SSR requirement justifies it; do not reuse a browser Axios client that expects browser cookies inside a Server Component.

### 4.3 Realtime lifecycle and race handling

Use one authenticated transport connection per application session. Shared transport mechanics live in `lib/realtime/`; domain event shapes and handlers live inside their feature. The final transport can be Socket.IO or another protocol after the backend contract is agreed.

Mount the authenticated session-transport provider once beneath the root app/query/mock providers. It connects only after the session is authenticated. Platform and arena shells consume that provider rather than each creating their own connection, so switching between their route groups does not inherently recreate the transport. Root provider composition may read the auth feature's session hook; low-level `lib/realtime/` still cannot import auth.

The game-scoped provider joins/subscribes to the current game and cleans up those subscriptions on navigation. Leaving a game must not accidentally disconnect the entire app's shared session connection. Reconnect, logout and development Strict Mode must not accumulate listeners.

Every game snapshot needs a monotonic revision. Both HTTP fetch results and realtime payloads pass the same version-aware reconciliation policy so an older refetch cannot roll the board back after a newer event. The query update policy must cover fetch completions, not just socket handlers. Start with complete snapshots rather than complex patches.

Move commands should carry a request ID and the revision they were based on. Prevent duplicate submissions while pending. Acknowledge or reject through the authoritative response/event; do not blindly retry move commands. If ordering is uncertain, a version gap appears, or reconnect occurs, disable moving and resynchronize a fresh snapshot with a defined subscribe/replay handshake before enabling input.

Game phase and connection state are separate. A disconnect does not mean the game ended. Reject late payloads for a previous game ID after navigation.

Clocks use server timestamps, remaining time and clock-running information for display. Local interpolation avoids a network call every second, but a browser timer reaching zero never declares a winner. An isolated clock component should not rerender the whole board on every tick.

Keep game, chat and presence cache entries separate, and subscribe/select only the data a panel needs. A new chat message should not rerender the chessboard. Load board/analysis/voice dependencies only on routes or panels that use them; do not import them into the launcher through a broad feature barrel.

### 4.4 Minimum integration contract to document before mocks

These are proposed frontend needs, not claims about an existing API.

| Contract | Required information |
| --- | --- |
| Session | Current user summary, authenticated/loading state, available auth providers |
| Capabilities | Supported modes, engine features, voice availability, policy flags |
| Room snapshot | ID, revision, host/viewer role, participants, effective settings, invitation metadata, permitted actions, optional created game ID |
| Game snapshot | ID, revision, mode, phase, FEN, side to move, players, captures, notation, clock data, result, viewer permissions |
| Move command | Game ID, request ID, expected revision, source, destination, optional promotion |
| Optional analysis | Evaluation perspective and units, mate score when relevant, depth, opening, probability/accuracy only if actually supplied |
| Chat | Conversation/match scope, message ID, sender, timestamps, send status, page cursor |
| Errors | Stable code, user-safe message, optional field errors and retryability |

FEN alone does not contain full game history, repetition context or clock state; it is the board-rendering field, not a complete game-session model. The frontend does not reconstruct missing server results from it.

Snapshot types should make contradictory states difficult: one phase/turn representation rather than unrelated `isYourTurn` and `isBotThinking` flags. Match permissions control UI actions; the backend still enforces the same permissions.

### 4.5 What counts as frontend logic

Allowed local behavior includes form validation, selected presets, dialogs, layout breakpoints, board orientation, date/time formatting, displayed countdown interpolation and presentation of backend-provided highlights. These are normal UI responsibilities.

Legal move generation, board-state progression, chess results, official timeout, rating, matching, username availability, invitation expiry enforcement and engine analysis remain backend responsibilities. The backend also supplies list search/filter/sort results when they represent business datasets.

## 5. Frontend-only mock strategy

Use the same feature services and query hooks that will call the real backend. Components must not import fixture arrays directly.

HTTP mocking uses MSW. The mock provider starts its browser worker before mounting query-driven UI; a browser service worker cannot intercept requests issued by a Server Component. During this phase, authenticated mocked data is fetched by client feature hooks, while server layouts remain static/compositional.

Realtime mocking uses a small in-process implementation of the app's transport contract, with scripted event sequences. Do not assume that native WebSocket interception automatically mocks Socket.IO's wire protocol. A real Socket.IO adapter is added only if that protocol is chosen.

Mocks contain precomputed snapshots and explicit scenarios rather than a newly written chess engine. They demonstrate known moves, a rejected move, bot thinking, promotion, room join/start, disconnect/reconnect, draw and game completion. Arbitrary fully legal local chess play is not promised by a UI-only mock.

Use an explicit mock/API configuration. Mock code is dynamically loaded only in the deliberate development/demo mode; real deployments must not silently fall back to successful mock authentication or mock move acceptance when an API fails. Do not put preview session behavior behind a production authorization claim.

Once contracts stabilize, integration changes the API endpoint/transport adapter and removes mock bootstrapping. This reduces UI rewrites, but it does not eliminate contract reconciliation with the backend team.

## 6. Expected frontend routes

### 6.1 Initial delivery proposal

| URL | Source/status | Purpose | Shell |
| --- | --- | --- | --- |
| `/` | Proposed entry behavior | Redirect to `/play`; no separate marketing page in the reference | Root |
| `/sign-in` | Designed | Sign in | Auth |
| `/sign-up` | Designed | Register | Auth |
| `/forgot-password` | Derived from visible link | Request recovery email | Auth |
| `/reset-password` | Derived companion | Password reset using an opaque backend-issued token | Auth |
| `/play` | Designed | Launcher/home | Platform |
| `/rooms/new` | Designed screen, draft mode | Configure and create a room | Platform |
| `/rooms/[roomId]` | Designed screen, existing-room mode | Seats, invitation, settings and start command | Platform |
| `/rooms/join/[inviteCode]` | Derived from invitation feature | Resolve invitation, authenticate if needed, enter passcode when required | Platform |
| `/matchmaking` | Derived from Find Players | Mode selection, searching, cancel and match-found state | Platform |
| `/games` | Derived from Recent Games / Archives | Paginated game history | Platform |
| `/games/[gameId]` | Designed | Active game or completed game record; authorized player/spectator view | Arena |

Route groups `(auth)`, `(platform)` and `(arena)` do not appear in the URL. They share the single root `app/layout.tsx` while allowing different page chrome. The game arena needs more board space than the launcher; this is why it has a separate nested shell.

Use `/rooms/new?opponent=engine` as an optional initial room-draft selection for bot play, not a new board implementation. The created game’s backend mode determines its actual behavior. Queries never grant a spectator/player role or ranked privileges.

Invites should preserve an allowlisted internal return destination across sign in. A room ID is not an authorization secret. Completed games can use the same `/games/[gameId]` URL in read-only/result mode; a separate analysis route is only added when a dedicated review experience exists.

Password reset, invite and session flows remain mocked until backend implementation. Their forms and navigation can be completed first. Actual auth-provider callbacks/verification routes should be chosen with the backend authentication topology rather than invented as frontend API endpoints now.

### 6.2 Later routes, not included as complete initial screens

| URL | Why it may be needed |
| --- | --- |
| `/rooms` | Public lobby browser implied by the navigation |
| `/leaderboard` | Global ranking entry |
| `/tournaments` | Tournament entry |
| `/settings` | Account, board, audio and notification preferences |
| `/players/[username]` | Player profile, if profile navigation is accepted |
| `/community` | Full social destination if a sidebar is insufficient |
| `/games/[gameId]/analysis` | Dedicated post-game/training review |

Do not ship active links to unbuilt pages. In a faithful preview, unavailable capabilities can be shown disabled with a clear explanation. Friend search, notifications, invite picker, draw/resign, promotion, result and voice controls are panels/dialogs, not separate routes by default.

### 6.3 Flow mapping

| Trigger | Destination/action |
| --- | --- |
| Home: Create Room | `/rooms/new` |
| Home: Play with Friends | Invite picker or friend selection, then room creation |
| Home: Find Players / 1v1 | `/matchmaking` with a supported preset |
| Room successfully created | Navigate to `/rooms/[roomId]` returned by the API |
| Invite link opened | `/rooms/join/[inviteCode]`, then the resolved room |
| Match found / host starts match | `/games/[gameId]` returned by the API/event |
| Recent game selected | `/games/[gameId]`; backend determines active/completed access |
| Recent games: View All / Archives | `/games` |
| Play-room: Arena | `/play` after any necessary leave-game confirmation |
| Game finished | Result overlay on the same game URL; return-to-play action |

## 7. Design system and component boundaries

Extract the visible reference tokens into semantic CSS variables and Tailwind theme mappings:

| Token role | Reference |
| --- | --- |
| Primary/action | Emerald `#10B981` |
| Secondary/accent | Amber `#F59E0B` |
| Tertiary/info | Indigo `#6366F1` |
| Neutral foundation | Dark `#141923` with separate surface/border/text roles |
| Headline font | Space Grotesk |
| Body font | Inter |
| Technical labels | JetBrains Mono |

Keep colors, focus states, spacing, radii, shadows and typography consistent through tokens. Domain statuses get semantic variants rather than scattered hardcoded colors. Chess pieces and artwork belong in assets, not giant inline data strings in screen components.

Generic primitives include button, input, checkbox, tabs, select, dialog, tooltip, badge, avatar, skeleton and toast. Domain components include player card, room seat, time-control picker, evaluation panel, move log, friend row and match chat. A player card belongs to games even if it visually resembles a generic profile card.

Use a desktop-first visual reference with deliberate tablet/mobile adaptations: keep the board usable; place move log, analysis and chat in tabs/drawers or stacked panels as space narrows. Do not shrink the entire desktop screenshot into a phone viewport. Provide click/tap move interaction in addition to dragging, keyboard-operable controls, visible focus, readable contrast and reduced-motion behavior.

The reference's desktop minimize/maximize/close chrome has no assumed native-window behavior in a Next.js site. Keep only controls with meaningful web behavior or simplify the decorative chrome.

## 8. Dependencies and tooling

| Dependency/tool | Intended role | When |
| --- | --- | --- |
| Next.js, React, TypeScript, Tailwind | Existing application foundation | Now |
| `react-chessboard` | Interactive board rendering behind our adapter | Board phase |
| TanStack Query | Server-data loading/cache and mutation state | Data boundary phase |
| Axios | HTTP client used by feature services | Data boundary phase |
| React Hook Form + Zod | Form state, validation and request-shaped schemas | Auth/room forms |
| MSW | HTTP development/demo scenarios | Mock integration phase |
| ESLint, TypeScript strict, Husky | Import boundaries, correctness and commit-time checks | Foundation |
| Browser E2E tooling | A few important multi-screen and interaction flows | Validation phase |

Keep existing UI primitives if the project already has them. A UI component library can be selected when scaffolding; it must allow the Stitch appearance rather than dictate the page design. Do not install multiple UI kits or global state libraries speculatively.

`chess.js` and engine-process/UCI packages are backend concerns under the agreed plan. They should not be imported into the frontend for move progression or evaluation.

## 9. Implementation order and acceptance criteria

| Step | Work | Completion evidence |
| --- | --- | --- |
| 1 | Audit existing Next project; add boundaries, tokens, assets, shared root and three shell variants | Build/typecheck clean; routes render correct shells |
| 2 | Document DTO/event needs; introduce services, query provider, HTTP mocks and scripted realtime adapter | Query-driven loading/error/empty/success scenarios work without component fixture imports |
| 3 | Sign in/up and recovery forms | Validation, password visibility, pending/errors and navigation work with mock responses |
| 4 | Launcher and social sidebar | Reference layout, recent games, friend/presence and panels work responsively |
| 5 | Room draft, existing room, invitation and matchmaking | Create/join/expired/full/host/challenger/search/cancel/matched states are demonstrated |
| 6 | Board, player cards, clocks, move log, game controls, match chat and optional analysis UI | One scripted human/bot flow completes; promotion/draw/resign/result/reconnect states are reviewable |
| 7 | Responsive, accessibility and browser QA | Main flows work on desktop, tablet and phone; no hydration/console errors or dead primary links |
| 8 | Backend handoff | Contract gaps recorded; API mode and transport seam ready for integration |

Mock scenarios should cover an empty account/history, API failure, invalid credentials, room not found/full/expired, pending/rejected move, draw, promotion, game completion and reconnect with a newer snapshot. Use deterministic timings/snapshots for reproducible reviews.

Meaningful automated checks focus on snapshot revision reconciliation (including a stale HTTP fetch after a newer event), command deduplication, subscription cleanup, viewer permissions and the main create/join/play/result navigation. Avoid tests that merely duplicate every Tailwind class or assert trivial component existence.

## 10. Decisions to resolve during backend planning

These do not block the frontend architecture or the designed screens:

1. Engine communication: UCI executable, API or another interface, and which analysis fields it supports.
2. Supported launch modes: standard 1v1 and bot play are the proposed baseline; 2v2 and variants need definitions.
3. Authentication/session topology and whether email verification is required. Alternative authentication is deferred.
4. Actual realtime transport, event subscription/resync contract and clocks.
5. Whether live analysis is allowed for bot training; ranked human games require a stricter visibility policy.
6. Voice, spectators, ratings/seasons and tournament scope.

## 11. Sources used to check framework/library decisions

The product inventory comes from the project inspected in the browser. The architecture is a project-specific recommendation. Framework/library behavior was checked against:

- Next.js project organization: https://nextjs.org/docs/app/getting-started/project-structure
- Next.js Server/Client Components: https://nextjs.org/docs/app/getting-started/server-and-client-components
- React Chessboard: https://github.com/Clariity/react-chessboard
- chess.js scope: https://github.com/jhlywa/chess.js
- TanStack Query SSR and query identity: https://tanstack.com/query/latest/docs/framework/react/guides/ssr and https://tanstack.com/query/latest/docs/framework/react/guides/query-keys
- MSW mocking boundary: https://mswjs.io/docs/
- Zod/form integration: https://zod.dev/
- Axios documentation: https://axios-http.com/docs/intro
