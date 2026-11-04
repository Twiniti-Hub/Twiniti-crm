import assert from "node:assert/strict";
import test from "node:test";
import { authFlowStage } from "./authFlow";
import { clearSignupDraft, readSignupDraft, saveSignupDraft } from "./signupDraft";
import type { Me } from "./me";

const me: Me = { type: "user", id: "user", organizationId: null, needsSetup: true, isSuperAdmin: false, primaryEmailVerified: false };

test("verification and password callbacks remain reachable before setup and billing gates", () => {
  for (const session of [null, me, { ...me, needsSetup: false, billingStatus: "inactive" }, { ...me, primaryEmailVerified: true }]) {
    assert.equal(authFlowStage("/handler/email-verification", session), "callback");
    assert.equal(authFlowStage("/handler/password-reset", session), "callback");
  }
  assert.notEqual(authFlowStage("/handler-unrelated", me), "callback");
});

test("unverified users verify before provisioning or checkout; server confirmation unlocks setup", () => {
  assert.equal(authFlowStage("/onboarding", me), "verification");
  assert.equal(authFlowStage("/billing", { ...me, needsSetup: false }), "verification");
  assert.equal(authFlowStage("/onboarding", { ...me, primaryEmailVerified: true }), "setup");
  assert.equal(authFlowStage("/billing", { ...me, needsSetup: false, primaryEmailVerified: true }), "workspace");
});

test("signup draft survives round trip for its owner, rejects malformed or different-account drafts, and clears", () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  const draft = { email: "User@example.com", workspaceChoice: "personal" as const, displayName: "Jane", companyName: "", countryCode: "GB" };
  saveSignupDraft(storage, draft);
  assert.deepEqual(readSignupDraft(storage, "user@example.com"), draft);
  assert.equal(readSignupDraft(storage, "other@example.com"), null);
  assert.equal(readSignupDraft(storage, null), null);
  clearSignupDraft(storage);
  assert.equal(readSignupDraft(storage, draft.email), null);
  storage.setItem("twiniti.signupDraft", "broken json");
  assert.equal(readSignupDraft(storage, draft.email), null);
});
