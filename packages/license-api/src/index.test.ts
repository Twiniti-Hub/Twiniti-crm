import assert from "node:assert/strict";
import test from "node:test";
import { LicenseApiClient } from "./index.js";

const config = {
  LICENSE_API_URL: "https://license.example.test",
  LICENSE_API_API_KEY: "test-key",
  LICENSE_API_PRODUCT_CODE: "twiniti-loop",
  LICENSE_API_PLAN_CODE: "standard",
  LICENSE_API_REQUEST_TIMEOUT_MS: 1_000,
  LICENSE_API_CACHE_TTL_MS: 15_000,
  LICENSE_API_PROVISION_PATH: "/provision",
  LICENSE_API_AGENT_PROVISION_PATH: "/agent/provision",
  LICENSE_API_AGENT_REVOKE_PATH: "/agent/revoke",
  LICENSE_API_SYNC_PATH: "/sync",
  LICENSE_API_CHECK_PATH: "/check",
  LICENSE_API_REQUIRED: true
} as const;

test("preserves upstream error codes and explicit revocations, rejecting false success envelopes", async () => {
  const originalFetch = globalThis.fetch;
  const input = { externalOrganizationId: "org", externalUserId: "user", productCode: "loop", source: "twiniti-crm" as const };
  try {
    for (const [code, status, expected] of [["LICENSE_OR_USER_NOT_FOUND", 404, "retry"], ["LICENSE_REVOKED", 403, "deny"], ["UPSTREAM_TIMEOUT", 503, "retry"]] as const) {
      globalThis.fetch = async () => Response.json({ error: { code, message: "failed" }, requestId: "request-1" }, { status });
      const result = await new LicenseApiClient(config).checkUserLicense(input, { fresh: true });
      assert.equal(result.reasonCode, code);
      assert.equal(result.decision, expected);
      assert.equal(result.requestId, "request-1");
      assert.equal(result.httpStatus, status);
    }
    globalThis.fetch = async () => Response.json({ success: false, error: { code: "PROVISION_FAILED", message: "Not created" } });
    await assert.rejects(new LicenseApiClient(config).provisionOrganization({ externalOrganizationId: "org", organizationName: "Org", externalUserId: "user", userSubject: "subject", productCode: "loop", planCode: "standard", source: "twiniti-crm" }, "key"), /Not created/);
    globalThis.fetch = async () => new Response("not-json", { status: 502 });
    const invalid = await new LicenseApiClient(config).checkUserLicense(input);
    assert.equal(invalid.reasonCode, "LICENSE_API_INVALID_RESPONSE");
    assert.equal(invalid.httpStatus, 502);
  } finally { globalThis.fetch = originalFetch; }
});

test("normalizes an organization-aware license decision and sends server headers", async () => {
  const originalFetch = globalThis.fetch;
  let request: { url: string; headers: Headers; body: Record<string, unknown> } | null = null;
  globalThis.fetch = async (input, init) => {
    request = {
      url: String(input),
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body)) as Record<string, unknown>
    };
    return new Response(JSON.stringify({
      success: true,
      data: {
        decision: "ALLOW",
        reasonCode: "OK",
        organizationId: "lic-org-1",
        userId: "lic-user-1",
        license: { id: "lic-1", status: "Active", endDate: "2030-01-01T00:00:00.000Z" }
      }
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const client = new LicenseApiClient(config);
    const result = await client.checkUserLicense({
      externalOrganizationId: "crm-org-1",
      externalUserId: "crm-user-1",
      userSubject: "hex-user-1",
      email: "admin@example.com",
      productCode: "twiniti-loop",
      source: "twiniti-crm"
    });
    assert.equal(result.decision, "allow");
    assert.equal(result.licenseId, "lic-1");
    const captured = request as unknown as { url: string; headers: Headers; body: Record<string, unknown> };
    assert.equal(captured.url, "https://license.example.test/check");
    assert.equal(captured.headers.get("x-api-key"), "test-key");
    assert.equal(captured.headers.get("x-client-app"), "twiniti-crm");
    assert.equal(captured.headers.get("idempotency-key"), "license-check:crm-org-1:crm-user-1:twiniti-loop");
    assert.equal(captured.body.externalOrganizationId, "crm-org-1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("checks agent access with an explicit principal type", async () => {
  const originalFetch = globalThis.fetch;
  let request: { url: string; headers: Headers; body: Record<string, unknown> } | null = null;
  globalThis.fetch = async (input, init) => {
    request = {
      url: String(input),
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body)) as Record<string, unknown>
    };
    return new Response(JSON.stringify({
      success: true,
      data: {
        decision: "allow",
        reasonCode: "OK",
        organizationId: "crm-org-1",
        agentAccess: true,
        entitlements: [{ featureCode: "TCRM_AGENT_ACCESS", enabled: true }]
      }
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const client = new LicenseApiClient(config);
    const result = await client.checkAgentLicense({
      externalOrganizationId: "crm-org-1",
      externalAgentId: "crm-agent-1",
      productCode: "twiniti-loop",
      source: "twiniti-crm"
    });
    assert.equal(result.decision, "allow");
    assert.equal(result.agentAccess, true);
    const captured = request as unknown as { url: string; headers: Headers; body: Record<string, unknown> };
    assert.equal(captured.body.principalType, "agent");
    assert.equal(captured.body.externalAgentId, "crm-agent-1");
    assert.equal(captured.headers.get("idempotency-key"), "license-check:agent:crm-org-1:crm-agent-1:twiniti-loop");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("normalizes trial classification and Stripe subscription metadata", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    success: true,
    data: {
      decision: "allow",
      reasonCode: "OK",
      organizationId: "crm-org-1",
      licenseStatus: "Trial",
      trialKind: "three_month",
      trialStart: "2026-08-05T00:00:00.000Z",
      trialEnd: "2026-11-05T00:00:00.000Z",
      stripeSubscriptionId: "sub_123"
    }
  }), { status: 200, headers: { "content-type": "application/json" } });
  try {
    const result = await new LicenseApiClient(config).checkUserLicense({
      externalOrganizationId: "crm-org-1",
      externalUserId: "crm-user-1",
      productCode: "twiniti-loop",
      source: "twiniti-crm"
    });
    assert.equal(result.trialKind, "three_month");
    assert.equal(result.stripeSubscriptionId, "sub_123");
    assert.equal(result.licenseStatus, "Trial");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
