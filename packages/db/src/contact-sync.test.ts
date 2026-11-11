import assert from "node:assert/strict";
import test from "node:test";
import { createContactSchema } from "@twiniti/contracts";
import { parseVcard } from "./contact-providers.js";

test("contact input accepts phone-only and name-only personal contacts", () => {
  assert.equal(createContactSchema.parse({ phone: "+44 20 7946 0000" }).phone, "+44 20 7946 0000");
  assert.equal(createContactSchema.parse({ firstName: "Ada" }).firstName, "Ada");
  assert.throws(() => createContactSchema.parse({}));
});
test("vCard parser preserves repeated labelled values and folded unicode names", () => {
  const source = parseVcard([
    "BEGIN:VCARD",
    "VERSION:3.0",
    "UID:icloud-123",
    "N:Lovelace;Ada;;;",
    "FN:Ada ",
    " Lovelace",
    "EMAIL;TYPE=HOME;PREF:ada@example.com",
    "EMAIL;TYPE=WORK:ada@analytical.example",
    "TEL;TYPE=CELL:+44 7700 900123",
    "ORG:Analytical Engine Society;",
    "TITLE:Mathematician",
    "END:VCARD"
  ].join("\r\n"), "fallback", "book-1", '"etag-1"');
  assert.ok(source);
  assert.equal(source.externalId, "icloud-123");
  assert.equal(source.firstName, "Ada");
  assert.equal(source.lastName, "Lovelace");
  assert.equal(source.emails?.length, 2);
  assert.equal(source.emails?.[0]?.primary, true);
  assert.equal(source.phones?.[0]?.value, "+44 7700 900123");
  assert.equal(source.organization, "Analytical Engine Society");
});

test("vCard parser rejects oversized cards and skips embedded photo fetching", () => {
  assert.equal(parseVcard("x".repeat(1_048_577), "fallback", "book"), null);
  const source = parseVcard("BEGIN:VCARD\nUID:x\nFN:Safe\nPHOTO:https://example.invalid/photo.jpg\nEND:VCARD", "fallback", "book");
  assert.ok(source);
  assert.deepEqual(source.addresses, undefined);
});

test("vCard fallback identity is stable when UID is missing", () => {
  const source = parseVcard("BEGIN:VCARD\nFN:Phone Only\nTEL:+12025550123\nEND:VCARD", "/book/card.vcf", "book");
  assert.equal(source?.externalId, "/book/card.vcf");
  assert.equal(source?.phones?.[0]?.value, "+12025550123");
});
