import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import type { Db } from "./client.js";
import * as schema from "./schema.js";
import { reviewWebVisitorResolution, rebuildWebVisitorSummary } from "./web-visitors.js";
import {
  buildWebVisitorEventDedupeKey,
  buildWebVisitorIdentityFingerprint,
  normalizeProfessionalProfileUrl,
  normalizeWebVisitorSupplierPayload,
  normalizeWebVisitorDomain,
  normalizeWebVisitorTags
} from "./web-visitors.js";

test("reassignment rebuilds old and new contact summaries and is repeatable", { skip: !process.env.WV_TEST_DATABASE_URL }, async () => {
  // Dedicated migrated test DB only; all fixtures are rolled back.
  const pool = new pg.Pool({ connectionString: process.env.WV_TEST_DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("select set_config('twiniti.service_context', 'true', true)");
    const db = drizzle(client, { schema }) as unknown as Db;
    const [org] = await db.insert(schema.organizations).values({ name: "WV reassignment regression" }).returning();
    const [a, b] = await db.insert(schema.contacts).values(["a", "b"].map((name) => ({ organizationId: org.id, email: `${name}@example.com`, emailNormalized: `${name}@example.com` }))).returning();
    const [integration] = await db.insert(schema.webVisitorIntegrations).values({ organizationId: org.id, webhookTokenHash: org.id }).returning();
    const [mapping] = await db.insert(schema.webVisitorIdentityMappings).values({ organizationId: org.id, integrationId: integration.id, identityFingerprint: "fixture", contactId: a.id, resolutionState: "resolved" }).returning();
    await db.insert(schema.customerEvents).values({ organizationId: org.id, contactId: a.id, eventType: "web_visitor.visit", source: "web_visitors", occurredAt: new Date("2026-01-01"), payload: { integrationId: integration.id, identityFingerprint: "fixture" } });
    await rebuildWebVisitorSummary(db, { organizationId: org.id, contactId: a.id });
    for (let attempt = 0; attempt < 2; attempt++) {
      await reviewWebVisitorResolution(db, { organizationId: org.id, mappingId: mapping.id, action: "attach", contactId: b.id, reviewedBy: "test" });
      const records = await db.select().from(schema.contacts).where(eq(schema.contacts.organizationId, org.id));
      const oldContact = records.find((record) => record.id === a.id)!;
      const newContact = records.find((record) => record.id === b.id)!;
      assert.equal(oldContact.webVisitorVisitCount, 0);
      assert.equal(oldContact.webVisitorFirstVisitedAt, null);
      assert.equal(oldContact.webVisitorLastVisitedAt, null);
      assert.equal(newContact.webVisitorVisitCount, 1);
      assert.equal(newContact.webVisitorFirstVisitedAt?.toISOString(), "2026-01-01T00:00:00.000Z");
    }
  } finally { await client.query("ROLLBACK"); client.release(); await pool.end(); }
});

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
