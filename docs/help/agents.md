# Agents and API access

The **Agents** page is for machine users and integrations. Create an agent with the minimum scope required by its job, then copy its credential at creation time and store it in a secure secret manager.

Revoke a credential from the same page when an integration is retired or a secret may have been exposed. Do not paste agent credentials into browser code, tickets, documentation, or source control.

Agent clients use the regional HTTPS MCP endpoint configured for the workspace. They should authenticate with the bearer credential and use the tools exposed by the server.

Agent access follows the same billing boundary as human CRM access. A missing or pending Stripe subscription is not an active license; agents must wait for License_API to return an allow decision after the organization enters a valid trial or paid state.

