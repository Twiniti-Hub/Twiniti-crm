import assert from "node:assert/strict";
import test from "node:test";
import { buildResendWebhookUrl } from "./resendWebhookUrl.js";

test("builds an absolute Resend webhook URL from the current origin", () => {
  assert.equal(
    buildResendWebhookUrl("mail.customer.com", "", "https://loop.us.twiniti.ai"),
    "https://loop.us.twiniti.ai/api/v1/webhooks/resend?domain=mail.customer.com"
  );
});

test("prefers an explicit API base when one is configured", () => {
  assert.equal(
    buildResendWebhookUrl("mail.customer.com", "https://api.example.test/", "https://loop.us.twiniti.ai"),
    "https://api.example.test/api/v1/webhooks/resend?domain=mail.customer.com"
  );
});
