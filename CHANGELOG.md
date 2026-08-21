# Changelog

## [0.10.52] - 2026-08-21

- Cloud Agents must open `cursor/*` and `codex/*` PRs as `twiniti-code-bot`
  via `GH_TOKEN="$TWINITI_CODE_BOT_GITHUB_TOKEN" gh`; Cursor `ManagePullRequest`
  is forbidden because it authors PRs as `George-Twiniti`.
- `policy / release-policy` fails agent-branch PRs unless the GitHub author is
  the bot, and `AGENTS.md` records the identity contract.

## [0.10.51] - 2026-08-17

- Billing gateway acknowledges fan-out Stripe events when any regional API accepts them, and logs each destination result (stops Stripe 502 retries caused by cold/unrelated regions).
- Stripe Basil compatibility: read `current_period_end` from subscription items and invoice subscription ids from `parent.subscription_details`; invoice handlers retrieve the live subscription instead of forcing `active`/`past_due`.
- Super Admin can resync an organization from Stripe via `POST /api/v1/super-admin/organizations/:organizationId/billing/resync`.
- Document live vs test Stripe webhook gateway URLs.

## [0.10.50] - 2026-08-14

- Fix Resend domain **Make default** and **Remove** actions in Settings (empty POST body and inline remove confirmation).
- Only send `Content-Type: application/json` when the request has a body so DELETE calls are not rejected with 400.

## [0.10.49] - 2026-08-14

- Settings Resend domains: list, edit, make default, add, and remove connected domains.
- PATCH API for sender identity, API key rotation, and webhook secret updates.
- Webhook URL shown per domain for Resend receiving setup.

## [0.10.48] - 2026-08-14

- Personal BCC email tracking addresses now use each organization's default
  verified Resend domain instead of a platform-wide inbound domain.
- Tracking addresses are created only after an organization connects Resend;
  Settings explains the requirement for admins and members.
- Removed `EMAIL_TRACKING_DOMAIN` platform configuration.

## [0.10.47] - 2026-08-13

- Soft `/api/v1/me` refresh no longer tears down a loaded CRM shell on timeout.
- Slimmed Development E2E smoke to login + Contacts/Companies for a reliable
  promotion gate (full route matrix and contact-create stay out of the gate).

## [0.10.46] - 2026-08-13

- AuthGate loads `/api/v1/me` immediately via cookie session instead of waiting
  forever for a Hexclave bearer header (which left Development E2E stuck on
  “Loading workspace…”).
- Smoke navigates CRM routes through the sidebar when possible and waits for
  Development `/health` before Playwright starts.
- Recorded Production tip ancestry into Development for the promotion
  up-to-date gate (`docs/operations/BRANCH_RECONCILIATION_TWI-335.md`).

## [0.10.45] - 2026-08-13

- AuthGate waits for the Hexclave authorization header before calling `/api/v1/me`,
  so full reloads no longer stick on “Loading workspace…”.
- Development E2E smoke now runs only `crm.spec.ts` (Playwright no longer receives
  a bare `--` that ignored the file filter and also executed signup).

## [0.10.44] - 2026-08-13

- Hardened Development E2E smoke for Kanban: longer timeouts, shell readiness
  waits, and split signup/Stripe into a separate non-promotion job so release
  evidence tracks authenticated CRM coverage.

## [0.10.43] - 2026-08-13

- Updated Development E2E smoke for Kanban-default Contacts/Companies so route
  coverage no longer waits on `networkidle` and created contacts are asserted on
  the board after dialog close.

## [0.10.42] - 2026-08-13

- Fixed Contacts list/company search failing with ambiguous SQL in the
  association exists-subquery (Companies list was unaffected).
- Stopped Contacts Kanban from eagerly loading the property manager; fields load
  only for list columns, create, or Manage fields.

## [0.10.41] - 2026-08-13

- Kept the CRM shell visible while soft-refreshing `/api/v1/me` on route changes
  instead of flashing “Loading workspace…”.
- Split Contacts property loading from list loading and added list busy states for
  Contacts and Companies.
- Fixed Kanban search so aborted reloads clear Loading, contact boards match
  company names, and Clear resets the applied filter.

