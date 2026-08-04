# Twiniti Loop agent connection guide

This guide is for an AI agent or integration that needs to use Twiniti Loop
through MCP. The hosted MCP service is remote Streamable HTTP. There is no
stdio launcher in this phase.

## 1. Choose the regional endpoint

Use the endpoint that owns the workspace's data:

| Region | MCP endpoint |
|---|---|
| US | `https://loop.us.twiniti.ai/mcp` |
| EU | `https://loop.eu.twiniti.ai/mcp` |
| UK | `https://loop.uk.twiniti.ai/mcp` |

Do not use a different region to reach a workspace. The agent credential and
the data boundary are regional.

For local development, use `http://localhost:4000/mcp` after starting the API.
When local `AUTH_DISABLED=true` is enabled, the API supplies its bootstrap
owner context. Production and hosted development services require a valid
agent credential.

## 2. Obtain a scoped agent credential

A company admin creates an agent from the workspace's **Agents** page. The
credential is shown only once. Store it in a secret manager and never put it
in source code, browser code, tickets, prompts, or documentation.

Admins can update the scopes of an existing active agent later without
changing its credential. The Agents page uses **Edit access**; access changes
take effect on the next request made with that credential.

Grant only the scopes required by the integration. Examples include:

- `contacts:read` — search, retrieve, and read contact timelines
- `contacts:create` — create contacts
- `contacts:update` — update or upsert contacts
- `segments:read` — read saved segments
- `campaigns:create` — create campaign drafts
- `campaigns:preview` — preview campaigns
- `campaigns:request_approval` — request campaign approval
- `reports:read` — read reports

The credential is organization-bound. An agent does not choose an organization
with a header or query parameter, and it cannot cross the organization or
regional boundary of its credential. Revoke it from the Agents page if it is
retired or exposed.

## 3. Configure the MCP client

For every request, send:

```text
Authorization: Bearer twiniti_agent_<token>
Content-Type: application/json
Accept: application/json, text/event-stream
MCP-Protocol-Version: 2025-06-18
```

The service is stateless JSON response mode. Do not depend on an
`Mcp-Session-Id`, and do not start a local stdio process.

## 4. Initialize and discover tools

The first JSON-RPC request should be `initialize`:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-06-18",
    "capabilities": {},
    "clientInfo": {
      "name": "my-agent",
      "version": "1.0.0"
    }
  }
}
```

Then discover the tools available to the credential:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/list"
}
```

The server's `tools/list` response is authoritative. An agent must not assume
that a tool is available merely because it appears in an older prompt or
integration configuration.

## 5. Call a tool

Example request to search contacts in the authenticated workspace:

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "search_contacts",
    "arguments": {
      "query": "acme",
      "limit": 25,
      "page": 1
    }
  }
}
```

The current tool catalog includes contact, segment, campaign, resource, and
prompt capabilities. Each tool declares the scope it requires; calls without
that scope fail closed.

## 6. Minimal command-line check

Replace the placeholder token and choose the correct regional URL:

```powershell
$mcpUrl = "https://loop.us.twiniti.ai/mcp"
$token = $env:TWINITI_AGENT_TOKEN

$headers = @{
  Authorization = "Bearer $token"
  Accept = "application/json, text/event-stream"
  "MCP-Protocol-Version" = "2025-06-18"
}

$body = @{
  jsonrpc = "2.0"
  id = 1
  method = "initialize"
  params = @{
    protocolVersion = "2025-06-18"
    capabilities = @{}
    clientInfo = @{ name = "connectivity-check"; version = "1.0.0" }
  }
} | ConvertTo-Json -Depth 8

Invoke-RestMethod -Method Post -Uri $mcpUrl -Headers $headers -ContentType "application/json" -Body $body
```

An unauthenticated health check is also available at the matching API host:

```text
GET https://twiniti-crm-prod-us.onrender.com/health
```

It should return `status: "ok"` and the expected regional `regionCode`.

## Troubleshooting

- `401 Unauthorized`: the bearer token is missing, mistyped, expired, or revoked.
- `403 Forbidden`: the credential lacks the requested tool scope, or a browser
  request supplied an untrusted `Origin` header.
- `402 Organization billing is required`: the organization must complete billing
  before non-platform agent access is enabled.
- `404` or connection failure: confirm the regional host and `/mcp` path.
- A Super Admin's `X-Twiniti-Workspace-Id` header is for the human browser
  console only. It is not an agent authentication mechanism and should not be
  sent by machine clients.

Agents must use the public API/MCP surface and must never connect directly to
Neon PostgreSQL.
