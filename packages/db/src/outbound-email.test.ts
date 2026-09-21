import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildOutboundEmailDedupeKey,
  extractInternetMessageId,
  isAgentIngestibleEmailEventType
} from "./outbound-email.js";

describe("outbound email helpers", () => {
  it("builds a graph-prefixed dedupe key from internetMessageId", () => {
    assert.equal(
      buildOutboundEmailDedupeKey("<abc@graph.microsoft.com>"),
      "graph:<abc@graph.microsoft.com>"
    );
    assert.equal(buildOutboundEmailDedupeKey("  "), null);
    assert.equal(buildOutboundEmailDedupeKey(undefined), null);
  });

  it("extracts internetMessageId from event payload", () => {
    assert.equal(
      extractInternetMessageId({ internetMessageId: "<msg-1@outlook.com>", subject: "Hi" }),
      "<msg-1@outlook.com>"
    );
    assert.equal(extractInternetMessageId({ subject: "Hi" }), undefined);
    assert.equal(extractInternetMessageId({ internetMessageId: "   " }), undefined);
  });

  it("allows agent ingest for outbound email event types only", () => {
    assert.equal(isAgentIngestibleEmailEventType("email.sent"), true);
    assert.equal(isAgentIngestibleEmailEventType("email.delivered"), true);
    assert.equal(isAgentIngestibleEmailEventType("contact.created"), false);
    assert.equal(isAgentIngestibleEmailEventType("hubspot.import"), false);
  });
});
