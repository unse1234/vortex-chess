# Vortix Chess frontend

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

This backend milestone provides auth and health only. Launcher games/social requests show errors in API mode until later modules land. Use explicit demo mode to review existing game UI; API mode never substitutes fixtures for missing modules.

## Checks

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

See the [authentication milestone](../docs/Backend_Authentication_Milestone.md) and [OpenAPI contract](../backend/openapi.json).
