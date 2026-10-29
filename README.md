# Vortex Chess

One repository for the Vortex Chess frontend, backend, and project documentation.

| Directory | Contents |
| --- | --- |
| [frontend/](frontend/README.md) | Next.js interface, V1 chess experience, authentication, rooms, invitations, notifications and live games |
| [backend/](backend/README.md) | NestJS API, PostgreSQL/Prisma persistence, sessions, rooms/invitations, authoritative games and clocks, engine games through the HTTP engine adapter, Socket.IO realtime and invitation email outbox |
| [docs/](docs/) | Architecture, scope decisions, and milestone handoff |

Start with the [project plan](docs/Vortix_Chess_Project_Plan.md), the [authentication milestone](docs/Backend_Authentication_Milestone.md), the [rooms, invitations and notifications milestone](docs/Rooms_Invitations_Notifications_Milestone.md), the [gameplay milestone](docs/Gameplay_Milestone.md), the [history/replay milestone](docs/History_Replay_Analysis_Milestone.md) and the [engine gameplay milestone](docs/Engine_Gameplay_Milestone.md). Each app's README documents its environment variables, installation, database setup, and development commands.

Rated random matchmaking, independent Bullet/Blitz/Rapid Elo and paginated leaderboards are implemented. See the [ratings milestone](docs/Rated_Matchmaking_Elo_Leaderboards.md) for policy, migrations, configuration and verification. Password recovery and [game audio](docs/Game_Audio.md) are also implemented; Google authentication remains disabled.

Friends/social management is implemented: username discovery, requests, paginated friendships, private presence, casual challenges through existing invitations, and blocking across direct interactions and matchmaking. See the [social milestone](docs/Friends_Social_Management.md) for policy, API/events, migration, rollout and the single-instance presence requirement.

Install dependencies separately from this directory:

```sh
npm --prefix frontend ci
npm --prefix backend ci
```

The apps share one Git history. Run Git commands from this directory; commit hooks run lint and typecheck for both apps. Keep local credentials in ignored `.env` files and use the committed `.env.example` files as templates.

```sh
npm --prefix frontend run test
npm --prefix backend run test
npm --prefix frontend run build
npm --prefix backend run build
```

Backend HTTP integration tests additionally require a dedicated PostgreSQL test database; see [backend setup](backend/README.md). They run one file at a time and need the database to themselves.
