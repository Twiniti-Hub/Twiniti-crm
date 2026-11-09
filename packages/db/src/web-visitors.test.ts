import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWebVisitorEventDedupeKey,
  buildWebVisitorIdentityFingerprint,
  normalizeProfessionalProfileUrl,
  normalizeWebVisitorSupplierPayload,
  normalizeWebVisitorDomain,
  normalizeWebVisitorTags
} from "./web-visitors.js";

const profile = {
  visitorId: "visitor-1",
  businessEmail: "John.Smith@example.com",
  companyWebsite: "https://www.example.com/about",
  seenAt: "2026-11-09T12:00:00.000Z",
  capturedUrl: "https://loop.example/pricing",
  tags: ["pricing"],
  repeatVisit: false,
  profileType: "person" as const,
  timePrecision: "timestamp" as const
};

test("normalizes supported LinkedIn person URLs", () => {
  assert.equal(normalizeProfessionalProfileUrl("https://www.linkedin.com/en/in/John-Smith/?trk=abc#top"), "https://linkedin.com/in/john-smith");
  assert.equal(normalizeProfessionalProfileUrl("https://linkedin.com/company/example"), null);
  assert.equal(normalizeProfessionalProfileUrl("https://linkedin.com.example.org/in/john"), null);
  assert.equal(normalizeProfessionalProfileUrl("http://linkedin.com/in/john"), null);
});

test("normalizes safe company domains", () => {
  assert.equal(normalizeWebVisitorDomain("example.com/path"), "example.com");
  assert.equal(normalizeWebVisitorDomain("https://WWW.Example.com./path"), "example.com");
  assert.equal(normalizeWebVisitorDomain("http://localhost:3000"), null);
});

test("dedupe and identity fingerprints are deterministic", () => {
  assert.equal(buildWebVisitorIdentityFingerprint(profile), buildWebVisitorIdentityFingerprint({ ...profile }));
  assert.equal(buildWebVisitorEventDedupeKey({ integrationId: "i1", profile }), buildWebVisitorEventDedupeKey({ integrationId: "i1", profile: { ...profile } }));
  assert.notEqual(buildWebVisitorEventDedupeKey({ integrationId: "i1", profile }), buildWebVisitorEventDedupeKey({ integrationId: "i1", profile: { ...profile, seenAt: "2026-11-09T12:01:00.000Z" } }));
});

test("normalizes and bounds tags", () => {
  assert.deepEqual(normalizeWebVisitorTags("pricing, pricing, enterprise"), ["pricing", "enterprise"]);
  assert.equal(normalizeWebVisitorTags(Array.from({ length: 60 }, (_, index) => `tag-${index}`)).length, 50);
});

test("adapts the fixed WV App webhook payload", () => {
  const adapted = normalizeWebVisitorSupplierPayload({
    "LinkedIn URL": "https://www.linkedin.com/in/RetentionAdam/",
    "First Name": "Adam",
    "Last Name": "Robinson",
    "Title": "CEO",
    "Company Name": "Retention.com",
    "Business Email": "adam@retention.com",
    "Website": "https://retention.com",
    "Industry": "Internet Technology & Services",
    "Employee Count": "1-10",
    "Estimate Revenue": "$22M rev",
    "City": "Austin",
    "State": "Texas",
    "Zipcode": "73301",
    "Seen At": "2024-01-01T12:34:56:00.00+00.00",
    "Referrer": "https://google.com",
    "Captured URL": "https://example.com/pricing",
    "Tags": "Hot Page, Hot Lead",
    "is_repeat_visit": true
  });
  assert.equal(adapted.professionalProfileUrl, "https://www.linkedin.com/in/RetentionAdam/");
  assert.equal(adapted.seenAt, "2024-01-01T12:34:56.000Z");
  assert.deepEqual(adapted.tags, ["Hot Page", "Hot Lead"]);
  assert.equal(adapted.repeatVisit, true);
  assert.equal(adapted.profileType, "person");
});
