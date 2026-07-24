import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyEmailActivity,
  getEmailHeader,
  getTrackingToken,
  parseEmailAddresses
} from "./email-tracking.js";

test("parses display-name addresses and tracking tokens", () => {
  assert.deepEqual(parseEmailAddresses("George Broadbent <George@Example.com>, other@example.com"), [
    "george@example.com",
    "other@example.com"
  ]);
  assert.equal(getTrackingToken(["Loop <log_abc123@inbound.twiniti.ai>"], "inbound.twiniti.ai"), "abc123");
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
