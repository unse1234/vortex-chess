# Frontend implementation

Source: [frontend/src](../frontend/src), [package.json](../frontend/package.json), [Next configuration](../frontend/next.config.ts). See [user journeys](user-guide.md), [architecture](architecture.md) and [verification](testing.md). The frontend's [AGENTS.md](../frontend/AGENTS.md) requires installed Next guides before changing framework code; this task changes documentation only.

## Routes and boundaries

All page files live under `src/app`. Parenthesized route groups do not appear in URLs. Pages mainly export metadata and compose screens; dynamic route params are awaited. Root layout configures fonts/metadata, global CSS and `AppProviders`. Platform/Arena shells mount `RequireSession`; auth screens handle their own redirect behavior. The frontend session gate is UX; backend guards independently enforce permission.

| URL | Page group / screen and behavior |
| --- | --- |
| `/` | root page redirects to `/play` |
| `/sign-in`, `/sign-up` | `(auth)`; `SignInScreen`, `SignUpScreen` |
| `/forgot-password`, `/reset-password` | `(auth)`; recovery screens, API-mode gate; reset uses fragment token, no-referrer/no-index metadata |
| `/legal/terms` | `(auth)`; `RoutePlaceholder`, unwritten terms |
| `/play` | `(platform)`; `LobbyScreen`, account/actions/recent/social/notifications/audio |
| `/rooms/new` | `CreateRoomScreen`; `invite` only prefills recipient (254-char bound), `opponent=engine` selects direct-engine setup |
| `/rooms/{roomId}` | `RoomScreen`; authorized waiting/ready/closed/started states |
| `/rooms/join/{invitationId}` | `JoinInvitationScreen`; intended account responds; wrong-account switch |
| `/matchmaking` | `MatchmakingScreen`; real API only; `mode=standard` link does not grant extra backend mode |
| `/games` | `GameHistoryScreen`; side/result filters and cursor pages |
| `/games/{gameId}` | `(arena)`; `GameScreen`, live layout or post-game replay; loading/error boundaries |
| `/games/{gameId}/analysis` | `(arena)`; same GameScreen with `manual`; finished participants only |
| `/leaderboard` | `LeaderboardScreen`; API-mode rating gate |
| `/friends` | `FriendsScreen`; accepted/incoming/sent/discovery tabs, API only |
| `/settings/blocked-accounts` | `FriendsScreen blocked`; independent of disabled general settings |
| `/profile`, `/settings`, `/telemetry` | `FeatureUnavailableScreen`; no interactive feature mounted |

`config/routes.ts` centralizes builders and route capability checks. `toSafeInternalPath` rejects external/protocol-relative/backslash/control-character and unsupported return destinations. Query parameters never authorize access. `config/capabilities.ts` is static UI scope; it cannot determine SMTP/engine/backend-flag readiness. Backend options/status are additional authorities. Disabled controls use shared `AppLink`, feature-aware tabs and unavailable components rather than linking to nonexistent pages.

`next.config.ts` enables Cache Components and partial prefetching with Tailwind's Turbopack CSS rule. Private server data is not fetched into a shared Server Component cache. Query clients are fresh per server render and stable per browser. Hydration guards keep account/list/latency islands initially consistent. Browser APIs, sockets, audio and forms stay in Client Components/effects. Existing CSS tokens and shared UI components own styling. `Lexend`/`Permanent_Marker` root fonts and the design fonts module use Google font integration.

## Feature layers and transports

`features/<domain>/services` call the shared `httpClient`; components do not call Axios or raw sockets. Types describe wire/client models, schemas validate forms, queries define cache keys/policies and hooks own mutations/reconciliation. `screens/` composes cross-domain UI. Generic `lib/http` accepts auth policy through an adapter rather than importing domain services.

