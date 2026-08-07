# Agents and API access

The **Agents** page is for machine users and integrations. Create an agent with the minimum scope required by its job, then copy its credential at creation time and store it in a secure secret manager.

Revoke a credential from the same page when an integration is retired or a secret may have been exposed. Do not paste agent credentials into browser code, tickets, documentation, or source control.

Agent clients use the regional HTTPS MCP endpoint configured for the workspace. They should authenticate with the bearer credential and use the tools exposed by the server.

For company registration integrations, grant the minimum company permissions needed:

- `companies:read` — search and retrieve companies
- `companies:create` — create a company when registration lookup finds no match
- `companies:update` — update an existing company record

Lexi Lite should search by the supplied company name or domain first, create only
when no active match exists, and use the returned company ID for later updates.

Agent access follows the same billing boundary as human CRM access. A missing or pending Stripe subscription is not an active license; agents must wait for License_API to return an allow decision after the organization enters a valid trial or paid state.

