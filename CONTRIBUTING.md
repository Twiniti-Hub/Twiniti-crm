# Contributing to Twiniti CRM

Thanks for helping build Twiniti CRM.

## Development

1. Copy `.env.example` to `.env` and fill only local development values (never commit `.env`).
2. Run `pnpm install`.
3. Apply database migrations against your Neon database:
   ```powershell
   pnpm db:migrate
   ```
4. Start the API, web app, and worker:
   ```powershell
   pnpm dev
   ```
5. Run `pnpm check` before opening a pull request.
6. Run `pnpm build` before submitting changes that affect the web or API packages.

Keep changes focused, add tests for behavior changes, and never commit credentials, customer data, or production exports.

### Local URLs

| Service | URL |
|---|---|
| Web | http://localhost:5173 |
| API | http://localhost:4000 |
| Health | http://localhost:4000/health |
| MCP | `POST` http://localhost:4000/mcp |

With `AUTH_DISABLED=true` (default when `HEXCLAVE_SECRET_SERVER_KEY` is unset), the API bootstraps a single-organization owner for local development.

### Workspace layout

- `apps/web` — React/Vite CRM UI
- `apps/api` — Fastify REST API, Resend webhooks, MCP
- `apps/worker` — background jobs (imports, campaign sends, workflows)
- `packages/db` — Drizzle schema + migrations (`packages/db/drizzle`)
- `packages/contracts` — shared Zod schemas
- `packages/auth` — Hexclave + agent credential auth
- `packages/email` — Resend adapter
- `packages/config` — env validation
- `packages/ui` — shared UI helpers

### Database changes

- Edit `packages/db/src/schema.ts`, then generate with `pnpm db:generate` and apply with `pnpm db:migrate`.
- Pull requests that change schema must note migration impact and stay backward-compatible with the deployed application during rollout.
- Agents and clients must never connect to Neon directly; use the public API / MCP tools.

## Auth and secrets

- Prefer Hexclave hosted auth in production (`hexclave.config.ts`).
- Render Blueprint secrets use `sync: false` — set them in the Render dashboard only.
- Agent API tokens are shown once at creation; store hashes only in `agent_identities`.

## Pull requests

Pull requests should explain the user impact, include validation steps, and call out schema or migration changes. See [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md) for agent-ready criteria and [docs/HARDENING.md](docs/HARDENING.md) for production cutover checks.
