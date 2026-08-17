import test from "node:test";
import assert from "node:assert/strict";
import { invoiceSubscriptionId, subscriptionCurrentPeriodEnd } from "../routes/billing.js";

test("subscriptionCurrentPeriodEnd prefers Basil item-level period end", () => {
  const end = subscriptionCurrentPeriodEnd({
    current_period_end: 1000,
    items: { data: [{ current_period_end: 2000 }] }
  });
  assert.equal(end?.toISOString(), new Date(2000 * 1000).toISOString());
});

test("subscriptionCurrentPeriodEnd falls back to legacy top-level period end", () => {
  const end = subscriptionCurrentPeriodEnd({ current_period_end: 1500, items: { data: [] } });
  assert.equal(end?.toISOString(), new Date(1500 * 1000).toISOString());
});

test("invoiceSubscriptionId reads legacy subscription field", () => {
  assert.equal(invoiceSubscriptionId({ subscription: "sub_legacy" }), "sub_legacy");
});

test("invoiceSubscriptionId reads Basil parent.subscription_details.subscription", () => {
  assert.equal(invoiceSubscriptionId({
    parent: {
      subscription_details: {
        subscription: "sub_basil"
      }
    }
  }), "sub_basil");
});
