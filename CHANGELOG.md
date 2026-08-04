# Changelog

## Unreleased (target 0.1.1)

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
