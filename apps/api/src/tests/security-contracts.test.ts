import assert from "node:assert/strict";
import test from "node:test";
import { assertProductionApiConfiguration, loadEnv } from "@twiniti/config";
import { agentIdentitySchema, segmentSearchSchema } from "@twiniti/contracts";

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
