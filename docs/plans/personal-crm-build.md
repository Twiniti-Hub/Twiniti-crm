# Personal CRM build

**Linear:** TWI-1026. **Application version:** 0.10.55. **Documentation revision:** 0.10.55.3.

The first slice gives personal workspaces a relationship-focused menu and redirects direct browser visits to company Growth, digital workforce, and deliverability pages. Company workspaces retain their current navigation. The personal Overview and existing import page remain shared until dedicated personal screens are built.

The user-facing personal product direction is recorded in the CRM project's Linear memory: Google OAuth; bounded email history (60 days discussed); three user-initiated LinkedIn snapshot imports for contacts, following and followers; a weekly news feed refreshed at 11am in the user's local timezone; $9 monthly or $6 with membership in any organization; responsive web. Source availability, email content retention, agent write policy, and news ingestion need further decisions and feasibility work.

Agent implementation note: UI navigation and route guards are presentation boundaries only. Before shipping personal feature restrictions, enforce workspace-kind policy in the API, MCP tools, and background workers. Personal marketing records and existing scheduled jobs need an explicit migration and access decision. Do not treat this first slice as completing those protections.

Verification: web typecheck was attempted but Corepack could not reach the npm registry to download pnpm 10.17.1 in this environment.
