# Vortex Chess frontend

Next.js + React + TypeScript. Feature services own transport, TanStack Query/hooks coordinate data, and screens/components present it. The existing design and Coming Soon scope gates are retained.

## Run with the real API

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Start the backend using [its setup instructions](../backend/README.md). Frontend: `http://localhost:3000`. API: `http://localhost:3001/api`. Keep both on `localhost`, and include the exact frontend origin in API `CORS_ORIGINS`. Restart Next.js after public environment changes. Production needs an explicit API URL or a same-origin `/api` reverse proxy.

Authentication uses email/password only. Registration includes username and password confirmation. Alternative providers and recovery remain disabled with Coming Soon labels. PostgreSQL ultimately enforces identity uniqueness.

Access tokens exist only in service memory. HttpOnly cookies carry rotating refresh tokens. Reload restores through `/auth/refresh`, then `/session`. Concurrent 401 responses share one refresh, and each failed authenticated request is retried at most once. Web Locks serialize refreshes across same-origin tabs. Without Web Locks, per-tab coordination applies; actual old-cookie replay deliberately revokes the session. BroadcastChannel sends session events, never tokens.

Session changes clear private queries/mutations while preserving the observed current-session query so mounted guards update. A failed logout displays its error and does not claim revocation succeeded. Refresh rejection clears identity; network/server failures remain errors. API failures never enable mocks.

## Explicit demo mode

Set `NEXT_PUBLIC_API_MOCKING=enabled` and restart Next.js for existing MSW fixtures and scripted games. Demo login: `haseeb@vortex.io`, any password of at least eight characters. Demo behavior is not production authorization. API mode is the default in development and production.

The API provides auth, health, private rooms, invitations, notifications, authoritative games and Socket.IO realtime. A ready room's host starts the match and both players land on `/games/:id`, where moves, clocks, draws and resignation are live. "Vs Engine" in the launcher opens `/rooms/new?opponent=engine` to start a game against the teammate's engine; the backend owns the engine's turns and the browser only shows its server-reported progress ([engine gameplay](../docs/Engine_Gameplay_Milestone.md)). Demo mode reports engine play as not configured. Launcher recent-games and friends panels still show missing-endpoint errors in API mode until those modules land. API mode never substitutes fixtures for missing modules. Demo mode returns an empty notification inbox; room and invitation flows need the real API.

## Rooms, invitations and realtime

`/rooms/new` (setup), `/rooms/[roomId]` (waiting room) and `/rooms/join/[invitationId]` (invitation landing) use `features/rooms`, `features/invitations` and `features/notifications`. `RealtimeProvider` opens one Socket.IO connection per signed-in account (`lib/realtime/socket-realtime-client.ts`) at the API origin, path `<API path>/socket.io`; override the origin with `NEXT_PUBLIC_REALTIME_URL`. The handshake uses the in-memory access token, renewed through the auth refresh when the server rejects it. Realtime events and HTTP responses reconcile into the same Query cache by room revision; reconnects resubscribe and refetch notifications/invitations. Components never attach socket listeners or call Axios. See the [milestone document](../docs/Rooms_Invitations_Notifications_Milestone.md).

## Checks

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

See the [authentication milestone](../docs/Backend_Authentication_Milestone.md), [rooms/invitations milestone](../docs/Rooms_Invitations_Notifications_Milestone.md) and [OpenAPI contract](../backend/openapi.json).


## Random matchmaking

In real API mode, Find Players/1v1 opens `/matchmaking`. The screen restores the account search from the API, supports all backend time-control presets, shows elapsed time and cancellation, and automatically enters the existing arena after both players confirm readiness. The session bridge owns personal events, recovery and navigation across routes; MSW demo mode keeps this capability unavailable. The Find Match action requires the backend options contract with `enabled: true`.

See [the matchmaking milestone](../docs/Random_Matchmaking_Milestone.md) for the five-minute search/30-second arrival policy, API/event contracts, required backend migrations, feature flag and verification. Frontend layers live in `features/matchmaking/{services,realtime,queries,hooks,types}`; presentation composes them in `screens/matchmaking` and `providers/matchmaking-bridge.tsx`.
