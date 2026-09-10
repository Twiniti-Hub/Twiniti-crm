import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractResendWebhookDomains, personalizeForContact, verifyResendWebhookSignature } from "../src/index.js";
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

  it("accepts Svix v1 signatures over id.timestamp.body", () => {
    const secret = `whsec_${Buffer.from("testsecretvalue123456").toString("base64")}`;
    const payload = "{\"type\":\"email.received\"}";
    const id = "msg_test";
    const timestamp = "1780000000";
    const expected = createHmac("sha256", Buffer.from(secret.slice(6), "base64"))
      .update(`${id}.${timestamp}.${payload}`, "utf8")
      .digest("base64");
    assert.equal(
      verifyResendWebhookSignature(payload, `v1,${expected}`, secret, { id, timestamp, nowSeconds: 1780000000 }),
      true
    );
  });

  it("rejects a Svix signature for a different payload", () => {
    const secret = `whsec_${Buffer.from("testsecretvalue123456").toString("base64")}`;
    const payload = "{\"type\":\"email.received\"}";
    const id = "msg_test";
    const timestamp = "1780000000";
    const expected = createHmac("sha256", Buffer.from(secret.slice(6), "base64"))
      .update(`${id}.${timestamp}.${payload}`, "utf8")
      .digest("base64");
    assert.equal(
      verifyResendWebhookSignature("{\"type\":\"email.delivered\"}", `v1,${expected}`, secret, { id, timestamp, nowSeconds: 1780000000 }),
      false
    );
  });

  it("rejects expired Svix timestamps", () => {
    const secret = `whsec_${Buffer.from("testsecretvalue123456").toString("base64")}`;
    const payload = "{\"type\":\"email.received\"}";
    const id = "msg_test";
    const timestamp = "1000";
    const expected = createHmac("sha256", Buffer.from(secret.slice(6), "base64"))
      .update(`${id}.${timestamp}.${payload}`, "utf8")
      .digest("base64");
    assert.equal(
      verifyResendWebhookSignature(payload, `v1,${expected}`, secret, { id, timestamp, nowSeconds: 1780000000 }),
      false
    );
  });
});

describe("extractResendWebhookDomains", () => {
  it("reads receiving domains from Resend email.received payloads", () => {
    assert.deepEqual(extractResendWebhookDomains({
      type: "email.received",
      data: {
        from: "Ada Lovelace <ada@example.net>",
        to: ["Loop <log_abc@mail.customer.com>"],
        bcc: ["secret@other.example"]
      }
    }).sort(), ["example.net", "mail.customer.com", "other.example"]);
  });
});
