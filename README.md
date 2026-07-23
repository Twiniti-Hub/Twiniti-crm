# Twiniti CRM

Agent-friendly marketing CRM built with React, Fastify, Neon PostgreSQL, Hexclave, and Resend.

Twiniti CRM is open source and available under either the [MIT License](LICENSE-MIT) or the [Apache License 2.0](LICENSE-APACHE), at your option. The repository is public, and contribution/security guidance is available in [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).

## Workspace

- `apps/web` — React/Vite CRM interface
- `apps/api` — Fastify API and agent endpoints
- `packages/contracts` — shared API/domain schemas
- `packages/db` — Drizzle schema and migrations

## Local setup

```powershell
Copy-Item .env.example .env
pnpm install
pnpm check
pnpm dev
```

The web app runs on `http://localhost:5173` and the API on `http://localhost:4000`.

## Agent surface

The initial API exposes safe, versioned routes for contact search, contact creation/update, and campaign previews. The MCP server and approval-gated sending workflow are planned as the next implementation slice; direct database access is intentionally not supported.

## Project status

This project is in active foundation development. The current repository contains the initial web shell, API scaffold, shared contracts, database schema, and agent tool registry. Integrations that require customer credentials are intentionally configured through environment variables and are not committed to the repository.