## [0.10.40] - 2026-08-13

- Stopped Companies/Contacts Kanban from reloading twice when the default system
  board view is selected, aborted stale loads, and batched lane counts /
  company contact counts for faster first paint.

## [0.10.39] - 2026-08-13

- Allowed system default board view ids (`system-contact-board`,
  `system-company-board`) on Kanban counts, cards, and move request validation.

## [0.10.38] - 2026-08-13

- Fixed Companies Kanban lane queries failing when counting associated contacts
  because Drizzle dropped table qualifiers inside the `contactCount` subquery.

## [0.10.37] - 2026-08-13

- Made Kanban the default Contacts and Companies experience, with tables retained at `?view=list`.
- Added company `lifecycle_stage`, board/view preference APIs, cursor-paged lane cards, and versioned board moves that merge a single property when grouping on JSON fields.
- Added `PATCH /api/v1/companies/:id` with optimistic concurrency and property history.
- Moved contact and company creation into accessible dialogs and added pointer/keyboard drag plus Move to… on cards.

## Unreleased

- Added repository-enforced development-first promotion, required PR evidence,
  CODEOWNERS coverage, and production-source validation.
- Added migration manifest/checksum validation, regional schema preflight and
  postflight checks, protected migration execution, and migration receipts.
- Reconciled all six regional migration ledgers to 13 canonical entries and
  added an idempotent repair for the missing Production UK Resend verification
  column.
- Added consent-gated Microsoft Clarity instrumentation to the landing site
  and CRM application.

## [0.10.36] - 2026-08-12

- Aligned the Drizzle migration ledger sequence with its highest recorded ID
  before applying migrations, repairing legacy reconciliation metadata that
  caused duplicate primary keys on the next migration receipt.
- Preserved first-run database initialization by applying the sequence repair
  only when the Drizzle migration ledger already exists.

## [0.10.34] - 2026-08-12

- Restored the Windows command shell only for `pnpm.cmd` regional migration
  calls while keeping direct Node and Linux execution shell-free.

## [0.10.33] - 2026-08-12

- Replaced Drizzle Kit's opaque migration subprocess with the application
  migrator so protected regional runs preserve actionable PostgreSQL errors.
- Disabled unnecessary shell invocation in the regional runner, including the
  Windows path-splitting failure observed during local validation.
- Preserved the documented root `.env` loading behavior for local migrations.

## [0.10.32] - 2026-08-12

- Added a forward-only RLS enforcement migration so databases with the legacy
  billing migration ledger cannot skip tenant-isolation policies.
- Allowed protected regional migrations to resume a partially completed
  rollout while rejecting divergent ledgers and same-level schema drift.
- Preserved all CRM navigation links in a horizontally scrollable mobile
  navigation bar.

## [0.10.31] - 2026-08-12

- Recorded the protected release approval chain for TWI-187 so the final
  Development push, CODEOWNER approval, and merge are performed by distinct
  policy-compliant identities before Production promotion.

## [0.10.30] - 2026-08-12

- Normalized the hosted CRM base URL before opening Contacts in signup E2E and
  expanded the test budget to include the full billing-settlement window.

## [0.10.29] - 2026-08-12

- Kept the returned CRM page mounted while waiting for billing settlement so
  hosted E2E no longer resets application bootstrap with repeated navigation.
- Extended the mounted billing page's Stripe-confirmation refresh window to
  cover the full 60-second promotion gate.

## [0.10.28] - 2026-08-12

- Completed Stripe's visible postal-code requirement and disabled optional
  Link enrollment in hosted checkout E2E before submitting the trial.

## [0.10.27] - 2026-08-12

- Replaced the Stripe post-submit timer with an explicit return transition and
  hosted billing polling so CI waits for checkout and webhook settlement.
- Bound each regional Render API to its public browser origin and made hosted
  startup fail closed when Stripe callbacks would resolve to localhost.

## [0.10.26] - 2026-08-12

- Made Stripe Card selection use verified radio-check semantics when Checkout's
  styled accordion intercepts pointer clicks on the underlying input.

## [0.10.25] - 2026-08-12

- Updated hosted Stripe Checkout E2E to select the visible Card payment-method
  radio when card fields are collapsed, avoiding Stripe's hidden helper button.

