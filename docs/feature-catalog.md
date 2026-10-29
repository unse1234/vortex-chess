# Feature catalog

Source audit: 29 October 2026. Product metadata calls this application **Vortex Chess** (`frontend/src/config/app.ts`); newer screens and database identifiers also use **Vortix**. This documentation preserves existing identifiers. This catalog describes this checkout, not a deployed service.

## Status and evidence

- **Implemented**: the relevant runtime path exists, including backend/persistence where required. External configuration may still be necessary.
- **Partially implemented**: some intended behavior exists, with the missing part stated explicitly.
- **Mock/demo only**: fixture or scripted infrastructure exists without a production implementation. It may also be hidden by a UI gate.
- **Disabled / Coming Soon**: unavailable through current product controls; do not infer functionality from assets or components.

Verification is independent: **T** = verified by an existing test (test source establishes the asserted behavior; current execution results are in [testing](testing.md)); **S** = inspected in source only; **U** = not verified against the external dependency/configuration during this task. **D** denotes checks actually performed during this documentation task, recorded in testing.md. A T entry does not mean every UI state or deployment topology was exercised. No browser journey was manually verified in this task.

Every row is one inventory unit; compound controls belonging to one lifecycle are grouped. Shared pending/error/privacy behavior is described in [user guide](user-guide.md), [API](api.md) and [security](security.md). Frontend paths below are relative to `frontend/src/`; backend paths are relative to `backend/src/`. Test mappings are expanded in testing.md.

## Account and platform

| ID | Feature / entry and important limits | Status | Evidence | Implementation and persistence |
| --- | --- | --- | --- | --- |
| A01 | Sign up: username, email, password confirmation, required terms checkbox; signs in immediately | Implemented | T | `features/auth/components/sign-up-form.tsx` → `features/auth/services/auth.service.ts` → `modules/auth/AuthService.register`; User + AuthSession + RefreshToken in one transaction |
| A02 | Debounced username availability and password strength feedback; availability is advisory | Implemented | T/S | `features/auth/hooks/use-username-availability.ts`, `password-strength.ts`; `modules/users/UsersService.usernameAvailable`; uniqueness ultimately in PostgreSQL |
| A03 | Email/password sign in and Remember me | Implemented | T | `sign-in-form.tsx` → `AuthService.login`; new independent AuthSession |
| A04 | Reload restoration, rotating refresh, replay revocation, cross-tab session invalidation | Implemented | T | `features/auth/services/auth-session.service.ts`, `lib/http/browser-client.ts`; `AuthService.refresh/authenticateSession`; session/token ledger |
| A05 | Sign-out confirmation, failure feedback, immediate session revocation | Implemented | T | `features/auth/components/sign-out-dialog.tsx`, `hooks/use-sign-out.ts`; `modules/auth/session.controller.ts`, `AuthService.logout`; only that session family |
| A06 | Forgot-password generic acknowledgement; asynchronous link issuance and cooldown | Implemented | T/U | `features/auth/hooks/use-password-recovery.ts`; `PasswordRecoveryService.requestReset`, `PasswordResetRepository.issueInTx`; reset token + EmailJob; SMTP delivery unverified here |
| A07 | Fragment-link status, single-use password reset, all-session revocation and password-changed email | Implemented | T/U | `screens/auth/reset-password-screen.tsx`, recovery service; `PasswordRecoveryService.resetPassword`; password/token/sessions/outbox commit together |
| A08 | Terms route resolves, but terms content and a consent audit record are absent | Partially implemented | S | `app/(auth)/legal/terms/page.tsx`; acceptTerms validated but not stored on User |
| A09 | Account summary: username, separate ratings and sign-out; own email available through session API | Implemented | T/S | `features/auth/components/account-summary.tsx`, `features/ratings/components/account-ratings.tsx`; own `/session` and rating reads; real avatar URL is null |
| A10 | Protected routes, safe post-login next path, session loading/error retry | Implemented | T/S | `features/auth/components/require-session.tsx`, `screens/auth/use-post-auth-redirect.ts`, `config/routes.ts`; backend guard remains authoritative |
| A11 | Launcher, quick-match links, friend invite dialog, mobile social panel, recent games | Implemented | S | `screens/lobby/`, `features/lobby/components/`, `features/games/components/recent-games-panel.tsx`; composes real feature APIs |
| A12 | Browser connectivity and API round-trip indicator | Implemented | S | `hooks/use-browser-online.ts`, `hooks/use-api-latency.ts`, `screens/auth/live-telemetry.tsx`, `lib/http/ping.ts`; `/health`; not gameplay latency |
| A13 | Loading skeletons, empty/error/retry views, toasts, dialogs/popovers, reduced-motion board and keyboard coordinate entry | Implemented | T/S | `components/`, `features/games/components/board/`; no separate persistence; source inspected, accessibility/browser behavior not audited end to end |
| A14 | Google/other alternative authentication | Disabled / Coming Soon | S | `features/auth/components/auth-provider-buttons.tsx`, `config/capabilities.ts`; no provider backend |
| A15 | Email ownership verification / OTP onboarding | Disabled / Coming Soon | S | No route, token model or API; registration does not prove ownership |
| A16 | Playstyle preference and tournament-update opt-in | Disabled / Coming Soon | S | `features/auth/components/playstyle-picker.tsx`, `config/capabilities.ts`; excluded from register contract |

