# Changelog

## Unreleased (target 0.1.1)

## [0.10.9] - 2026-08-05

- Fixed the production Hexclave project mismatch that caused valid browser sessions to receive API 401 responses.
- Added fail-closed startup validation requiring matching browser/server project IDs and a valid server auth configuration.

- Added License_API-backed `TCRM_AGENT_ACCESS` enforcement and idempotent agent provision/revoke jobs; agent scopes remain controlled by Loop and no concurrency entitlement is used.
- Replaced free-form agent scope text with a controlled multi-select and added organization-scoped access updates for existing agents.
- Added a copy-ready regional MCP agent connection guide with credential, scope, request, and troubleshooting examples.
- Super Admin workspace context bypasses the client billing redirect, matching the API's platform-admin billing policy.
- Added the first end-user help guide under `docs/help/`, covering the current CRM navigation and user workflows.
- Added an in-app Help menu item and `/help` page linking users to the main CRM workflows.
- Added non-blocking Hexclave authorization headers to browser API requests so production custom domains do not depend on cookie delivery alone.

- Added an explicit Super Admin workspace selector with regional context persistence and server-side workspace validation.
- Replaced the hand-rolled MCP JSON-RPC POST handler with the official SDK's stateless Streamable HTTP transport; stdio remains deferred.
- Added MCP transport contract tests for initialization, tool discovery, sessionless responses, and Origin validation.
- Fixed the public Loop sign-in entry path by declaring the Vite-safe Hexclave project and publishable client-key variables on all regional Render API builds.
- Added explicit US, EU, and UK choices for landing-page sign-in and sign-up redirects.
- Documented that the public Hexclave variables must be set before the web bundle is built and redeployed.
- Added immutable country-to-region assignment for EU, UK, and US workspaces.
- Added regional residency fields and the development migration synchronizer.
- Added country selection to account and company onboarding.
- Added region metadata to health, identity, and organization responses.
- Added explicit Development/Production database URL selection.
- Added three regional API services and one multi-region worker per Render environment.
- Fixed production-readiness checks to use `DEPLOYMENT_ENV`, allowing development services to run with `NODE_ENV=production` while selecting `Dev_*` databases.
- Added a separate environment-specific static landing service with product messaging and CRM sign-up/sign-in links.
- Applied the supplied Twiniti dark and light logo assets to the landing page and favicon.
- Refined the landing page proof-strip messaging to address the whole team.
- Added shared consent-aware GA4 page-view tracking for the landing page and CRM application.
- Accepted the existing local `Google_Analytics` variable as an alias for the Vite analytics configuration.
- Switched the deployed GA4 configuration to the supplied Google tag measurement ID.
