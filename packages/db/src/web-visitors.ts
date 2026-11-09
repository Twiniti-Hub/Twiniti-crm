import { createHash } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { webVisitorIncomingPayloadSchema, webVisitorSupplierPayloadSchema, type WebVisitorProfile, type WebVisitorSettings } from "@twiniti/contracts";
import type { Db } from "./client.js";
import {
  companies,
  contacts,
  contactCompanyAssociations,
  contactIdentities,
  customerEvents,
  webVisitorIdentityMappings
} from "./schema.js";
import { createContact, findContactByEmail, upsertContactIdentity } from "./repositories.js";
import { createCompanyRecord } from "./board-repositories.js";

export const WEB_VISITOR_RESOLVER_VERSION = "wv-identity-v1";

export type WebVisitorResolution = {
  state: "resolved" | "unresolved" | "ambiguous" | "rejected";
  confidence: "verified" | "high" | "medium" | "low" | null;
  matchMethod: "existing_mapping" | "business_email" | "professional_profile" | "company_domain" | null;
  contactId: string | null;
  companyId: string | null;
  candidateContactIds: string[];
  evidence: string[];
  resolverVersion: string;
};

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function normalizeWebVisitorDomain(value: string | null | undefined): string | null {
  const input = value?.trim();
  if (!input) return null;
  try {
    const parsed = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) return null;
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
    if (!hostname || hostname === "localhost" || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) || hostname.includes(":")) return null;
    return hostname;
  } catch {
    return null;
  }
}

export function normalizeProfessionalProfileUrl(value: string | null | undefined): string | null {
  const input = value?.trim();
  if (!input) return null;
  try {
    const parsed = new URL(input);
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
    if (parsed.protocol !== "https:" || hostname !== "linkedin.com" || parsed.username || parsed.password) return null;
    const segments = parsed.pathname.split("/").filter(Boolean);
    const inIndex = segments.findIndex((segment) => segment.toLowerCase() === "in");
    if (inIndex < 0 || inIndex + 2 !== segments.length) return null;
    const slug = decodeURIComponent(segments[inIndex + 1] ?? "").trim().toLowerCase();
    if (!slug || slug === "." || slug === ".." || /[\u0000-\u001f\\/]/.test(slug)) return null;
    return `https://linkedin.com/in/${encodeURIComponent(slug)}`;
  } catch {
    return null;
  }
}

export function normalizeWebVisitorTags(value: unknown): string[] {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  return [...new Set(values.map((item) => String(item).trim()).filter(Boolean))].slice(0, 50);
}

