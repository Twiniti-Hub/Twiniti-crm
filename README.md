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
# Set DATABASE_URL to your development Neon connection string
pnpm install
pnpm db:migrate
pnpm check
pnpm dev
```

For regional development, also set `DATABASE_URL_EU` and `DATABASE_URL_UK`,
then run `pnpm db:migrate:regional`. The command applies the same checked-in
Drizzle migration chain to US, EU, and UK databases in order. See
[docs/REGIONAL_DATA.md](docs/REGIONAL_DATA.md).

- Web: `http://localhost:5173`
- API: `http://localhost:4000`
- Health: `http://localhost:4000/health`
- MCP: `POST http://localhost:4000/mcp`

With `AUTH_DISABLED=true` (default when Hexclave secret is unset), the API boots a single-org owner for local development.

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

## Render

`render.yaml` deploys API, static web, and worker from `development`. Secrets use `sync: false`.

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
