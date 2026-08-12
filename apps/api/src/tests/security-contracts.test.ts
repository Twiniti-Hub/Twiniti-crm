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

test("hosted configuration rejects a localhost browser origin", () => {
  const env = loadEnv({
    NODE_ENV: "production",
    DEPLOYMENT_ENV: "development",
    WEB_ORIGIN: "http://localhost:5173"
  });
  assert.throws(() => assertProductionApiConfiguration(env), /public WEB_ORIGIN/);
});

test("production configuration rejects a browser/server Hexclave project mismatch", () => {
  const env = loadEnv({
    NODE_ENV: "production",
    WEB_ORIGIN: "https://loop.example.invalid",
    DATABASE_URL: "postgresql://example.invalid/db",
    HEXCLAVE_PROJECT_ID: "server-project",
    HEXCLAVE_SECRET_SERVER_KEY: "server-secret",
    VITE_HEXCLAVE_PROJECT_ID: "browser-project",
    AUTH_DISABLED: "false",
    STRIPE_SECRET_KEY: "stripe-secret",
    STRIPE_WEBHOOK_SECRET: "stripe-webhook",
    STRIPE_PRICE_ID: "price_test",
    LICENSE_API_URL: "https://license.example.invalid",
    LICENSE_API_API_KEY: "license-key"
  });
  assert.throws(() => assertProductionApiConfiguration(env), /must match/);
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
