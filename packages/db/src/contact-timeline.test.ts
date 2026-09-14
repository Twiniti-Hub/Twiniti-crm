import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildImportedMarketingTimelineEvents } from "./repositories.js";

describe("buildImportedMarketingTimelineEvents", () => {
  it("creates a summary event from HubSpot marketing rollups", () => {
    const events = buildImportedMarketingTimelineEvents(
      "contact-1",
      "org-1",
      {
        marketing_emails_delivered: 2,
        last_marketing_email_name: "Lexi Intro Webinar"
      },
      new Set()
    );
    assert.equal(events.length, 1);
    assert.equal(events[0]?.eventType, "email.sent");
    assert.equal(events[0]?.payload.subject, "Lexi Intro Webinar");
    assert.equal(events[0]?.payload.metadata?.imported, true);
    assert.equal(events[0]?.payload.metadata?.marketingEmailsDelivered, 2);
  });

  it("skips duplicate imported summary events", () => {
    const dedupeKeys = new Set(["import:contact-1:marketing-summary"]);
    const events = buildImportedMarketingTimelineEvents(
      "contact-1",
      "org-1",
      { marketing_emails_delivered: 2 },
      dedupeKeys
    );
    assert.equal(events.length, 0);
  });
});