## Rooms, invitations and inbox

| ID | Feature / entry and important limits | Status | Evidence | Implementation and persistence |
| --- | --- | --- | --- | --- |
| R01 | Private two-seat setup, exact clock presets and host color preference | Implemented | T | `screens/rooms/create-room-screen.tsx` → `features/rooms/services/rooms.service.ts` → `modules/rooms/RoomsService.create`; Room; default 10+0 |
| R02 | Waiting room, seats, presence, host settings and readiness reset | Implemented | T | `screens/rooms/room-screen.tsx`, `hooks/use-room-session.ts`; `RoomsService.updateSettings/setReady`; revisioned Room, ephemeral presence |
| R03 | Host starts after both ready; assigned colors and immutable copied game settings | Implemented | T | `use-room-commands.ts`; `RoomsService.start` → `GamesService.createForRoomInTx`; Room + one Game + participants, pending invitations cancelled atomically |
| R04 | Host cancellation confirmation, challenger leave and replacement seat | Implemented | T | `room-screen.tsx`; `RoomsService.cancel/leave`; cancellation closes pending invitations; leaving clears readiness |
| R05 | Room limits, expiry, closed states and direct-link recovery to started game | Implemented | T | `RoomsService.create/expireDue`, `room-view.ts`; default five hosted open rooms, 120-minute TTL; records retained |
| R06 | Invitation by username or email; optional invite at creation, waiting-room form and lobby dialog | Implemented | T | `features/invitations/`, `screens/lobby/lobby-invite-dialog.tsx`; `InvitationsService.create`; registered accounts only; no recipient email in views |
| R07 | Direct invitation landing, intended-account check and switch-account action | Implemented | T/S | `screens/invitations/join-invitation-screen.tsx`; `InvitationsService.get/reference`; invitation ID grants no authority |
| R08 | Accept, decline, cancel and expiry; full/closed/joined outcomes; repeated responses | Implemented | T | `invitation-response-card.tsx`, `room-invitation-list.tsx`; `InvitationsService`; pair/room/invitation locks and pending unique index |
| R09 | Sent/received invitation pagination API; room list limited to newest 50 | Implemented | T | `features/invitations/queries/invitation.queries.ts`; `InvitationsService.list/listForRoom`; no standalone global invitation route |
| R10 | Durable notifications, unread count, mark one/all read, older pages and contextual links | Implemented | T | `features/notifications/`; `NotificationsService`; Notification rows; reading never accepts an invitation |
| R11 | Personal-channel notification toasts/sounds and cross-tab presentation claims | Implemented | T/S | `providers/session-realtime-bridge.tsx`, `notification-presentation.ts`; stable IDs, Web Locks/localStorage best effort; inbox persisted independently |
| R12 | Offline invitation email with pre-send validity/presence/read/block checks | Implemented | T/U | `InvitationsService.decideInvitationEmail`, `modules/mail/`; EmailJob queued only if offline at creation; SMTP unverified here |
| R13 | Transactional email outbox, bounded retry, leases, stale claim protection, skip/failure outcomes | Implemented | T/U | `EmailOutboxService`, `EmailWorkerService`, SMTP transport; no email admin/retry UI; possible duplicate delivery after crash |
| R14 | Public room browsing/joining | Disabled / Coming Soon | S | `config/capabilities.ts` publicRooms false; no backend browse/public join API |

