import assert from "node:assert/strict";
import test from "node:test";
import { canOfferCheckout } from "./billingCheckout";

test("no checkout is offered while loading, confirming, or trialing even if workspace licensing is pending", () => {
  assert.equal(canOfferCheckout(null), false);
  assert.equal(canOfferCheckout({ status: "pending" }), false);
  assert.equal(canOfferCheckout({ status: "pending", checkoutAllowed: false }), false);
  assert.equal(canOfferCheckout({ status: "trialing", checkoutAllowed: true }), false);
  assert.equal(canOfferCheckout({ status: "active", checkoutAllowed: true }), false);
});

test("only server-approved new or terminal checkout is offered", () => {
  assert.equal(canOfferCheckout({ status: "pending", checkoutAllowed: true }), true);
  assert.equal(canOfferCheckout({ status: "canceled", checkoutAllowed: true }), true);
  assert.equal(canOfferCheckout({ status: "canceled", checkoutAllowed: false }), false);
});
