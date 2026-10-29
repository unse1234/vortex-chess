# Vortex Chess

Current implementation documentation, audited from source on 29 October 2026:

| Audience | Start here |
| --- | --- |
| Users | [User guide](docs/user-guide.md), [complete feature catalog](docs/feature-catalog.md) |
| Developers | [Architecture](docs/architecture.md), [frontend](docs/frontend.md), [backend](docs/backend.md), [HTTP API](docs/api.md), [realtime](docs/realtime.md) |
| Maintainers | [Database](docs/database.md), [engine integration](docs/engine.md), [security](docs/security.md), [testing and audit evidence](docs/testing.md) |
| Operators | [Setup, environment and deployment](docs/deployment.md), [operations and troubleshooting](docs/operations.md) |

Vortex Chess supports private timed human games, external-engine games, casual/rated random matchmaking, friends/blocks, durable notifications, password recovery, separate Bullet/Blitz/Rapid Elo, leaderboards, replay/PGN, temporary manual variations and browser audio preferences. Some screens use the spelling Vortix; product metadata still uses Vortex Chess.

Prerequisites: Node.js **24.15.0+**, npm, Git and PostgreSQL with a dedicated application database/user. SMTP is required for actual email delivery; a compatible external HTTP engine is optional. See [deployment](docs/deployment.md) for all environment variables, database provisioning, production builds, HTTPS/cookies, proxies and migration ordering.

Chat, live voice, public rooms, spectating, tournaments, team play, variants, profile customization, advanced statistics, seasons, XP and Google sign-in remain disabled. Manual variations are unsaved; engine evaluation/hints/accuracy are unavailable. The terms route is placeholder content. The full runtime requires one backend owner for clocks, presence and engine scheduling.

API mode is the default. `NEXT_PUBLIC_API_MOCKING=enabled` explicitly enables a limited frontend demo; API errors never enable it. The [catalog](docs/feature-catalog.md) separates implemented, partial, demo and disabled functionality, with verification recorded independently.

Older [plans and milestone reports](docs/) are historical background. The current guides above supersede their scope claims and setup advice.


## Quick start

From the repository root:

```powershell
npm --prefix frontend ci
npm --prefix backend ci
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env.local
```

Edit the ignored local files with your own database connection, generated signing secret and exact frontend CORS origin. The template signing secret is deliberately rejected. Leave ENGINE_BASE_URL unset to disable engine games. Use localhost consistently for frontend/API cookies.

In one terminal:

```powershell
Set-Location backend
npm run db:validate
npm run db:migrate
npm run start:dev
```

In another terminal:

```powershell
Set-Location frontend
npm run dev
```

Open `http://localhost:3000` (API `http://localhost:3001/api`). There is no seed script; create an account through signup.

Run Git from this root. Husky runs both apps’ lint/typecheck before commits. See [testing](docs/testing.md) for checks actually executed and the isolated-database integration procedure. No seed or hosted CI workflow is included.