## Games, recovery and review

| ID | Feature / entry and important limits | Status | Evidence | Implementation and persistence |
| --- | --- | --- | --- | --- |
| G01 | Casual private human matches | Implemented | T | Room start → `screens/games/game-screen.tsx`; `modules/games/`; Game mode FRIENDS; friendship is not a prerequisite for registered-player invitations |
| G02 | Player-versus-engine setup, either color, health/capacity/resume states | Implemented | T/U | `create-room-screen.tsx?opponent=engine`, `features/games/services/engine-games.service.ts`; `GamesService.createEngineGame`; external HTTP engine not contacted here |
| G03 | Engine queued/thinking/retrying progress, stale-result discard and aborted result | Implemented | T | `game-events.types.ts`, `result-text.ts`; `EngineTurnService`, `EnginesService`; ephemeral progress, durable moves/result |
| G04 | Random exact-control matchmaking, casual/rated, server-assigned colors | Implemented | T | `screens/matchmaking/`, `features/matchmaking/`; `MatchmakingService`; durable MatchmakingSearch, no Room |
| G05 | Queue cancellation, search/arrival expiry, multi-tab/reload recovery and automatic ready/navigation | Implemented | T | `providers/matchmaking-bridge.tsx`, `use-matchmaking.ts`; searchId guards, five-minute search and 30-second confirmation; closing tab does not cancel |
| G06 | Drag/drop, click/tap, legal targets, keyboard coordinates and provisional pending move | Implemented | T/S | `game-board.tsx`, `chessboard-adapter.tsx`, `board-position.ts`; server legal destinations and canonical state; pending display grants no acceptance |
| G07 | Castling, en passant, checks and promotion/underpromotion dialog | Implemented | T | Board adapter/promotion dialog → `GameCommandsService.move` → `rules/chess-rules.ts` using chess.js; accepted GameMove |
| G08 | Authoritative clocks, increments, interpolation and server timeout adjudication | Implemented | T | `use-game-clock.ts`, `components/clocks/`; `clocks/game-clock.ts`, `GameCommandsService`; clocks paid at server receipt, no lag compensation |
| G09 | Checkmate, resignation confirmation, draw offers/answers/cooldown and results | Implemented | T | `components/controls/`, `components/dialogs/`; GameCommandsService; engine draw offers forbidden |
| G10 | Automatic stalemate/material/repetition/50-move and timeout-material draws | Implemented | T | `rules/chess-rules.ts`; automatic third repetition/100 halfmoves; limited dead-position detection |
| G11 | SAN move list, clipboard Copy, captured pieces, board flip and local live review / Back to Live | Implemented | T/S | `features/games/components/moves/move-list.tsx`, `features/games/components/players/`, `GameSessionProvider`; local review/flip; Copy uses saved PGN or current movetext and reports clipboard denial |
| G12 | One in-flight command, same-ID retry, durable deduplication and conflict recovery | Implemented | T | `use-game-commands.ts`, `services/game.service.ts`; `GameCommandsService`, GameCommand fingerprint ledger; bounded retries |
| G13 | Disconnect/reconnect, full snapshot catch-up, revision-gap recovery and HTTP read-only polling | Implemented | T | `GameSessionProvider`, socket adapter/reconcilers; subscribe authorization, five-second fallback reads; UI sends commands only when live |
| G14 | Backend restart reconstruction and engine-turn repair | Implemented | T | `GamesService.onApplicationBootstrap`, `GameRepository.resumeActive`, `GameStore`, `EngineTurnService.recover`; active turn balances reset to last committed values |
| G15 | Arena leave confirmation | Implemented | S | `screens/shells/arena-header.tsx`, `arena-leave-guard.tsx`; leaving page is not resignation and does not stop clock |
| G16 | Finished-game history, side/result filters, recent list and cursor pagination | Implemented | T | `game-history-screen.tsx`, `game-history.service.ts`; `GameHistoryService.list`; aborted included under All, no dedicated aborted filter |
| G17 | Original replay, first/previous/next/last, recorded clocks, PGN text and result reopening | Implemented | T/S | `screens/games/post-game-workspace.tsx`, `pgn.ts`; full authorized snapshot + stored Game.pgn; no PGN import endpoint |
| G18 | Temporary manual branches, both sides, server legality validation, promotion, discard/return | Implemented | T | `use-manual-analysis.ts`, `analysis-tree.ts`; `AnalysisPreviewService.preview`; finished participants only; no database writes |
| G19 | Variation cleanup on exit, reload, page lifecycle, account/game change and late-response cancellation | Implemented | T/S | `PreviewGate`, `useManualAnalysis`; 128 plies/path, 512 temporary nodes; unsaved branches never in canonical Query cache |
| G20 | Engine score/PV transport fields validated, but no evaluation feature | Partially implemented | T | `modules/engines/http/engine-http.contract.ts`; accepts metadata, applies bestmove only; no evaluation storage/bar/hints/accuracy API |
| G21 | Premoves, despite bundled premove sound asset | Disabled / Coming Soon | S | Board permits only viewer's current turn; no premove command or state |
| G22 | Spectating | Disabled / Coming Soon | S | `config/capabilities.ts`; game reads/subscriptions participant-only |
| G23 | 2v2, tournaments and chess variants | Disabled / Coming Soon | S | capabilities team/tournaments/variants false; standard two-seat chess only |

