import assert from "node:assert/strict";
import test from "node:test";
import { getRequestedWorkspaceId, WORKSPACE_CONTEXT_HEADER } from "@twiniti/auth";
import { assertProductionApiConfiguration, loadEnv } from "@twiniti/config";
import { agentIdentitySchema, segmentSearchSchema, updateAgentIdentitySchema } from "@twiniti/contracts";

test("agent credentials cannot request an unrestricted wildcard scope", () => {
  assert.throws(() => agentIdentitySchema.parse({
    name: "unsafe-agent",
    purpose: "test",
    scopes: ["*"],
    expiresAt: null
  }));
});

test("segment lookup contract defaults to a bounded result set", () => {
  assert.deepEqual(segmentSearchSchema.parse({}), { limit: 100 });
  assert.throws(() => segmentSearchSchema.parse({ limit: 101 }));
});

test("production configuration fails closed without auth and Stripe", () => {
  const env = loadEnv({
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://example.invalid/db",
    AUTH_DISABLED: "true"
  });
  assert.throws(() => assertProductionApiConfiguration(env));
});

test("workspace context accepts only UUID headers", () => {
  assert.equal(getRequestedWorkspaceId({ [WORKSPACE_CONTEXT_HEADER]: "not-a-workspace" }), undefined);
  assert.equal(
    getRequestedWorkspaceId({ [WORKSPACE_CONTEXT_HEADER]: "550e8400-e29b-41d4-a716-446655440000" }),
    "550e8400-e29b-41d4-a716-446655440000"
  );
});

test("agent scope updates require at least one supported scope", () => {
  assert.deepEqual(updateAgentIdentitySchema.parse({ scopes: ["contacts:read"] }), {
    scopes: ["contacts:read"]
  });
  assert.throws(() => updateAgentIdentitySchema.parse({ scopes: [] }));
  assert.throws(() => updateAgentIdentitySchema.parse({ scopes: ["contacts:delete"] }));
  assert.deepEqual(agentIdentitySchema.parse({
    name: "reader",
    purpose: "Read contacts",
    scopes: ["contacts:read"],
    expiresAt: null
  }).scopes, ["contacts:read"]);
});