`lib/http/browser-client.ts` uses an Axios instance with configured base URL, 10-second timeout, credentials, JSON Accept and `X-Vortix-CSRF: 1`. Authenticated requests attach the in-memory bearer and session generation. 401s share refresh, retry each original request at most once, and reject stale completions after identity changes. Authentication calls skip recursive auth retry. `ApiError` normalizes safe server messages, field errors, retryability and extra fields such as an existing gameId without exposing request credentials.

`auth-session.service.ts` owns access-token memory, cookie refresh, Web Locks across same-origin tabs and BroadcastChannel session events without token broadcast. Session query coordination clears private queries/mutations on account changes and updates the observed session query rather than leaving mounted guards stale.

Provider order in `providers/app-providers.tsx`: Mock → Query → AuthSession → Realtime → Audio → Toast, then personal/session and matchmaking bridges. `RealtimeProvider` owns one connection per authenticated browser provider/tab, not a global account connection shared across tabs. Multiple tabs have multiple sockets. Session bridge owns invitations/inbox/social; matchmaking bridge owns saved-search recovery, readiness and assignment navigation across routes.

## Cache keys and recovery

| Domain | Key source / policy |
| --- | --- |
| Session/auth | `features/auth/queries/{session,auth}.queries.ts`; private cache invalidation on identity changes |
| Rooms | `room.queries.ts`: `[rooms,options]`, `[rooms,detail,roomId]`; options stale 10 min, room 30 sec; revision structural sharing |
| Games | `game.keys.ts`: `[games,detail,gameId]`; history keys separate in `game-history.queries.ts`; finished state invalidates history |
| Invitations/inbox | `invitation.queries.ts`, `notification.queries.ts`; stable-ID pages and read state; reconnect invalidates |
| Matchmaking | `[matchmaking,status,accountId]`, `[matchmaking,options]`; status polls 2 sec while non-idle, 10 sec idle; auto-confirm retries 3 sec |
| Social | `[social,relationships,...]` includes friends/search term, request direction or blocks; friends/requests 15-sec polling; discovery 300-ms debounce/cancellation |
| Ratings | `[ratings,mine,accountId]`, history/position with account/pool; profile/position poll30 sec, version reconciliation |
| Leaderboard | `[leaderboard,pool,page]`; poll60 sec, stale30 sec, focus refetch when stale, manual refresh; not per move |
| Lobby season | `features/lobby/queries/season.queries.ts`; fixture-backed service path exists but seasons unavailable |

Default queries have staleTime30 sec, focus-refetch disabled and at most two retries for retryable errors; feature policies override this. Mutations that should not repeat blindly use `retry:false`. Keys are cleared on account change even where the resource ID alone is used.

Room responses/events reconcile by room identity/revision; presence patches do not bump revision. Invitation transitions avoid reverting answered state. Inbox pages dedupe stable notification IDs; personal event counts are live hints and durable reads recover missed data. Social uses revision invalidations, cancellation and authoritative refetch so a delayed relationship payload cannot resurrect removed/blocked state. Ratings reconcile per-pool profile revisions and leaderboard `asOf`; focus refetch means the nominal 60-second interval is not a hard once-per-minute ceiling.

`GameSessionProvider` is the single browser owner of canonical game state. HTTP/channel full snapshots and compact next-revision updates merge into it. Old/duplicate/different-game updates are ignored, gaps trigger HTTP catch-up every 2 sec until highest-seen revision is reached. Commands are allowed only in `live`; `connecting`, `reconnecting`, `resyncing` and no-transport `polling` are read-only. No-transport snapshots poll5 sec. Joining/rejoining sends a fresh snapshot. See [realtime](realtime.md) for ordering limits.

`useGameCommands` retains one pending command, UUID and fingerprint-equivalent fields across uncertain retries: up to five attempts, 1.2-second retry delay, only while synchronized. Socket ack timeout defaults5 sec. A confirmed unsent disconnected request fails visibly; an uncertain timeout is retried with the same ID. HTTP command endpoints exist but the normal UI service uses socket requests and does not silently switch writes to HTTP.

