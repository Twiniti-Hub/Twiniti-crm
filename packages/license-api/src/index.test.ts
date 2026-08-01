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
  LICENSE_API_SYNC_PATH: "/sync",
  LICENSE_API_CHECK_PATH: "/check",
  LICENSE_API_REQUIRED: true
} as const;

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
