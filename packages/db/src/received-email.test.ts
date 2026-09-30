import test from "node:test";
import assert from "node:assert/strict";
import {
  contactsToRecordForReceivedEmail,
  parseDisplayNameFromAddressField,
  participantEmailsForAutoCreate
} from "./received-email.js";

test("parseDisplayNameFromAddressField maps display names to normalized emails", () => {
  const map = parseDisplayNameFromAddressField([
    "Vlad Zvetkov <vtzvetkov@panynj.gov>",
    "george.broadbent@twiniti.ai"
  ]);
  assert.deepEqual(map.get("vtzvetkov@panynj.gov"), { firstName: "Vlad", lastName: "Zvetkov" });
  assert.deepEqual(map.get("george.broadbent@twiniti.ai"), { firstName: null, lastName: null });
});

test("participantEmailsForAutoCreate skips tracking address and inbound messages", () => {
  const tracking = "log_abc@crm.example.com";
  const outbound = { direction: "outbound" as const, activityType: "sent" as const };
  assert.deepEqual(
    participantEmailsForAutoCreate(["vtz@example.com", tracking], tracking, outbound),
    ["vtz@example.com"]
  );
  assert.deepEqual(
    participantEmailsForAutoCreate(["vtz@example.com"], tracking, { direction: "inbound", activityType: "received" }),
    []
  );
});

test("contactsToRecordForReceivedEmail creates timeline targets for outbound participants only", () => {
  const tracking = "log_abc@crm.example.com";
  const recipient = {
    id: "contact-recipient",
    emailNormalized: "vtz@example.com"
  } as const;
  const sender = {
    id: "contact-sender",
    emailNormalized: "george@twiniti.ai"
  } as const;
  const byEmail = new Map([
    [recipient.emailNormalized, recipient as never],
    [sender.emailNormalized, sender as never]
  ]);

  const outboundRows = contactsToRecordForReceivedEmail({
    participantEmails: ["vtz@example.com"],
    trackingEmail: tracking,
    fromEmail: "george@twiniti.ai",
    classification: { direction: "outbound", activityType: "sent" },
    contactsByEmail: byEmail
  });
  assert.equal(outboundRows.length, 1);
  assert.equal(outboundRows[0]?.id, "contact-recipient");

  const inboundRows = contactsToRecordForReceivedEmail({
    participantEmails: ["george@twiniti.ai"],
    trackingEmail: tracking,
    fromEmail: "vtz@example.com",
    classification: { direction: "inbound", activityType: "received" },
    contactsByEmail: byEmail
  });
  assert.equal(inboundRows.length, 1);
  assert.equal(inboundRows[0]?.id, "contact-recipient");
});

test("contactsToRecordForReceivedEmail does not attach outbound mail to sender-only match", () => {
  const tracking = "log_abc@crm.example.com";
  const sender = { id: "contact-sender", emailNormalized: "george@twiniti.ai" } as const;
  const byEmail = new Map([[sender.emailNormalized, sender as never]]);

  const rows = contactsToRecordForReceivedEmail({
    participantEmails: ["vtz@example.com"],
    trackingEmail: tracking,
    fromEmail: "george@twiniti.ai",
    classification: { direction: "outbound", activityType: "sent" },
    contactsByEmail: byEmail
  });
  assert.deepEqual(rows, [null]);
});
