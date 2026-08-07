import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, describe, it } from "node:test";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer, isAllowedMcpOrigin } from "../mcp.js";
import type { AppEnv } from "@twiniti/config";

const env = {
  WEB_ORIGIN: "https://loop.us.twiniti.ai"
} as AppEnv;

const actor = {
  type: "user" as const,
  id: "mcp-test-user",
  organizationId: "mcp-test-org",
  isSuperAdmin: true
};

let url = "";
let httpServer: ReturnType<typeof createServer>;

before(async () => {
  httpServer = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : undefined;
    const server = createMcpServer(undefined as never, actor);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true
    });
    await server.connect(transport);
    await transport.handleRequest(request, response, body);
  });
  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const address = httpServer.address();
  if (!address || typeof address === "string") throw new Error("Test server did not expose a port");
  url = `http://127.0.0.1:${address.port}/mcp`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => httpServer.close((error) => error ? reject(error) : resolve()));
});

async function post(body: Record<string, unknown>) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-06-18"
    },
    body: JSON.stringify(body)
  });
  return { response, body: await response.json() as Record<string, any> };
}

describe("MCP Streamable HTTP transport", () => {
  it("returns a standard JSON response without creating a session", async () => {
    const { response, body } = await post({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "twiniti-test", version: "0.1.0" }
      }
    });

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /application\/json/);
    assert.equal(response.headers.get("mcp-session-id"), null);
    assert.equal(body.result.serverInfo.name, "twiniti-crm");
  });

  it("serves the tool catalog through the standard tools/list method", async () => {
    const { response, body } = await post({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    assert.equal(response.status, 200);
    assert.ok(body.result.tools.some((tool: { name: string }) => tool.name === "search_contacts"));
    assert.deepEqual(
      body.result.tools.filter((tool: { name: string }) => tool.name.endsWith("_company")).map((tool: { name: string }) => tool.name),
      ["get_company", "create_company", "update_company"]
    );
    assert.ok(body.result.tools.some((tool: { name: string }) => tool.name === "search_companies"));
  });

  it("allows configured browser origins and non-browser agent requests only", () => {
    assert.equal(isAllowedMcpOrigin(undefined, "https://api.example.test", env), true);
    assert.equal(isAllowedMcpOrigin("https://loop.us.twiniti.ai", "https://api.example.test", env), true);
    assert.equal(isAllowedMcpOrigin("https://attacker.example", "https://api.example.test", env), false);
  });
});
