import assert from "node:assert/strict";
import test from "node:test";
import { mayReplaceSubscription, recoverCheckoutSubscription } from "../billing-recovery.js";

const billing = { organizationId: "org", stripeSubscriptionId: null, stripeCheckoutSessionId: "cs" };
const trial = { id: "sub", status: "trialing", trial_end: 2000, metadata: { organizationId: "org" } };
const complete = { status: "complete", subscription: "sub", metadata: { organizationId: "org" }, client_reference_id: "org" };

test("a completed checkout recovers a trial even with no webhook or stored subscription", async () => {
  const result = await recoverCheckoutSubscription(billing, {
    session: async () => complete,
    subscription: async (id) => { assert.equal(id, "sub"); return trial; }
  });
  assert.equal(result, trial);
  assert.equal(mayReplaceSubscription(result!, 1000_000), false);
});

test("completed session wins over an older stored subscription", async () => {
  const result = await recoverCheckoutSubscription({ ...billing, stripeSubscriptionId: "old" }, {
    session: async () => complete,
    subscription: async (id) => { assert.equal(id, "sub"); return trial; }
  });
  assert.equal(result?.status, "trialing");
});

test("unknown Stripe state, missing completed subscription, and wrong workspace fail closed", async () => {
  await assert.rejects(recoverCheckoutSubscription(billing, {
    session: async () => { throw new Error("Stripe unavailable"); }, subscription: async () => trial
  }), /unavailable/);
  await assert.rejects(recoverCheckoutSubscription(billing, {
    session: async () => ({ ...complete, subscription: null }), subscription: async () => trial
  }), /confirmed/);
  await assert.rejects(recoverCheckoutSubscription(billing, {
    session: async () => ({ ...complete, metadata: { organizationId: "other" } }), subscription: async () => trial
  }), /workspace/);
  await assert.rejects(recoverCheckoutSubscription(billing, {
    session: async () => complete, subscription: async () => ({ ...trial, metadata: { organizationId: "other" } })
  }), /workspace/);
});

test("only terminal subscriptions outside their trial permit replacement", () => {
  for (const status of ["trialing", "active", "past_due", "unpaid", "paused", "incomplete", "unknown"]) {
    assert.equal(mayReplaceSubscription({ ...trial, status }, 3000_000), false);
  }
  assert.equal(mayReplaceSubscription({ ...trial, status: "canceled" }, 1000_000), false);
  assert.equal(mayReplaceSubscription({ ...trial, status: "canceled" }, 3000_000), true);
  assert.equal(mayReplaceSubscription({ ...trial, status: "incomplete_expired", trial_end: null }), true);
});

test("open new session has no subscription to replace", async () => {
  assert.equal(await recoverCheckoutSubscription(billing, {
    session: async () => ({ ...complete, status: "open", subscription: null }),
    subscription: async () => { throw new Error("must not read a subscription"); }
  }), null);
});
