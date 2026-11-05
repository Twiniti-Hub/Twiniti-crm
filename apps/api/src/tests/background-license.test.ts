import test from "node:test";
import assert from "node:assert/strict";
import { checkOrganizationLicense } from "@twiniti/auth";
import type { AppEnv } from "@twiniti/config";
import type { Db } from "@twiniti/db";

test("page authorization queues verification and returns a confirmed trial without calling LicenseHub", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("Request path must never call LicenseHub"); };
  const env = { LICENSE_API_REQUIRED: true, LICENSE_API_URL: "https://offline.invalid", LICENSE_API_API_KEY: "test", DEPLOYMENT_ENV: "production" } as AppEnv;
  let queued = 0;
  const deps = {
    getOrganizationBilling: async () => ({ status: "trialing", stripeSubscriptionStatus: "trialing", stripeSubscriptionId: "sub", trialStart: new Date(), trialEnd: new Date(Date.now() + 86400000), currentPeriodEnd: null }),
    getLicensePrincipal: async () => ({ id: "user", licenseVerification: null }),
    enqueueLicenseVerification: async (_db: Db, org: string, user: string) => { assert.equal(org, "org"); assert.equal(user, "user"); queued++; }
  } as unknown as NonNullable<Parameters<typeof checkOrganizationLicense>[4]>;
  try {
    const result = await checkOrganizationLicense({} as Db, env, { organizationId: "org", userId: "user" }, "trialing", deps);
    assert.equal(result.billingStatus, "trialing");
    assert.equal(result.warning?.accessContinues, true);
    assert.equal(queued, 1);
    const missing = await checkOrganizationLicense({} as Db, env, { organizationId: "org", userId: "other" }, "trialing", { ...deps, getLicensePrincipal: async () => null });
    assert.equal(missing.billingStatus, "license_denied");
    assert.equal(queued, 1);
  } finally { globalThis.fetch = originalFetch; }
});
