import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertLogOutboundEmailScopes,
  assertScope,
  hasScope,
  type AuthActor
} from "@twiniti/auth";
import { agentScopeSchema, logOutboundEmailSchema } from "@twiniti/contracts";
import { toolDefs } from "../mcp.js";

function agentActor(scopes: string[]): AuthActor {
  return {
    type: "agent",
    id: "agent-test",
    organizationId: "org-test",
    scopes
  };
}

describe("outbound email agent scopes", () => {
  it("accepts email_events:write in the agent scope contract", () => {
    assert.equal(agentScopeSchema.parse("email_events:write"), "email_events:write");
  });

  it("allows log_outbound_email when email write and contact upsert scopes are present", () => {
    const actor = agentActor(["email_events:write", "contacts:update"]);
    assert.doesNotThrow(() => assertLogOutboundEmailScopes(actor));
  });

  it("rejects log_outbound_email without email_events:write", () => {
    const actor = agentActor(["contacts:create", "contacts:update"]);
    assert.throws(
      () => assertLogOutboundEmailScopes(actor),
      (error: unknown) => error instanceof Error && error.message.includes("email_events:write")
    );
  });

  it("rejects log_outbound_email without contact create or update scope", () => {
    const actor = agentActor(["email_events:write"]);
    assert.throws(
      () => assertLogOutboundEmailScopes(actor),
      (error: unknown) => error instanceof Error && error.message.includes("contacts:update")
    );
  });

  it("rejects agent event ingest without email_events:write", () => {
    const actor = agentActor(["contacts:read"]);
    assert.throws(
      () => assertScope(actor, "email_events:write"),
      (error: unknown) => error instanceof Error && /Missing required scope/.test(error.message)
    );
  });

  it("validates log_outbound_email MCP input", () => {
    assert.deepEqual(logOutboundEmailSchema.parse({
      email: "alex@example.com",
      subject: "Follow up",
      mailbox: "sales@example.com",
      internetMessageId: "<msg@graph.microsoft.com>"
    }).email, "alex@example.com");
  });

  it("registers log_outbound_email in the MCP tool catalog", () => {
    const tool = toolDefs.find((item) => item.name === "log_outbound_email");
    assert.ok(tool);
    assert.equal(tool?.scope, "email_events:write");
  });

  it("treats wildcard scope as sufficient for email_events:write checks", () => {
    const actor = agentActor(["*"]);
    assert.equal(hasScope(actor, "email_events:write"), true);
    assert.doesNotThrow(() => assertLogOutboundEmailScopes(actor));
  });
});