## [0.10.24] - 2026-08-12

- Hardened the Gitleaks security-gate installer with HTTP retries and upstream
  checksum verification after repeated release-asset transport failures.

## [0.10.23] - 2026-08-12

- Made hosted Stripe Checkout E2E handle both collapsed and already-expanded
  card payment states, including delayed UI rendering, without weakening the
  required signup journey.

## [0.10.22] - 2026-08-12

- Made authenticated route/contact smoke tests report a setup-gated persistent
  test account as skipped instead of waiting for controls that cannot render.
- Updated hosted Stripe Checkout automation to address card fields by their
  accessible names while ignoring duplicate express-payment iframes.

## [0.10.21] - 2026-08-12

- Hardened the protected Development E2E promotion gate to wait for Hexclave
  authentication to settle before authenticated navigation begins.
- Updated the Stripe Checkout journey to open the current card-payment form
  before filling its secure payment fields.

## [0.10.20] - 2026-08-12

- Reconciled the legacy Production branch ancestry into Development through the
  protected pull-request workflow without changing application behavior or
  copying environment-specific Development configuration into Production.
- Documented the branch-divergence cause, conflict resolution, verification
  gates, promotion sequence, and rollback boundary for TWI-187.

## [0.10.19] - 2026-08-12

- Replaced the visible Twiniti application mark with the supplied Loop logo
  across the CRM, compact sidebar, landing site, footer, and favicon.
- Retained automatic light/dark logo selection and documented Loop as the sole
  visible product lockup.

## [0.10.18] - 2026-08-11

- Added the supplied Loop light- and dark-mode logo lockups alongside the
  existing Twiniti application mark, with automatic theme selection and a
  compact mobile sidebar treatment.
- Clarified the required bot-push and CODEOWNER-approval identity separation
  for protected pull requests.

## [0.10.17] - 2026-08-06

- Separated landing-page and regional CRM URLs in E2E configuration.
- Corrected development landing links to point to development regional applications.

## [0.10.16] - 2026-08-06

- Added Playwright end-to-end coverage for login, workspace gates, authenticated CRM routes, and contact creation.
- Added scheduled and manual GitHub Actions execution with protected environment credentials and failure artifacts.
- Added the global Stripe billing gateway service and regional webhook forwarding contract.
- Added repeatable automated new-user signup coverage with generated test identities per run.

## [0.10.14] - 2026-08-06

- Fixed checkout recovery so expired Stripe sessions are replaced with a fresh secure checkout session.

## [0.10.13] - 2026-08-05

- Added organization-scoped Resend domains with encrypted per-domain credentials and default-domain selection.
- Removed global Resend delivery fallback; email sends now fail closed without an active verified organization domain.

## [0.10.12] - 2026-08-05

- Added a global Super Admin commercial-health dashboard across US, UK, and EU data stores.
- Added organization, user, agent, company, contact, trial, paid, license, and attention KPIs with billing/trial filtering.
- Added organization-level trial conversion and License_API synchronization visibility.
- Added pooled/request-scoped tenant RLS infrastructure and worker service contexts.
- Added fail-closed PostgreSQL row-level security policies for organization-scoped tables.
- Added `withOrganizationRls` to establish an organization and authenticated-member context for a transaction.

Twiniti CRM is currently pre-1.0. Versions use the `0.10.x` series while the product, deployment model, commercial rules, and agent contracts continue to mature. This history was reconstructed from the repository's Git commits and release work through 2026-08-05.

## [0.10.11] - 2026-08-05

- Applied and documented the regional production billing-trial migration after missing `organization_billing` columns caused authenticated `/api/v1/me` and report requests to return HTTP 500.
- Added production troubleshooting guidance for pending billing displays, schema drift, and the non-blocking browser `unload` permissions-policy warning.

## [0.10.10] - 2026-08-05

- Gated CRM access on confirmed Stripe billing and License_API allow decisions.
- Added seven-day and three-month trial classification, Stripe trial metadata, and trial-to-active conversion tracking.
- Added bounded post-Checkout confirmation polling and billing recovery messaging.

## [0.10.9] - 2026-08-05