## Local UI, board and analysis

`GameBoard` uses `ChessboardAdapter` around react-chessboard. Backend legal destinations control selection/dragging, promotion and highlights. `board-position.ts` renders provisional FEN including castle/en passant/promotion without deciding legality. Selected/promotion state is scoped to a revision. Board flip and live-review cursor are local; review disables move intent but leaves canonical updates/clocks running. `useBoardFit` measures available space; reduced motion disables live animation. A keyboard coordinate form is revealed on focus.

`PostGameWorkspace`, `useManualAnalysis` and `analysis-tree.ts` own temporary branches outside canonical Query data/storage. `AnalysisPreviewService` validates finished-game paths server-side. `PreviewGate` invalidates stale responses even if cancellation is ignored; mutation data has immediate garbage collection and resolves void. Cleanup covers unmount, Cache Components Activity cleanup, pagehide/pageshow cache restoration, discard and changed game/account. The original game/PGN never includes variations.

Shared dialogs cover promotion, draw offer/response, resignation, results, invite picker, room cancellation, friend removal/block and sign-out. Error/skeleton/empty/toast components are reusable; inspect the [user guide](user-guide.md) for entry points and resulting states. Live voice and chat components are not mounted as functional features.

## Audio and assets

`features/audio/AudioProvider` owns Web Audio initialization and browser preference store. `AudioManager` caches decodes, uses replaceable game/notification channels, consumes dedupe IDs even when muted, drops decodes older than750 ms and suspends on tab hide/page navigation. LiveGameAudio checks game/revision/ply, a silent synchronization boundary and 2-second freshness after clock-offset correction. Notification cues have5-second freshness, unread/current-action checks and cross-tab presentation claims. Startup/history/gap/reconnect snapshots are silent; explicit replay navigation can call local effects.

Nine cues map in `audio-assets.ts`: gameStart, moveSelf, moveOpponent, capture, check, castle, promotion, gameEnd, notification. Result beats move; check → promotion → castle → capture → self/opponent. There are no speech recordings or distinct win/loss/draw tracks. Twelve MP3s exist; illegal-move, premove and ten-seconds are unmapped. `public/audio/asset-inventory.json` records file hashes/metadata. `public/audio/README.md` gives provenance notes, not a license grant from this documentation.

Preferences (`vortix.audio.v1`) store mute/effects/volume only, default 65%; storage failure falls back to memory. No `storage` event listener synchronizes already-open tabs. Unlock requires deliberate Enable/Test action per tab; trusted gestures resume a previously opted-in context after hide. Notification presentation claims use a separate bounded localStorage history/Web Lock. Static assets include custom SVG chess pieces, demo avatar SVGs, auth/launcher artwork, favicon and MSW worker; real account avatars remain null.

## Demo mode

`NEXT_PUBLIC_API_MOCKING=enabled` explicitly starts `mocks/browser.ts` before query requests run. Other values use the real API. MSW is browser-only; it does not intercept server-rendered requests. `MockProvider` defers requests until worker startup; `mock-realtime-client.ts` scripts game events/commands behind the same client contract. Demo identity and scripted state are not production authentication.

Demo sign-in accepts the fixture email described by `mocks/fixtures/auth.fixtures.ts` and a sufficiently long password; there is no seeded real user. `?mock=default|empty|error|slow|draw-offer|reconnect` selects bounded fixture scenarios (`slow`2500 ms; `error`503). Scripted moves do not promise arbitrary local chess.

Room/invitation real flows are not mocked into a working backend. Notification demo inbox is empty. Engine status reports not configured and creation503; manual preview on a finished demo game returns `scripted_demo_only`503. Matchmaking, ratings/leaderboard, friends management, blocked accounts and password recovery are disabled in demo mode. Conversation/match-chat handlers and fixtures exist, but chat's product gate is false and no real backend route exists. Unknown API requests may bypass the mock; demo mode is not an offline implementation of every endpoint.
