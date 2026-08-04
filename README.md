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
# Set DATABASE_URL_Dev_US, DATABASE_URL_Dev_EU, and DATABASE_URL_Dev_UK
# to your development Neon branch connection strings
pnpm install
pnpm db:migrate:regional
pnpm check
pnpm dev
```

The command applies the same checked-in Drizzle migration chain to US, EU, and
UK databases in order. Set `DEPLOYMENT_ENV=production` only in a protected
production migration job. See
[docs/REGIONAL_DATA.md](docs/REGIONAL_DATA.md).

- Web: `http://localhost:5173`
- API: `http://localhost:4000`
- Health: `http://localhost:4000/health`
- MCP: Streamable HTTP `POST http://localhost:4000/mcp`

The hosted MCP endpoint is a stateless, bearer-authenticated Streamable HTTP
server. Agents should send JSON-RPC requests with `Content-Type:
application/json`, `Accept: application/json, text/event-stream`, and an
`Authorization: Bearer twiniti_agent_...` header. The production regional
endpoints are `https://loop.us.twiniti.ai/mcp`,
`https://loop.eu.twiniti.ai/mcp`, and `https://loop.uk.twiniti.ai/mcp`.
There is no stdio launcher in this phase; agents connect over HTTPS and use
the MCP `initialize`, `tools/list`, and `tools/call` methods.
See [docs/AGENT_CONNECTION.md](docs/AGENT_CONNECTION.md) for a copy-ready
agent connection guide, credential and scope rules, request examples, and
troubleshooting.

Super Admins choose an explicit workspace from `/super-admin` before using CRM
functions. The selected workspace is kept in that regional browser origin and
sent as `X-Twiniti-Workspace-Id`; the API validates that the workspace exists
in the current regional database before granting CRM context. Use the matching
regional Loop host when switching between US, EU, and UK workspaces.

With `AUTH_DISABLED=true` (default when Hexclave secret is unset), the API boots a single-org owner for local development.

Production and development Render API services build the web application from
the same checkout. Set `VITE_HEXCLAVE_PROJECT_ID` and, when required by the
Hexclave project, `VITE_HEXCLAVE_PUBLISHABLE_CLIENT_KEY` in each API service's
build environment. These public `VITE_*` values are distinct from the
server-only `HEXCLAVE_PROJECT_ID` and `HEXCLAVE_SECRET_SERVER_KEY`; because
Vite embeds them during the build, a redeploy is required after changing them.

## Feature surface

| Area | Status |
|---|---|
| Contacts / companies / properties | Live API + UI with company drill-down |
| Immutable contact IDs + identity/history tracking | Live API + UI |
| Segments (filter AST) / lists / forms | Live API + UI |
| Campaigns + approval-gated send | Live API + worker |
| Agents + scoped credentials + MCP | Live |
| Single-file contact/company CSV import + tenant custom properties | Live worker path with chunked background processing |
| Workflows / experiments / reports | Live API |
| Deliverability + Resend webhooks | Live |
| BCC email tracking + contact activity timeline | Live (requires Resend Receiving setup) |
| Hardening runbooks | [docs/HARDENING.md](docs/HARDENING.md), [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md) |

## User help

The end-user guide is in [docs/help/README.md](docs/help/README.md). It covers onboarding, contacts, companies, imports, audiences, campaigns, forms, workflows, agents, deliverability, settings, billing, and Super Admin workspace selection.

## Render

`render.yaml` deploys regional APIs, a dedicated static landing site, and the
regional worker from `development`. Secrets use `sync: false`.

The production Blueprint is [render.production.yaml](render.production.yaml).
Both Blueprints define US, EU, and UK API services, one static landing service,
and one worker that processes all three regional queues. The landing service
offers explicit US, EU, and UK choices for Hexclave sign-up and sign-in.
Configure `VITE_APP_URL_US`, `VITE_APP_URL_EU`, and `VITE_APP_URL_UK` on the
landing service when regional domains differ; the checked-in defaults are
`loop.us.twiniti.ai`, `loop.eu.twiniti.ai`, and `loop.uk.twiniti.ai`.
The landing page brand assets are stored in `apps/landing/public/branding`.
UK runs as a logical cell in the Frankfurt Render region.

### Google Analytics

Set the public `VITE_GOOGLE_ANALYTICS_ID` (for example, a `G-XXXXXXXXXX`
GA4 Measurement ID) in each environment's common Render group. The landing
page and CRM application share the same consent-aware integration; analytics
does not load or send page views until the visitor accepts optional analytics.
Local `.env` files may use the existing `Google_Analytics` alias.

## Import behavior

Contact and company CSV imports are queued for worker execution. The API creates any missing tenant property definitions before enqueueing the job, then splits each payload into 250-row worker chunks so smaller imports finish quickly and larger imports continue safely in the background.

Contact imports now resolve company columns to canonical CRM company records. When a contact row includes a company name, the worker matches it against the company list, reuses the existing company when found, and creates a new company when no match exists. The contact-to-company relationship is stored through the company ID association table rather than relying on a free-text company name on the contact.

The import page now includes:

- side-by-side contact and company CSV upload flows
- recent import history
- per-import failed row inspection
- background status polling until each job reaches a terminal state

Company imports support these core CSV columns:

- `Company name`
- `Industry`
- `Company owner`
- `Create Date`
- `Phone Number`
- `Last Activity Date`
- `City`
- `Country/Region`

`Company name` and `Industry` map to first-class company fields; the remaining supported columns are stored in `company.properties`.

## Contact browsing

The contacts list supports pagination with `25`, `50`, or `100` contacts per page plus text filtering by contact fields or associated company name. The overview dashboard now uses the live contact count instead of a 100-row sample so the total contacts metric reflects current CRM state.

## Company browsing

The companies list now matches the contacts list with `25`, `50`, or `100` row pagination and text filtering by company name or domain.

## Email activity tracking

Each signed-in user can copy a personal BCC address from Settings. BCCing that address records the email against matching contacts, including replies, and shows it in the contact timeline. The `EMAIL_TRACKING_DOMAIN` must be a Resend receiving domain with its MX records configured and an `email.received` webhook pointed at `/api/v1/webhooks/resend`. The worker uses Resend's receiving API to retrieve message content after the webhook arrives.

## Security principles

Agents never connect to Neon directly. Contact writes and campaign sends are auditable and idempotent. Consent and suppression are enforced server-side before send.

## Project status

Schema migration `0000_foundation` is in `packages/db/drizzle` and must be applied with `pnpm db:migrate` before first run. See [CONTRIBUTING.md](CONTRIBUTING.md) for the full local workflow and [docs/HARDENING.md](docs/HARDENING.md) for production cutover checks.