## Ratings and social

| ID | Feature / entry and important limits | Status | Evidence | Implementation and persistence |
| --- | --- | --- | --- | --- |
| S01 | Independent Bullet/Blitz/Rapid ratings and provisional placement | Implemented | T | `features/ratings/`; `modules/ratings/rating-policy.ts`; PlayerRating; initial 1200, K 32, floor100, ten settled games |
| S02 | Rated matching windows and exact preset/pool eligibility | Implemented | T | matchmaking options and selection; `MatchmakingService.pairWaitingInTx`; both windows must allow; classical casual only |
| S03 | Atomic Elo settlement, rounding/floor/zero-sum, immutable start snapshots and result deltas | Implemented | T | `RatingsService.settleInTx`, `GameRepository.commitFinal`; Game + both profiles + RatingSettlement + two RatingChange rows |
| S04 | Leaderboards, tied competition ranks, personal position and paginated private rating history | Implemented | T | `screens/leaderboard/`; `RatingsReadService`; global SQL rank before paging; excludes provisional/ineligible profiles |
| S05 | Username-prefix discovery with relationships and debounced/cancelled queries | Implemented | T | `use-social.ts`, `social-lists.tsx`; `UsersSearchService`; search 2–20 ASCII username chars; excludes self and blocked pairs |
| S06 | Send/cancel/accept/decline friend requests and durable notification links | Implemented | T | `social-actions.tsx`, `friends.service.ts`; `SocialService.send/respond`; FriendRequest + Friendship + Notification; no friend emails |
| S07 | Friends list, bounded pagination/filtering, lobby challenges | Implemented | T/S | `social-lists.tsx`, `friends-panel.tsx`, lobby invite flow; `SocialRepository.list`; challenge uses normal casual room/invitation |
| S08 | Friends-only online/offline presence, multi-tab grace and reconnect invalidation | Implemented | T | `social-sync.ts`; `PresenceService`, `FriendPresenceService`; in-process sockets, default 3-second disconnect grace; no last-seen/activity |
| S09 | Remove friendship confirmation without blocking | Implemented | T | `SocialActionButton`; `SocialService.remove`; deletes Friendship only; terminal accepted request cannot recreate it |
| S10 | Block/unblock, private blocked list and effects on discovery/invites/matching | Implemented | T | `/settings/blocked-accounts`, `SocialService.block/unblock`, `interaction-policy.ts`; directional UserBlock; removes friendship/cancels pending requests/invites; committed games preserved |
| S11 | Social concurrent-write safety, cooldown/hourly request caps and revision recovery | Implemented | T | SocialService pair/rate/admission locks; socialRevision and Query invalidations; defaults 30 sends/hour, 300-second pair cooldown |
| S12 | Chat/match-chat/conversation fixtures and mock transport | Mock/demo only | S | `features/social/services/{match-chat,conversations}.service.ts`, `mocks/handlers/`; no backend chat controller/model; product chat gate remains false |
| S13 | Live voice chat controls/scaffolding | Disabled / Coming Soon | S | `features/social/components/voice-panel.tsx`, voice gate false; no WebRTC/media/signaling backend |
| S14 | Profile customization and general settings | Disabled / Coming Soon | S | `/profile`, `/settings` unavailable screens; blocked-account and audio controls are separate implemented features |
| S15 | Advanced statistics/telemetry | Disabled / Coming Soon | S | `/telemetry` unavailable screen; API ping is only basic connectivity |
| S16 | Levels, XP, premium/rewards and seasons | Disabled / Coming Soon | S | capabilities rewards/seasons false; fixture season/account fields do not establish real progression |

