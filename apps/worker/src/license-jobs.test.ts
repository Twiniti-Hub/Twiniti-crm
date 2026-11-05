import test from "node:test";
import assert from "node:assert/strict";
import { licenseJobHandlers } from "./license-jobs.js";
import { LicenseApiClient, buildSubscriptionState, type LicenseVerification } from "@twiniti/license-api";
import type { AppEnv } from "@twiniti/config";
import type { Db } from "@twiniti/db";

const env = {
  LICENSE_API_URL: "https://license.test", LICENSE_API_API_KEY: "test", LICENSE_API_REQUIRED: true,
  LICENSE_API_PRODUCT_CODE: "loop", LICENSE_API_PLAN_CODE: "standard", LICENSE_API_REQUEST_TIMEOUT_MS: 1000,
  LICENSE_API_CACHE_TTL_MS: 1000, LICENSE_API_PROVISION_PATH: "/provision", LICENSE_API_SYNC_PATH: "/sync",
  LICENSE_API_CHECK_PATH: "/check", LICENSE_API_GRACE_PERIOD_DAYS: 7
} as AppEnv;

for (const workspaceKind of ["personal", "company"]) test(`${workspaceKind} trial recovers missing initial provisioning, syncs, and saves identities`, async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  const ids: Record<string, unknown>[] = [];
  let verification: LicenseVerification | null = null;
  let queued = 0;
  let provisioned = false;
  let checks = 0;
  const billing = { organizationId: "org", status: "trialing", stripeSubscriptionId: "sub", stripeCustomerId: "cus", stripePriceId: "price", trialKind: "seven_day", trialStart: new Date(), trialEnd: new Date(Date.now() + 86400000), stripePromotionCodeId: null, stripeCouponId: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, createdAt: new Date(), lastStripeEventCreatedAt: new Date() };
  const deps = {
    getLicensePrincipal: async () => ({ id: "user", organizationId: "org", hexclaveSubject: "subject", email: "user@example.test", displayName: "User", licenseVerification: verification }),
    getOrganizationById: async () => ({ id: "org", name: "Workspace", workspaceKind }),
    getOrganizationBilling: async () => billing,
    listOrgMembers: async () => [{ id: "user", role: "admin", active: true }],
    saveLicenseVerification: async (_db: Db, org: string, user: string, value: LicenseVerification) => { assert.equal(org, "org"); assert.equal(user, "user"); verification = value; },
    updateOrganizationLicense: async (_db: Db, org: string, value: Record<string, unknown>) => { assert.equal(org, "org"); ids.push(value); },
    enqueueLicenseVerification: async () => { queued++; }
  } as unknown as NonNullable<Parameters<typeof licenseJobHandlers>[2]>;
  globalThis.fetch = async (url, init) => {
    const path = new URL(String(url)).pathname;
    calls.push(path);
    const body = JSON.parse(String(init?.body));
    assert.equal(body.externalOrganizationId, "org");
    if (path === "/provision") {
      provisioned = true;
      assert.equal(body.externalUserId, "user");
      assert.equal(body.userSubject, "subject");
      assert.equal(new Headers(init?.headers).get("idempotency-key"), "organization-user-provision:org:user");
      return Response.json({ data: { organization: { id: "lh-org" }, user: { id: "lh-user" }, license: { id: "lh-license" } } });
    }
    if (path === "/sync") {
      if (!provisioned) return Response.json({ error: { code: "LICENSE_OR_USER_NOT_FOUND" } }, { status: 404 });
      assert.equal(body.normalizedState, "trialing"); return Response.json({ data: {} });
    }
    if (++checks === 1) return Response.json({ data: { decision: "deny", reasonCode: "LICENSE_OR_USER_NOT_FOUND" } });
    return Response.json({ data: { decision: "allow", reasonCode: "LICENSE_VALID", organizationId: "lh-org", userId: "lh-user" } });
  };
  try {
    const handlers = licenseJobHandlers({} as Db, env, deps, new LicenseApiClient(env));
    await handlers.sync({ ...buildSubscriptionState(billing, { eventId: "evt", eventCreatedAt: new Date(), gracePeriodDays: 7 }), idempotencyKey: "evt" });
    assert.deepEqual(calls, ["/provision", "/sync"]);
    assert.equal(queued, 1);
    assert.equal(ids[0].licenseOrganizationId, "lh-org");
    assert.equal(ids[0].licenseUserId, "lh-user");
    await handlers.verify("org", "user");
    assert.equal(checks, 2);
    assert.deepEqual(calls.slice(-3), ["/check", "/provision", "/check"]);
    assert.equal((verification as unknown as LicenseVerification).check?.decision, "allow");
    assert.equal((verification as unknown as LicenseVerification).failureReason, null);
    const confirmed = (verification as unknown as LicenseVerification).checkedAt;
    globalThis.fetch = async () => { throw new Error("service cold"); };
    await assert.rejects(handlers.verify("org", "user"), /LICENSE_API_UNAVAILABLE/);
    assert.equal((verification as unknown as LicenseVerification).checkedAt, confirmed);
    assert.equal((verification as unknown as LicenseVerification).failureReason, "LICENSE_API_UNAVAILABLE");
  } finally { globalThis.fetch = originalFetch; }
});
