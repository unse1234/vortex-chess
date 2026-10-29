# Vortex Chess backend

NestJS API with PostgreSQL/Prisma, authoritative games/clocks, HTTP engine adapter, Socket.IO, ratings, social management and transactional email outbox. Run one backend game owner; startup resumes every active game.

Current source-audited documentation:

- [Setup, environment and production rollout](../docs/deployment.md)
- [backend implementation](../docs/backend.md)
- [Feature catalog](../docs/feature-catalog.md) and [user guide](../docs/user-guide.md)
- [HTTP API](../docs/api.md), [OpenAPI JSON](../backend/openapi.json) and [realtime](../docs/realtime.md)
- [Testing and audit evidence](../docs/testing.md), [security](../docs/security.md) and [operations](../docs/operations.md)
- [Repository overview](../README.md)

Run npm scripts from this directory. Installation: `npm ci`; copy `.env.example` to `.env`, configure your private database/generated secret/exact origins, run `npm run db:migrate` then `npm run start:dev`. Local API `http://localhost:3001/api`. Migration is explicit; there is no seed script.

Older milestone reports are dated historical evidence, not current setup or a claim that a deployed dependency works.