## Audio, demos and operations

| ID | Feature / entry and important limits | Status | Evidence | Implementation and persistence |
| --- | --- | --- | --- | --- |
| O01 | Game start/moves/capture/check/castle/promotion/end and notification effects | Implemented | T | `features/audio/audio-assets.ts`, `features/games/audio/game-audio.ts`; nine mapped effects; 12 MP3 assets; no prerecorded speech |
| O02 | Audio popover: master mute, effects toggle, volume, enable/test and saved browser preferences | Implemented | T/S | `features/audio/components/audio-settings.tsx`; `AudioPreferencesStore`; localStorage `vortix.audio.v1`, default 65%; no account setting API |
| O03 | Cue precedence, event dedupe, freshness, silent catch-up and autoplay/hidden-tab cleanup | Implemented | T | `AudioManager`, `LiveGameAudio`, notification freshness and presentation helpers; gesture opt-in per tab, no backlog |
| O04 | Low-time / illegal-move recordings exist without playback integration | Partially implemented | S | `public/audio/game/{ten-seconds,illegal-move}.mp3`; absent from audioAssets; no ten-second warning or illegal-move sound in runtime |
| O05 | Scripted auth/session/history/game scenarios behind explicit MSW opt-in | Mock/demo only | T/S | `mocks/`, `MockProvider`, mock realtime client; no production authorization/persistence; API outages never enable demo |
| O06 | Mock delay/error/empty scenarios and network controls | Mock/demo only | S | `mocks/scenarios/network.ts`; affects mocked API only; unavailable features remain gated |
| O07 | Health/live/ready endpoints and startup configuration validation | Implemented | T | `modules/health/health.controller.ts`, `config/environment.ts`; readiness runs SELECT 1 only |
| O08 | In-memory game/engine timing metrics and diagnostic logs | Implemented | T/S | `GameMetrics`, `EngineMetrics`; internal summary methods and diagnostic logs, no public metrics/dashboard endpoint; no new performance measurements here |
| O09 | Database migrations, Prisma generation, package checks and pre-commit lint/typecheck | Implemented | T/S | `backend/package.json`, `prisma.config.ts`, `.husky/pre-commit`; 12 migrations; no seed script |
| O10 | Production hosting automation / repository CI | Partially implemented | S | build/start scripts exist; no tracked CI workflow, Dockerfile, compose or provider deployment configuration; `nest deploy` script alone does not establish a deployment |

## Reconciliation checklist

