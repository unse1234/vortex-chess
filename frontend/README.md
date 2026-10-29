# Vortex Chess frontend

Next.js + React + TypeScript interface. Feature services own Axios transport, TanStack Query/hooks coordinate server data, and screens/components present it. API mode is the default; MSW demo requires explicit opt-in and has narrower functionality.

Current source-audited documentation:

- [Setup, environment and production rollout](../docs/deployment.md)
- [frontend implementation](../docs/frontend.md)
- [Feature catalog](../docs/feature-catalog.md) and [user guide](../docs/user-guide.md)
- [HTTP API](../docs/api.md), [OpenAPI JSON](../backend/openapi.json) and [realtime](../docs/realtime.md)
- [Testing and audit evidence](../docs/testing.md), [security](../docs/security.md) and [operations](../docs/operations.md)
- [Repository overview](../README.md)

Run npm scripts from this directory. Installation: `npm ci`; copy `.env.example` to `.env.local`, configure public API URL and run `npm run dev`. Local URL `http://localhost:3000`. Rebuild after public environment changes.

Older milestone reports are dated historical evidence, not current setup or a claim that a deployed dependency works.
