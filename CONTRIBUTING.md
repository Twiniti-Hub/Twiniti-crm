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
   For the three development databases, use `pnpm db:migrate:regional` after
   configuring `DATABASE_URL_Dev_US`, `DATABASE_URL_Dev_EU`, and
   `DATABASE_URL_Dev_UK`. Use the `Prod` variants only from a protected
   production migration job.
5. Run `pnpm check` before opening a pull request.
6. Run `pnpm build` before submitting changes that affect the web or API packages.

Keep changes focused, add tests for behavior changes, and never commit credentials, customer data, or production exports.

### Local URLs

| Service | URL |
|---|---|
| Web | http://localhost:5173 |
| API | http://localhost:4000 |
| Health | http://localhost:4000/health |
| MCP | Streamable HTTP `POST` http://localhost:4000/mcp |

With `AUTH_DISABLED=true` (default when `HEXCLAVE_SECRET_SERVER_KEY` is unset), the API bootstraps a single-organization owner for local development.

### Agent / MCP connection

The MCP surface is hosted Streamable HTTP only in this phase. Configure an
agent with the regional HTTPS endpoint and a scoped credential created from
the Agents page or `POST /api/v1/agents`. Send JSON-RPC requests with these
headers:

```text
Content-Type: application/json
Accept: application/json, text/event-stream
Authorization: Bearer twiniti_agent_<token>
```

The first request should be `initialize`, followed by `tools/list` and
`tools/call` as needed. Agent credentials are scoped and can be revoked; the
credential value is returned only once. A local stdio process is intentionally
not part of this release.

### Super Admin workspace context

Super Admins must choose a workspace in `/super-admin` before using CRM
functions. The UI stores that choice per regional browser origin and sends it
as `X-Twiniti-Workspace-Id`. The API only accepts the context for a signed-in
Super Admin and resolves it against the current regional database, so use the
US, EU, or UK Loop host that owns the workspace.

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
- The API services also build `apps/web`; set the public `VITE_HEXCLAVE_PROJECT_ID` and, when required, `VITE_HEXCLAVE_PUBLISHABLE_CLIENT_KEY` values on every regional API service. They must be present at Vite build time or the client intentionally falls back to bootstrap routing and `/sign-in` will not be available.
- The landing package is `apps/landing`; configure its `VITE_APP_URL_US`, `VITE_APP_URL_EU`, and `VITE_APP_URL_UK` values so every sign-up and sign-in choice stays in the intended data region. The supplied regional domains are the checked-in defaults.
- Keep the supplied Twiniti dark/light logo assets in `apps/landing/public/branding` when updating the landing page identity.
- Google Analytics uses the public `VITE_GOOGLE_ANALYTICS_ID` build variable; do not send names, email addresses, or other CRM fields to analytics.
- The analytics package mirrors the supplied Google `gtag.js` snippet behind consent; do not add a second raw Google tag to either HTML entrypoint.
- Agent API tokens are shown once at creation; store hashes only in `agent_identities`.

## Pull requests

Pull requests should explain the user impact, include validation steps, and call out schema or migration changes. See [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md) for agent-ready criteria and [docs/HARDENING.md](docs/HARDENING.md) for production cutover checks.
