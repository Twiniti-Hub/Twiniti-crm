import test from "node:test";
import assert from "node:assert/strict";
import { checkoutBillingCountry, checkoutTerms, invoiceSubscriptionId, subscriptionCurrentPeriodEnd } from "../routes/billing.js";

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

const prices = { STRIPE_PRICE_ID: "price_org_29", STRIPE_PERSONAL_PRICE_ID: "price_personal_9" };
for (const kind of ["personal", "company"] as const) {
  test(`${kind} selects its own recurring price and offers seven cardless days`, () => {
    const terms = checkoutTerms(prices, kind, {});
    assert.equal(terms.priceId, kind === "personal" ? "price_personal_9" : "price_org_29");
    assert.equal(terms.subscription_data.trial_period_days, 7);
    assert.equal(terms.payment_method_collection, "if_required");
    assert.equal(terms.subscription_data.trial_settings?.end_behavior.missing_payment_method, "cancel");
  });
  test(`${kind} does not grant another free trial on restart`, () => {
    const terms = checkoutTerms(prices, kind, { stripeSubscriptionId: "sub_previous" });
    assert.equal(terms.trialDays, 0);
    assert.equal(terms.payment_method_collection, "always");
    assert.deepEqual(terms.subscription_data, {});
    assert.notEqual(terms.sessionPolicy, checkoutTerms(prices, kind, {}).sessionPolicy);
  });
}
test("missing Personal price never falls back to Organization pricing", () => {
  assert.equal(checkoutTerms({ ...prices, STRIPE_PERSONAL_PRICE_ID: "" }, "personal", {}).priceId, "");
});
test("recorded trial prevents a second trial even without a subscription id", () => {
  assert.equal(checkoutTerms(prices, "company", { trialStart: new Date() }).trialDays, 0);
});

test("checkoutBillingCountry normalizes ISO alpha-2 and rejects junk", () => {
  assert.equal(checkoutBillingCountry("gb"), "GB");
  assert.equal(checkoutBillingCountry(" US "), "US");
  assert.equal(checkoutBillingCountry(""), null);
  assert.equal(checkoutBillingCountry("USA"), null);
  assert.equal(checkoutBillingCountry(null), null);
  assert.equal(checkoutBillingCountry(undefined), null);
});
