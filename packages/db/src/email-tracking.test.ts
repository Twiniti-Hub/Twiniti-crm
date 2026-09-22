import test from "node:test";
import assert from "node:assert/strict";
import {
  buildReceivedEmailDedupeKey,
  classifyEmailActivity,
  extractEmailBodyText,
  getEmailHeader,
  getTrackingToken,
  getTrackingTokenFromValues,
  normalizeMessageId,
  parseEmailAddresses,
  parseTrackingAddress,
  parseTrackingAddressFromValues
} from "./email-tracking.js";

test("parses display-name addresses and tracking tokens", () => {
  assert.deepEqual(parseEmailAddresses("George Broadbent <George@Example.com>, other@example.com"), [
    "george@example.com",
    "other@example.com"
  ]);
  assert.deepEqual(parseTrackingAddress("Loop <log_abc123@customer.example.com>"), {
    token: "abc123",
    domain: "customer.example.com"
  });
  assert.deepEqual(
    parseTrackingAddressFromValues(["customer@example.com", "log_abc123@customer.example.com"]),
    { token: "abc123", domain: "customer.example.com" }
  );
  assert.equal(getTrackingToken("log_abc123@customer.example.com", "customer.example.com"), "abc123");
  assert.equal(getTrackingTokenFromValues(["Loop <log_abc123@customer.example.com>"], "customer.example.com"), "abc123");
  assert.equal(getTrackingToken("log_abc123@customer.example.com", "other.example.com"), null);
});

test("matches reply metadata and classifies inbound email", () => {
  const headers = { "In-Reply-To": "<message-1@example.com>" };
  assert.equal(getEmailHeader(headers, "in-reply-to"), "<message-1@example.com>");
  assert.deepEqual(classifyEmailActivity({
    fromEmail: "contact@example.com",
    contactEmails: ["contact@example.com"],
    inReplyTo: "<message-1@example.com>"
  }), { direction: "inbound", activityType: "replied" });
});

test("received email dedupe prefers Message-ID so distinct emails stay separate", () => {
  assert.equal(normalizeMessageId("<ABC@Example.com>"), "abc@example.com");
  assert.equal(
    buildReceivedEmailDedupeKey({
      providerEmailId: "resend-1",
      messageId: "<one@mail.example>",
      contactId: "contact-a"
    }),
    "received:msgid:one@mail.example:contact-a"
  );
  assert.notEqual(
    buildReceivedEmailDedupeKey({
      providerEmailId: "resend-1",
      messageId: "<one@mail.example>",
      contactId: "contact-a"
    }),
    buildReceivedEmailDedupeKey({
      providerEmailId: "resend-1",
      messageId: "<two@mail.example>",
      contactId: "contact-a"
    })
  );
  assert.equal(
    buildReceivedEmailDedupeKey({
      providerEmailId: "resend-1",
      contactId: "contact-a"
    }),
    "received:resid:resend-1:contact-a"
  );
});

test("extractEmailBodyText keeps plain text and strips HTML without inventing empty bodies", () => {
  assert.equal(extractEmailBodyText({ text: " Hello ", html: "<p>ignored</p>" }), " Hello ");
  assert.equal(extractEmailBodyText({ text: null, html: "<p>Hi <b>there</b></p>" }), "Hi there");
  assert.equal(extractEmailBodyText({ text: "  ", html: "<div></div>" }), null);
});
