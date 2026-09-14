# Agents and API access

The **Agents** page is for machine users and integrations. Create an agent with the minimum scope required by its job, then copy its credential at creation time and store it in a secure secret manager.

Revoke a credential from the same page when an integration is retired or a secret may have been exposed. Do not paste agent credentials into browser code, tickets, documentation, or source control.

Agent clients use the regional HTTPS MCP endpoint configured for the workspace. They should authenticate with the bearer credential and use the tools exposed by the server.

Agent access follows the same billing boundary as human CRM access. A missing or pending Stripe subscription is not an active license; agents must wait for License_API to return an allow decision after the organization enters a valid trial or paid state.

## Planned evolution: digital workers

The current Agents page manages machine identities, credentials, and scopes. A planned Digital Workers layer will add named roles, owners, missions, run history, policies, budgets, approvals, and evaluations without changing the fact that credentials remain revocable authentication principals.

The first worker is a supervised Relationship Steward. Its initial Attention view produces evidence-backed relationship profiles and signals for review; it does not send external communications autonomously. Users will be able to inspect source evidence and approve, edit, dismiss, or defer proposals as the rollout expands.

See the implementation plans for [Digital Workers](../architecture/digital-workers-platform-plan.md) and the [Relationship Steward](../architecture/relationship-steward-agent-plan.md). The `/attention` supervision surface is in staged development; worker generation and side-effect execution are not yet generally available.

