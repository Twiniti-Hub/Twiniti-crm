# Changelog

## Unreleased (target 0.1.1)

- Added immutable country-to-region assignment for EU, UK, and US workspaces.
- Added regional residency fields and the development migration synchronizer.
- Added country selection to account and company onboarding.
- Added region metadata to health, identity, and organization responses.
- Added explicit Development/Production database URL selection.
- Added three regional API services and one multi-region worker per Render environment.
- Fixed production-readiness checks to use `DEPLOYMENT_ENV`, allowing development services to run with `NODE_ENV=production` while selecting `Dev_*` databases.
