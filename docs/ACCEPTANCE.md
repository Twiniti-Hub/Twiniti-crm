# Acceptance criteria (agent-ready)

Release acceptance for the Agent-Native Marketing CRM. An agent (or human) can treat each item as a falsifiable check.

## Test layers

- [x] Unit: property validation and filter AST compilation (`packages/db/src/hubspot.test.ts`)
- [ ] Integration: API against Neon preview branches
- [x] Auth: Hexclave session + bootstrap/`AUTH_DISABLED` modes; role gates (implemented in code; live Hexclave verified on Render)
- [x] MCP: standard stateless Streamable HTTP transport contract tests (`apps/api/src/tests/mcp-transport.test.ts`)
- [ ] Auth entry: an unauthenticated visitor selecting “I already use Loop” reaches `/sign-in` without the CRM shell or bootstrap warning (requires the public `VITE_HEXCLAVE_*` build variables on the target API service)
- [x] Regional auth entry: the landing page exposes US, EU, and UK sign-in and signup choices that resolve by default to `https://loop.us.twiniti.ai`, `https://loop.eu.twiniti.ai`, and `https://loop.uk.twiniti.ai`; preview environments may override them with `VITE_APP_URL_US`, `VITE_APP_URL_EU`, and `VITE_APP_URL_UK`
- [x] Trial visibility: the billing page shows the remaining days of the seven-day trial while the organization is in `trialing` status
- [x] Super Admin workspace access: `/super-admin` provides an explicit workspace selector, persists the regional choice, and the API validates the selected workspace context before CRM access
- [x] Email: Resend adapter contract tests (`packages/email/src/index.test.ts` personalize + signature)
- [x] Webhooks: signature validation rejects invalid signatures (`POST /api/v1/webhooks/resend`)
- [ ] Rendering: email HTML/text personalization across clients (spot-check)
- [x] Migration: HubSpot-like export fixtures import cleanly (`fixtures/hubspot/*` + schema-mapped worker)
- [ ] E2E: Playwright smoke for shell routes + create contact
- [ ] Load: 100,000 contacts / large segments
- [ ] Failure: provider rate limits, worker crashes, retries, partial imports (chunked worker checkpoints implemented; failure suite TBD)

## Release gates

- [x] HubSpot property definitions import without losing internal names or options (`POST /api/v1/imports/hubspot/properties`)
- [x] Single-file contact CSV import detects core fields, identity columns, and tenant custom properties before enqueueing the import
- [x] Contact imports match company-name columns to existing companies or create a new company, then store the relationship as a canonical company association
- [x] Single-file company CSV import accepts supported company columns and stores non-core fields in `company.properties`
- [x] Large contact CSV imports are split into worker chunks and keep reporting progress without a fixed 2-minute browser timeout
- [x] Import UI exposes recent history and failed-row diagnostics for completed or failed jobs
- [x] Contact UUIDs remain stable across email/phone changes; identity aliases and field-level history are retained
- [x] Custom fields usable in forms, segments, workflows, and personalization (property pickers + `{{properties.*}}` tokens)
- [x] Campaign send never targets suppressed or unsubscribed contacts
- [x] Duplicate Resend webhooks do not create duplicate engagement records (unique dedupe key)
- [x] User BCC addresses match inbound messages to contacts and expose email activity in the contact timeline
- [x] Interrupted imports resume safely (job `stats.cursor` checkpoints across chunked worker execution)
- [x] Campaign retries cannot duplicate a recipient send (idempotency key)
- [x] Every sensitive administrative action appears in the audit log (import/campaign/agent writes)
- [ ] Contact and segment queries meet p95 ≤ 2s at 100k contacts
- [x] Production deploy, backup, restore, and rollback procedures are documented ([`HARDENING.md`](./HARDENING.md))

## Agent / MCP harness

Use [`apps/api/src/tests/agent-harness.test.ts`](../apps/api/src/tests/agent-harness.test.ts) as the case catalog:

- [x] Catalog self-check under `node:test` (`pnpm --filter @twiniti/api test`)
- [x] Hosted MCP endpoint uses standard Streamable HTTP JSON-RPC; stdio is intentionally deferred
- [ ] Agent can search and get contacts with `contacts:read` (live)
- [ ] Agent can create/upsert contacts within scope; duplicate email returns conflict guidance (live)
- [ ] Agent can draft + preview campaigns; cannot send without approval (live)
- [ ] Agent request-approval succeeds; send without approved approval fails (live)
- [ ] Revoked agent credentials are rejected (live)
- [ ] Dry-run headers do not persist mutations (live)
- [x] Company search, create, and update tools are available through scoped MCP/API capabilities
- [ ] MCP tool list matches scoped REST capabilities (live)

## Product slices (SPA)

- [x] Overview shows live `/api/v1/reports/overview` + `/api/v1/me`, including the true current contact count
- [x] Contacts list/create with duplicate conflict messaging + schema-driven fields / detail
- [x] Contacts list supports 25/50/100 page sizes with paginated navigation
- [x] Contacts list can filter by contact fields or associated company name
- [x] Company detail pages show company fields plus associated contacts, with drill-through into contact detail
- [x] Companies list supports 25/50/100 page sizes with paginated navigation and company/domain filtering
- [x] Companies, segments (filter AST + property picker), campaigns (preview → approval → send), forms (property field picker), workflows, agents (token once + revoke), deliverability, settings (members + invites), single-file CSV import, Super Admin console

## Assumptions locked from plan

- Multi-tenant companies via `organizations` (`organization_id` boundary on CRM data)
- Roles: Company Admin (`admin`), Member (`member`); platform Super Admin via `SUPER_ADMIN_EMAILS` (default `george.broadbent@twiniti.ai`)
- Self-serve sign-up captures company name and creates a company with the signer as Company Admin
- Additional users join by email invitation (`/accept-invite`)
- Super Admin page (`/super-admin`) can create companies and invite people to any company
- HubSpot migration is one-time import only (no bi-directional sync)
- Marketing Hub core is the v1 product boundary
- Resend is the only email delivery provider in v1
- CRM consent/suppression state is authoritative over provider state
- Contact fields are **schema-driven** from imported HubSpot property definitions

## Multi-tenancy checks

- [x] Sign-up form collects company name and creates an org with role `admin`
- [x] Hexclave users are no longer auto-joined to the bootstrap org
- [x] Company Admin can invite members by email; invitee accepts via token
- [x] Super Admin can list companies, create companies, and invite to any company
- [x] Super Admin can explicitly select a workspace before using CRM functions; workspace context is limited to the current regional database
- [x] `/api/v1/me` returns `organizationName`, `needsSetup`, `isSuperAdmin`
