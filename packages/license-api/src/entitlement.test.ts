import test from "node:test";
import assert from "node:assert/strict";
import { localEntitlement, recordVerification } from "./entitlement.js";

const now = Date.parse("2026-11-05T12:00:00Z");
const billing = { status: "trialing", stripeSubscriptionStatus: "trialing", stripeSubscriptionId: "sub_test", trialStart: new Date(now - 3600000), trialEnd: new Date(now + 6 * 86400000), currentPeriodEnd: null };
const allow = { decision: "allow" as const, reasonCode: "LICENSE_VALID", organizationId: "org", userId: "user" };

test("confirmed new trial grants bounded access while provisioning is pending", () => {
  const result = localEntitlement(billing, null, now);
  assert.equal(result.billingStatus, "trialing");
  assert.equal(result.warning?.graceUntil, new Date(now + 23 * 3600000).toISOString());
  assert.equal(localEntitlement(billing, null, now + 24 * 3600000).billingStatus, "license_unavailable");
});
test("unconfirmed or ended Stripe trials never grant temporary access", () => {
  assert.equal(localEntitlement({ ...billing, stripeSubscriptionId: null }, null, now).billingStatus, "license_unavailable");
  assert.equal(localEntitlement({ ...billing, trialEnd: new Date(now - 1) }, null, now).billingStatus, "expired");
});
test("rollout preserves existing organization denials but can recover missing provisioning", () => {
  assert.equal(localEntitlement({ ...billing, licenseDecision: "deny", licenseReasonCode: "LICENSE_REVOKED" }, null, now).billingStatus, "license_denied");
  assert.equal(localEntitlement({ ...billing, licenseDecision: "deny", licenseReasonCode: "LICENSE_OR_USER_NOT_FOUND" }, null, now).billingStatus, "trialing");
});
test("retry preserves last allowance and cannot renew grace", () => {
  const verified = recordVerification(null, allow, now);
  const retry = recordVerification(verified, { ...allow, decision: "retry", reasonCode: "LICENSE_API_UNAVAILABLE" }, now + 3600000);
  assert.equal(retry.checkedAt, verified.checkedAt);
  assert.equal(localEntitlement(billing, retry, now + 3600000).billingStatus, "trialing");
  assert.equal(localEntitlement(billing, retry, now + 86400000).billingStatus, "license_unavailable");
});
test("explicit denial remains enforced during subsequent outages and missing-user responses", () => {
  for (const decision of ["deny", "restricted"] as const) {
    const denied = recordVerification(null, { ...allow, decision, reasonCode: "LICENSE_REVOKED" }, now);
    const missing = recordVerification(denied, { ...allow, decision: "deny", reasonCode: "LICENSE_OR_USER_NOT_FOUND" }, now + 1);
    assert.equal(localEntitlement(billing, missing, now + 2).billingStatus, decision === "deny" ? "license_denied" : "restricted");
  }
});
test("successful verification clears warning; explicit expiry overrides allowance", () => {
  const verified = recordVerification(null, allow, now);
  assert.equal(localEntitlement(billing, verified, now).warning, null);
  assert.equal(localEntitlement(billing, recordVerification(null, { ...allow, expiresAt: new Date(now - 1).toISOString() }, now), now).billingStatus, "license_denied");
});
