import assert from "node:assert/strict";
import test from "node:test";
import { routeNeedsHexclave } from "./hexclaveRoutes.js";

test("routeNeedsHexclave is true only for auth and billing surfaces", () => {
  assert.equal(routeNeedsHexclave("/sign-up"), true);
  assert.equal(routeNeedsHexclave("/billing"), true);
  assert.equal(routeNeedsHexclave("/handler/email-verification"), true);
  assert.equal(routeNeedsHexclave("/pricing"), false);
  assert.equal(routeNeedsHexclave("/contacts"), false);
});