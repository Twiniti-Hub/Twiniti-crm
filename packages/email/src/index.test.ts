import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { personalizeForContact, verifyResendWebhookSignature } from "../src/index.js";
import { createHmac } from "node:crypto";

describe("personalizeForContact", () => {
  it("replaces core and properties.* tokens", () => {
    const html = personalizeForContact(
      "Hi {{firstName}} ({{jobtitle}}) opt={{properties.hs_email_optout}}",
      {
        email: "ada@example.com",
        firstName: "Ada",
        lastName: "Lovelace",
        properties: { jobtitle: "Analyst", hs_email_optout: false }
      }
    );
    assert.equal(html, "Hi Ada (Analyst) opt=false");
  });
});

describe("verifyResendWebhookSignature", () => {
  it("accepts matching hmac hex", () => {
    const secret = "whsec_test";
    const payload = "{\"type\":\"email.delivered\"}";
    const digest = createHmac("sha256", secret).update(payload, "utf8").digest("hex");
    assert.equal(verifyResendWebhookSignature(payload, digest, secret), true);
  });

  it("rejects missing signature when secret set", () => {
    assert.equal(verifyResendWebhookSignature("{}", undefined, "whsec_test"), false);
  });
});
