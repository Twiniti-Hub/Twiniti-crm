# Twiniti Loop

Twiniti Loop is an agent-friendly marketing CRM built with React, Fastify, Neon PostgreSQL, Hexclave, and Resend. It is open source and available under either the [MIT License](LICENSE-MIT) or the [Apache License 2.0](LICENSE-APACHE), at your option. See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).

## Workspace

- `apps/web` — React/Vite CRM UI (router + live API pages)
- `apps/api` — Fastify REST API, Resend webhooks, MCP endpoint
- `apps/worker` — PostgreSQL job worker (imports, campaign sends, workflows)
- `packages/contracts` — shared Zod schemas
- `packages/db` — Drizzle schema, migrations, repositories, filter AST compiler
- `packages/auth` — Hexclave + agent credential auth
- `packages/email` — Resend adapter + template personalization
- `packages/config` — environment validation
- `packages/ui` — small shared UI helpers

## Local setup

```powershell
Copy-Item .env.example .env
# Set DATABASE_URL to your Neon connection string
pnpm install
pnpm db:migrate
pnpm check
pnpm dev
```

- Web: `http://localhost:5173`
- API: `http://localhost:4000`
- Health: `http://localhost:4000/health`
- MCP: `POST http://localhost:4000/mcp`

With `AUTH_DISABLED=true` (default when Hexclave secret is unset), the API boots a single-org owner for local development.

## Feature surface

| Area | Status |
|---|---|
| Contacts / companies / properties | Live API + UI |
| Segments (filter AST) / lists / forms | Live API + UI |
| Campaigns + approval-gated send | Live API + worker |
| Agents + scoped credentials + MCP | Live |
| HubSpot CSV/API import jobs | Live worker path |
| Workflows / experiments / reports | Live API |
| Deliverability + Resend webhooks | Live |
| Hardening runbooks | [docs/HARDENING.md](docs/HARDENING.md), [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md) |

## Render

`render.yaml` deploys API, static web, and worker from `development`. Secrets use `sync: false`.

## Security principles

Agents never connect to Neon directly. Contact writes and campaign sends are auditable and idempotent. Consent and suppression are enforced server-side before send.

## Project status

Schema migration `0000_foundation` is in `packages/db/drizzle` and must be applied with `pnpm db:migrate` before first run. See [CONTRIBUTING.md](CONTRIBUTING.md) for the full local workflow and [docs/HARDENING.md](docs/HARDENING.md) for production cutover checks.
