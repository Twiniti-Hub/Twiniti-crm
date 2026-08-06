# Changelog

## Unreleased

- Added repository-enforced development-first promotion, required PR evidence,
  CODEOWNERS coverage, and production-source validation.
- Added migration manifest/checksum validation, regional schema preflight and
  postflight checks, protected migration execution, and migration receipts.

## [0.10.15] - 2026-08-06

- Added Playwright end-to-end coverage for login, workspace gates, authenticated CRM routes, and contact creation.
- Added scheduled and manual GitHub Actions execution with protected environment credentials and failure artifacts.
- Added the global Stripe billing gateway service and regional webhook forwarding contract.

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