function nullableSupplierString(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeSupplierSeenAt(value: string) {
  const trimmed = value.trim();
  if (!Number.isNaN(new Date(trimmed).getTime())) return new Date(trimmed).toISOString();
  const repaired = trimmed.replace(/^(.*T\d{2}:\d{2}:\d{2}):\d{2}\.\d+([+-]\d{2})\.(\d{2})$/, "$1$2:$3");
  if (!Number.isNaN(new Date(repaired).getTime())) return new Date(repaired).toISOString();
  throw new Error("WV App Seen At is not a supported timestamp");
}

export function normalizeWebVisitorSupplierPayload(raw: unknown): WebVisitorProfile {
  const supplier = webVisitorSupplierPayloadSchema.parse(raw);
  const businessEmail = nullableSupplierString(supplier["Business Email"]);
  const professionalProfileUrl = nullableSupplierString(supplier["LinkedIn URL"]);
  return webVisitorIncomingPayloadSchema.parse({
    visitorId: null,
    firstName: nullableSupplierString(supplier["First Name"]),
    lastName: nullableSupplierString(supplier["Last Name"]),
    businessEmail,
    professionalProfileUrl,
    companyName: nullableSupplierString(supplier["Company Name"]),
    companyWebsite: nullableSupplierString(supplier.Website),
    title: nullableSupplierString(supplier.Title),
    industry: nullableSupplierString(supplier.Industry),
    employeeCount: supplier["Employee Count"] ?? null,
    estimatedRevenue: nullableSupplierString(supplier["Estimate Revenue"]),
    city: nullableSupplierString(supplier.City),
    state: nullableSupplierString(supplier.State),
    postalCode: supplier.Zipcode.trim(),
    seenAt: normalizeSupplierSeenAt(supplier["Seen At"]),
    timePrecision: "timestamp",
    referrer: nullableSupplierString(supplier.Referrer),
    capturedUrl: supplier["Captured URL"].trim(),
    tags: normalizeWebVisitorTags(supplier.Tags),
    repeatVisit: supplier.is_repeat_visit ?? supplier.is_repeat_visitor ?? false,
    profileType: businessEmail || professionalProfileUrl ? "person" : "company"
  });
}

export function buildProfessionalProfileFingerprint(value: string): string {
  const normalized = normalizeProfessionalProfileUrl(value);
  if (!normalized) throw new Error("Unsupported professional profile URL");
  return sha256(normalized);
}

export function buildWebVisitorIdentityFingerprint(profile: WebVisitorProfile): string {
  const profileUrl = normalizeProfessionalProfileUrl(profile.professionalProfileUrl);
  const domain = normalizeWebVisitorDomain(profile.companyWebsite);
  const identity = profile.visitorId?.trim()
    ? `visitor:${profile.visitorId.trim()}`
    : profile.businessEmail?.trim()
      ? `email:${profile.businessEmail.trim().toLowerCase()}`
      : profileUrl
        ? `profile:${profileUrl}`
        : `company:${domain ?? "unknown"}`;
  return sha256(identity);
}

export function buildWebVisitorPayloadFingerprint(profile: WebVisitorProfile): string {
  return sha256(JSON.stringify({
    visitorId: profile.visitorId ?? null,
    email: profile.businessEmail?.trim().toLowerCase() ?? null,
    profileUrl: normalizeProfessionalProfileUrl(profile.professionalProfileUrl),
    domain: normalizeWebVisitorDomain(profile.companyWebsite),
    seenAt: profile.seenAt,
    capturedUrl: profile.capturedUrl
  }));
}

export function buildWebVisitorEventDedupeKey(input: { integrationId: string; profile: WebVisitorProfile }): string {
  return `web-visitors:${input.integrationId}:${buildWebVisitorPayloadFingerprint(input.profile)}`;
}

export function buildWebVisitorLoaderSnippet(input: { publicKey: string }): string {
  const key = input.publicKey.trim();
  if (!/^[A-Za-z0-9_-]{6,100}$/.test(key)) throw new Error("Invalid WV App public key");
  return `<script>!function(key){if(window.reb2b)return;window.reb2b={loaded:true};var s=document.createElement("script");s.async=true;s.src="https://ddwl4m2hdecbv.cloudfront.net/b/"+key+"/"+key+".js.gz";document.getElementsByTagName("script")[0].parentNode.insertBefore(s,document.getElementsByTagName("script")[0]);}("${key}");</script>`;
}

async function findContactByProfessionalProfile(db: Db, organizationId: string, value: string) {
  const normalized = normalizeProfessionalProfileUrl(value);
  if (!normalized) return null;
  const [identity] = await db.select({ contactId: contactIdentities.contactId }).from(contactIdentities).where(and(
    eq(contactIdentities.organizationId, organizationId),
    eq(contactIdentities.identityType, "professional_profile"),
    eq(contactIdentities.provider, "web_visitors"),
    eq(contactIdentities.normalizedValue, normalized),
    isNull(contactIdentities.endedAt)
  )).limit(1);
  if (!identity) return null;
  const [contact] = await db.select().from(contacts).where(and(
    eq(contacts.organizationId, organizationId),
    eq(contacts.id, identity.contactId),
    isNull(contacts.archivedAt)
  )).limit(1);
  return contact ?? null;
}

export async function resolveWebVisitorIdentity(db: Db, input: {
  organizationId: string;
  integrationId: string;
  profile: WebVisitorProfile;
  settings: WebVisitorSettings;
}): Promise<WebVisitorResolution> {
  const fingerprint = buildWebVisitorIdentityFingerprint(input.profile);
  const [mapping] = await db.select().from(webVisitorIdentityMappings).where(and(
    eq(webVisitorIdentityMappings.organizationId, input.organizationId),
    eq(webVisitorIdentityMappings.integrationId, input.integrationId),
    eq(webVisitorIdentityMappings.identityFingerprint, fingerprint)
  )).limit(1);

  let company = null as typeof companies.$inferSelect | null;
  const domain = normalizeWebVisitorDomain(input.profile.companyWebsite);
  if (mapping?.companyId) {
    [company] = await db.select().from(companies).where(and(eq(companies.id, mapping.companyId), eq(companies.organizationId, input.organizationId))).limit(1);
  }
  if (!company && domain) {
    [company] = await db.select().from(companies).where(and(eq(companies.organizationId, input.organizationId), eq(companies.domainNormalized, domain))).limit(1);
  }
  if (!company && domain && input.settings.createCompanies) {
    company = await createCompanyRecord(db, {
      organizationId: input.organizationId,
      name: input.profile.companyName?.trim() || domain,
      domain,
      industry: input.profile.industry ?? null,
      properties: { webVisitors: { title: input.profile.title ?? null } },
      change: { actorType: "system", actorId: "web_visitors", source: "web_visitors" }
    });
  }

  if (mapping?.resolutionState === "resolved" && mapping.contactId) {
    return { state: "resolved", confidence: "verified", matchMethod: "existing_mapping", contactId: mapping.contactId, companyId: company?.id ?? mapping.companyId, candidateContactIds: [], evidence: ["existing_mapping"], resolverVersion: WEB_VISITOR_RESOLVER_VERSION };
  }
  if (mapping?.resolutionState === "rejected") {
    return { state: "rejected", confidence: null, matchMethod: null, contactId: null, companyId: company?.id ?? mapping.companyId, candidateContactIds: [], evidence: ["admin_rejected"], resolverVersion: WEB_VISITOR_RESOLVER_VERSION };
  }

  const emailContact = input.profile.businessEmail
    ? await findContactByEmail(db, input.organizationId, input.profile.businessEmail)
    : null;
  const profileContact = input.profile.professionalProfileUrl
    ? await findContactByProfessionalProfile(db, input.organizationId, input.profile.professionalProfileUrl)
    : null;
  if (emailContact && profileContact && emailContact.id !== profileContact.id) {
    return { state: "ambiguous", confidence: null, matchMethod: null, contactId: null, companyId: company?.id ?? null, candidateContactIds: [emailContact.id, profileContact.id], evidence: ["business_email_conflict", "professional_profile_conflict"], resolverVersion: WEB_VISITOR_RESOLVER_VERSION };
  }

  let contact = emailContact ?? profileContact;
  let matchMethod: WebVisitorResolution["matchMethod"] = emailContact ? "business_email" : profileContact ? "professional_profile" : null;
  if (!contact && input.settings.createContacts && input.profile.businessEmail) {
    contact = await createContact(db, {
      organizationId: input.organizationId,
      email: input.profile.businessEmail,
      firstName: input.profile.firstName ?? null,
      lastName: input.profile.lastName ?? null,
      properties: { webVisitors: { title: input.profile.title ?? null } },
      change: { actorType: "system", actorId: "web_visitors", source: "web_visitors" }
    });
    matchMethod = "business_email";
  }
  if (contact && input.profile.professionalProfileUrl) {
    const normalizedProfile = normalizeProfessionalProfileUrl(input.profile.professionalProfileUrl);
    if (normalizedProfile) await upsertContactIdentity(db, { organizationId: input.organizationId, contactId: contact.id, identityType: "professional_profile", provider: "web_visitors", value: normalizedProfile, source: "web_visitors", metadata: { resolverVersion: WEB_VISITOR_RESOLVER_VERSION } });
  }
  if (contact && company) {
    await db.insert(contactCompanyAssociations).values({ organizationId: input.organizationId, contactId: contact.id, companyId: company.id, label: "primary" }).onConflictDoNothing();
  }
  return {
    state: contact ? "resolved" : company ? "resolved" : "unresolved",
    confidence: contact ? "high" : company ? "high" : "low",
    matchMethod: matchMethod ?? (company ? "company_domain" : null),
    contactId: contact?.id ?? null,
    companyId: company?.id ?? null,
    candidateContactIds: [],
    evidence: [emailContact ? "business_email" : null, profileContact ? "professional_profile" : null, company ? "company_domain" : null].filter((item): item is string => Boolean(item)),
    resolverVersion: WEB_VISITOR_RESOLVER_VERSION
  };
}

export async function processWebVisitorProfile(db: Db, input: {
  organizationId: string;
  integrationId: string;
  profile: WebVisitorProfile;
  settings: WebVisitorSettings;
}) {
  const resolution = await resolveWebVisitorIdentity(db, input);
  const fingerprint = buildWebVisitorIdentityFingerprint(input.profile);
  const now = new Date();
  await db.insert(webVisitorIdentityMappings).values({
    organizationId: input.organizationId,
    integrationId: input.integrationId,
    identityFingerprint: fingerprint,
    providerVisitorId: input.profile.visitorId ?? null,
    contactId: resolution.contactId,
    companyId: resolution.companyId,
    resolutionState: resolution.state,
    confidence: resolution.confidence,
    matchMethod: resolution.matchMethod,
    candidateContactIds: resolution.candidateContactIds,
    evidence: resolution.evidence,
    resolverVersion: resolution.resolverVersion,
    lastSeenAt: now,
    updatedAt: now
  }).onConflictDoUpdate({
    target: [webVisitorIdentityMappings.organizationId, webVisitorIdentityMappings.integrationId, webVisitorIdentityMappings.identityFingerprint],
    set: { contactId: resolution.contactId, companyId: resolution.companyId, resolutionState: resolution.state, confidence: resolution.confidence, matchMethod: resolution.matchMethod, candidateContactIds: resolution.candidateContactIds, evidence: resolution.evidence, resolverVersion: resolution.resolverVersion, lastSeenAt: now, updatedAt: now }
  });

  const contactId = resolution.state === "resolved" ? resolution.contactId : null;
  const companyId = contactId ? null : resolution.companyId;
  if (!contactId && !companyId) return { resolution, duplicate: false, attributed: false };
  const occurredAt = new Date(input.profile.seenAt);
  const dedupeKey = buildWebVisitorEventDedupeKey(input);
  const [event] = await db.insert(customerEvents).values({
    organizationId: input.organizationId,
    contactId,
    companyId,
    eventType: "web_visitor.visit",
    source: "web_visitors",
    occurredAt,
    dedupeKey,
    privacyClass: contactId ? "personal" : "business",
    payload: { capturedUrl: input.profile.capturedUrl, referrer: input.profile.referrer ?? null, tags: input.profile.tags, repeatVisit: input.profile.repeatVisit, profileType: input.profile.profileType, identityFingerprint: fingerprint, integrationId: input.integrationId, timePrecision: input.profile.timePrecision }
  }).onConflictDoNothing().returning();
  if (!event) return { resolution, duplicate: true, attributed: true };

  if (contactId) {
    await db.update(contacts).set({
      webVisitorVisitCount: sql`${contacts.webVisitorVisitCount} + 1`,
      webVisitorFirstVisitedAt: sql`least(coalesce(${contacts.webVisitorFirstVisitedAt}, ${occurredAt}), ${occurredAt})`,
      webVisitorLastVisitedAt: sql`greatest(coalesce(${contacts.webVisitorLastVisitedAt}, ${occurredAt}), ${occurredAt})`,
      updatedAt: now
    }).where(and(eq(contacts.organizationId, input.organizationId), eq(contacts.id, contactId)));
  } else if (companyId) {
    await db.update(companies).set({
      webVisitorVisitCount: sql`${companies.webVisitorVisitCount} + 1`,
      webVisitorFirstVisitedAt: sql`least(coalesce(${companies.webVisitorFirstVisitedAt}, ${occurredAt}), ${occurredAt})`,
      webVisitorLastVisitedAt: sql`greatest(coalesce(${companies.webVisitorLastVisitedAt}, ${occurredAt}), ${occurredAt})`,
      updatedAt: now
    }).where(and(eq(companies.organizationId, input.organizationId), eq(companies.id, companyId)));
  }
  return { resolution, duplicate: false, attributed: true, eventId: event.id };
}

export async function rebuildWebVisitorSummary(db: Db, input: {
  organizationId: string;
  contactId?: string | null;
  companyId?: string | null;
}) {
  if (input.contactId) {
    const [summary] = await db.select({
      count: sql<number>`count(*)::int`,
      firstVisitedAt: sql<Date | null>`min(${customerEvents.occurredAt})`,
      lastVisitedAt: sql<Date | null>`max(${customerEvents.occurredAt})`
    }).from(customerEvents).where(and(
      eq(customerEvents.organizationId, input.organizationId),
      eq(customerEvents.contactId, input.contactId),
      eq(customerEvents.eventType, "web_visitor.visit")
    ));
    await db.update(contacts).set({
      webVisitorVisitCount: Number(summary?.count ?? 0),
      webVisitorFirstVisitedAt: summary?.firstVisitedAt ?? null,
      webVisitorLastVisitedAt: summary?.lastVisitedAt ?? null,
      updatedAt: new Date()
    }).where(and(eq(contacts.organizationId, input.organizationId), eq(contacts.id, input.contactId)));
  }
  if (input.companyId) {
    const [summary] = await db.select({
      count: sql<number>`count(*)::int`,
      firstVisitedAt: sql<Date | null>`min(${customerEvents.occurredAt})`,
      lastVisitedAt: sql<Date | null>`max(${customerEvents.occurredAt})`
    }).from(customerEvents).where(and(
      eq(customerEvents.organizationId, input.organizationId),
      eq(customerEvents.companyId, input.companyId),
      eq(customerEvents.eventType, "web_visitor.visit")
    ));
    await db.update(companies).set({
      webVisitorVisitCount: Number(summary?.count ?? 0),
      webVisitorFirstVisitedAt: summary?.firstVisitedAt ?? null,
      webVisitorLastVisitedAt: summary?.lastVisitedAt ?? null,
      updatedAt: new Date()
    }).where(and(eq(companies.organizationId, input.organizationId), eq(companies.id, input.companyId)));
  }
}

export async function reviewWebVisitorResolution(db: Db, input: {
  organizationId: string;
  mappingId: string;
  action: "attach" | "reject";
  contactId?: string | null;
  reviewedBy: string;
}) {
  const [mapping] = await db.select().from(webVisitorIdentityMappings).where(and(
    eq(webVisitorIdentityMappings.organizationId, input.organizationId),
    eq(webVisitorIdentityMappings.id, input.mappingId)
  )).limit(1);
  if (!mapping) return null;
  if (input.action === "attach" && !input.contactId) throw new Error("contactId is required to attach a resolution");
  if (input.contactId) {
    const [contact] = await db.select({ id: contacts.id }).from(contacts).where(and(
      eq(contacts.organizationId, input.organizationId),
      eq(contacts.id, input.contactId),
      isNull(contacts.archivedAt)
    )).limit(1);
    if (!contact) throw new Error("Contact not found");
  }
  const now = new Date();
  const [updated] = await db.update(webVisitorIdentityMappings).set({
    contactId: input.action === "attach" ? input.contactId : null,
    resolutionState: input.action === "attach" ? "resolved" : "rejected",
    confidence: input.action === "attach" ? "verified" : null,
    matchMethod: input.action === "attach" ? "existing_mapping" : null,
    reviewedAt: now,
    reviewedBy: input.reviewedBy,
    updatedAt: now
  }).where(eq(webVisitorIdentityMappings.id, mapping.id)).returning();
  if (input.action === "attach" && input.contactId) {
    await db.update(customerEvents).set({ contactId: input.contactId, companyId: null }).where(and(
      eq(customerEvents.organizationId, input.organizationId),
      eq(customerEvents.eventType, "web_visitor.visit"),
      sql`${customerEvents.payload}->>'identityFingerprint' = ${mapping.identityFingerprint}`
    ));
    await rebuildWebVisitorSummary(db, { organizationId: input.organizationId, contactId: input.contactId, companyId: mapping.companyId });
  }
  return updated;
}