- Fixed the production Hexclave project mismatch that caused valid browser sessions to receive API 401 responses.
- Added fail-closed startup validation requiring matching browser/server project IDs and a valid server auth configuration.

## [0.10.8] - 2026-08-05

- Added non-blocking Hexclave authorization headers to browser API requests so production custom domains do not depend on cookie delivery alone.
- Enforced License_API-backed `TCRM_AGENT_ACCESS` decisions with idempotent agent provision/revoke jobs.
- Persisted agent license decisions while keeping scopes controlled by Loop and avoiding a concurrency entitlement.

## [0.10.7] - 2026-08-04

- Added managed agent scope selection and organization-scoped updates for existing agents.
- Added a copy-ready regional MCP agent connection guide with credentials, scopes, requests, and troubleshooting.
- Added the in-app Help menu, `/help` page, and first end-user workflow guides.
- Added an explicit Super Admin workspace selector with regional context persistence and server-side validation.
- Allowed Super Admin workspaces to bypass the client billing redirect in line with the API policy.
- Replaced the hand-rolled MCP JSON-RPC handler with the official stateless Streamable HTTP transport and contract tests.

## [0.10.6] - 2026-08-03 to 2026-08-04

- Added regional landing-page sign-in and sign-up choices for US, EU, and UK Loop sites.
- Fixed the public Loop sign-in build configuration and documented required Vite-safe Hexclave variables.
- Added consent-aware GA4 page-view tracking for the landing page and CRM application.
- Aligned analytics configuration with the supplied Google tag and supported the existing local `Google_Analytics` variable alias.
- Added a static landing service per environment, supplied Twiniti logos, and refined product messaging.

## [0.10.5] - 2026-08-03

- Added immutable country-to-region assignment for EU, UK, and US workspaces.
- Added residency fields, regional migration synchronization, onboarding country selection, and region metadata in health, identity, and organization responses.
- Added explicit Development/Production database selection and three regional API services plus a multi-region worker per Render environment.
- Corrected deployment readiness checks to use `DEPLOYMENT_ENV` and aligned production Render configuration.
- Added recurring Twiniti Security scanning workflow updates.

## [0.10.4] - 2026-07-31 to 2026-08-02

- Added tenant-safe self-serve billing and MCP license lookup.
- Added Stripe trials and customer-entered promotion codes, commercial licensing integration, expired-subscription recovery state, and CRM License API deployment configuration.
- Fixed billing checkout request handling, forgot-password routing, and direct sign-out.
- Loaded the repository root environment for database migrations and remediated dependency vulnerabilities.

## [0.10.3] - 2026-07-27

- Added contact-field archive and delete flows.
- Improved contact UI and development authentication bootstrapping.
- Hardened customer import job processing, including timeout handling.

## [0.10.2] - 2026-07-24 to 2026-07-25

- Added contact email activity, identity tracking, and field history.
- Simplified contacts to a single CSV import flow.
- Added company imports, import history, company browsing, CRM list pagination, and filtering.
- Canonicalized contact-to-company matching during imports.

## [0.10.1] - 2026-07-23

- Added the Twiniti Loop CRM foundation and schema-driven HubSpot contact-property import UI.
- Added Hexclave landing-gate authentication, same-origin sign-in, sign-out, SPA client-route serving, and publishable client-key support.
- Added the initial agent-native CRM foundation, Render deployment configuration, and React app serving.
- Updated Drizzle ORM and established the open-source application foundation.

## [0.10.0] - 2026-07-23

- Established the initial Twiniti CRM repository and application baseline.

## Versioning notes

- `0.10.x` denotes active pre-1.0 development; it is not a promise of API stability or production feature completeness.
- Patch releases record focused fixes and security/deployment corrections; minor `0.10.x` increments group coherent product milestones.
- `1.0.0` remains reserved for a later release decision after the core product, contracts, operations, and documentation are sufficiently stable.
# Unreleased

- Confirmed production landing redirects for US, EU, and UK application sign-in/signup entry points.
- Added a seven-day trial days-remaining indicator to the authenticated billing page.
- Removed the legacy `VITE_APP_URL` landing override that could send US auth links to Render's `onrender.com` host.