The audit covered all 20 page files (including the `/` redirect), three route-group layouts and the root layout; frontend feature/service/query/hook/provider and mock boundaries; backend controllers including `UsersSearchController` outside a `*.controller.ts` file; both Socket.IO gateways; all 19 Prisma models and 12 SQL migrations; all declared environment keys, package scripts and the pre-commit hook; assets and all checked-in unit/integration test suites. [API](api.md) inventories all 61 concrete method/path operations. No seed or CI workflow was found in tracked files.

Counts and actual executed checks are maintained in [testing](testing.md). Plans and milestone reports are historical context, not evidence that a deployed feature works. Runtime gaps and contradictory old statements are collected in [operations](operations.md#known-gaps-and-source-inconsistencies).

## Source entry index

| Inventory group | Frontend entry / transport | Backend owner / persisted contract |
| --- | --- | --- |
| A01–A10 | [Auth feature](../frontend/src/features/auth), [auth screens](../frontend/src/screens/auth) | [Auth module](../backend/src/modules/auth), [users](../backend/src/modules/users) |
| A11–A16 | [Lobby screens](../frontend/src/screens/lobby), [capability flags](../frontend/src/config/capabilities.ts), [routes](../frontend/src/config/routes.ts) | [Session views](../backend/src/modules/users/users.service.ts), [health](../backend/src/modules/health/health.controller.ts) |
| R01–R09 | [Rooms](../frontend/src/features/rooms), [invitations](../frontend/src/features/invitations), [room screens](../frontend/src/screens/rooms) | [RoomsService](../backend/src/modules/rooms/rooms.service.ts), [InvitationsService](../backend/src/modules/invitations/invitations.service.ts) |
| R10–R13 | [Notifications](../frontend/src/features/notifications), [session bridge](../frontend/src/providers/session-realtime-bridge.tsx) | [Notifications](../backend/src/modules/notifications), [mail](../backend/src/modules/mail) |
| G01–G03,G06–G15 | [Games feature](../frontend/src/features/games), [arena screens](../frontend/src/screens/games) | [Game commands](../backend/src/modules/games/services/game-commands.service.ts), [repository](../backend/src/modules/games/services/game-repository.ts), [engines](../backend/src/modules/engines) |
| G04–G05,S02 | [Matchmaking](../frontend/src/features/matchmaking), [session bridge](../frontend/src/providers/matchmaking-bridge.tsx) | [MatchmakingService](../backend/src/modules/matchmaking/matchmaking.service.ts) |
| G16–G20 | [PostGameWorkspace](../frontend/src/screens/games/post-game-workspace.tsx), [manual analysis hook](../frontend/src/features/games/hooks/use-manual-analysis.ts) | [History](../backend/src/modules/games/services/game-history.service.ts), [preview](../backend/src/modules/games/services/analysis-preview.service.ts), [engine contract](../backend/src/modules/engines/http/engine-http.contract.ts) |
| S01–S04 | [Ratings](../frontend/src/features/ratings), [leaderboard screen](../frontend/src/screens/leaderboard/leaderboard-screen.tsx) | [Ratings](../backend/src/modules/ratings) |
| S05–S11 | [Social](../frontend/src/features/social), [FriendsScreen](../frontend/src/screens/social/friends-screen.tsx) | [Social](../backend/src/modules/social), [discovery](../backend/src/modules/users/users-search.ts), [presence](../backend/src/modules/realtime/friend-presence.service.ts) |
| O01–O06,S12 | [Audio](../frontend/src/features/audio), [audio inventory](../frontend/public/audio/asset-inventory.json), [mocks](../frontend/src/mocks) | No production owner for fixture chat/season APIs |
| O07–O10 | [Client config](../frontend/src/config), [frontend package](../frontend/package.json) | [Environment](../backend/src/config/environment.ts), [backend package](../backend/package.json), [hook](../.husky/pre-commit), [schema](../backend/prisma/schema.prisma) |

Each row's test references map to real suites in [testing](testing.md#existing-test-mapping). Runtime-disabled features are verified through flags/mounts and absence of a corresponding controller/model, not by claiming a successful end-to-end flow.
