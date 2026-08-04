# Twiniti Loop agent licensing

Twiniti Loop uses two authorization layers:

1. License_API decides whether the organization and agent are entitled to use Loop agents.
2. Twiniti CRM decides which tools the agent may call through its scoped credential.

An agent is allowed only when all of these conditions are true:

- The organization has an active Twiniti Loop license.
- The license has the enabled `TCRM_AGENT_ACCESS` entitlement.
- License_API has an active assignment for the Twiniti `agent_id`.
- The Loop agent credential is valid and has the required tool scope.

Agent assignments are separate from human `license_users` seats. Concurrency is not used.

## Lifecycle

- Creating an agent queues `license.agent.provision`.
- Updating an agent's scopes also re-queues idempotent agent provisioning.
- Revoking an agent queues `license.agent.revoke`; local credential revocation is immediate.
- Existing agents can be re-queued by an admin with `POST /api/v1/agents/:id/license/provision`.

The License_API integration routes are:

```text
POST /api/v1/integrations/twiniti-crm/agent/provision
POST /api/v1/integrations/twiniti-crm/agent/revoke
POST /api/v1/integrations/twiniti-crm/license/check
```

The browser never receives the License_API API key. MCP tool scopes such as `contacts:read` remain managed on the Loop Agents page and are independent of the product entitlement.
