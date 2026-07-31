import { and, asc, count, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
// neon-http workers use optimistic claim rather than SKIP LOCKED transactions
import { randomBytes, randomUUID } from "node:crypto";
import type { Db } from "./client.js";
import {
  mapHubspotPropertyType,
  normalizeHubspotInternalName,
  type PropertyDataType
} from "./hubspot.js";
import {
  agentIdentities,
  auditEvents,
  campaigns,
  companies,
  contacts,
  contactCompanyAssociations,
  contactIdentities,
  crmUsers,
  customerEvents,
  emailActivities,
  emailTrackingAddresses,
  externalRecordIds,
  forms,
  jobs,
  organizationBilling,
  organizationInvitations,
  organizations,
  propertyDefinitions,
  propertyHistory,
  savedViews,
  segments,
  stripeEvents,
  suppressionEntries,
  workflows,
  webhookEvents
} from "./schema.js";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizePhone(phone: string): string {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");
  return trimmed.startsWith("+") ? `+${digits}` : digits;
}

function normalizeIdentityValue(identityType: string, value: string): string {
  if (identityType === "email") return normalizeEmail(value);
  if (identityType === "phone") return normalizePhone(value);
  if (identityType === "linkedin" || identityType === "facebook" || identityType === "url") {
    return value.trim().toLowerCase().replace(/\/$/, "");
  }
  return value.trim();
}

type ContactChangeContext = {
  actorType?: string;
  actorId?: string;
  source?: string;
};

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalValue(item)]));
  }
  return value;
}

function valuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(canonicalValue(left)) === JSON.stringify(canonicalValue(right));
}

async function recordContactChanges(
  db: Db,
  input: {
    organizationId: string;
    contactId: string;
    previous: Record<string, unknown>;
    next: Record<string, unknown>;
    context?: ContactChangeContext;
  }
) {
  const keys = new Set([
    ...Object.keys(input.previous),
    ...Object.keys(input.next)
  ]);
  const changes = [...keys]
    .filter((key) => !valuesEqual(input.previous[key], input.next[key]));
  if (changes.length === 0) return;
  const changeSetId = randomUUID();
  await db.insert(propertyHistory).values(changes.map((propertyName) => ({
    organizationId: input.organizationId,
    objectType: "contact",
    recordId: input.contactId,
    propertyName,
    oldValue: input.previous[propertyName] ?? null,
    newValue: input.next[propertyName] ?? null,
    changeSetId,
    actorType: input.context?.actorType ?? "system",
    actorId: input.context?.actorId ?? "system",
    source: input.context?.source ?? "contact.update"
  })));
}

async function syncContactIdentities(
  db: Db,
  input: {
    organizationId: string;
    contactId: string;
    email: string;
    phone?: string | null;
    context?: ContactChangeContext;
  }
) {
  const now = new Date();
  const desired = [
    { identityType: "email", provider: "crm", value: input.email, isPrimary: true },
    ...(input.phone?.trim() ? [{ identityType: "phone", provider: "crm", value: input.phone, isPrimary: true }] : [])
  ].map((identity) => ({
    ...identity,
    normalizedValue: normalizeIdentityValue(identity.identityType, identity.value)
  }));
  const active = await db.select().from(contactIdentities).where(and(
    eq(contactIdentities.organizationId, input.organizationId),
    eq(contactIdentities.contactId, input.contactId),
    isNull(contactIdentities.endedAt)
  ));
  for (const identity of active) {
    const stillPresent = desired.some((item) =>
      item.identityType === identity.identityType &&
      item.provider === identity.provider &&
      item.normalizedValue === identity.normalizedValue
    );
    if (!stillPresent) {
      await db.update(contactIdentities).set({ endedAt: now, isPrimary: false, lastSeenAt: now })
        .where(eq(contactIdentities.id, identity.id));
    }
  }
  for (const identity of desired) {
    const [existing] = await db.select().from(contactIdentities).where(and(
      eq(contactIdentities.organizationId, input.organizationId),
      eq(contactIdentities.identityType, identity.identityType),
      eq(contactIdentities.provider, identity.provider),
      eq(contactIdentities.normalizedValue, identity.normalizedValue),
      isNull(contactIdentities.endedAt)
    )).limit(1);
    if (existing && existing.contactId !== input.contactId) {
      throw new Error(`${identity.identityType} identity is already assigned to another contact`);
    }
    if (existing) {
      await db.update(contactIdentities).set({ lastSeenAt: now, isPrimary: identity.isPrimary, displayValue: identity.value })
        .where(eq(contactIdentities.id, existing.id));
    } else {
      await db.insert(contactIdentities).values({
        organizationId: input.organizationId,
        contactId: input.contactId,
        identityType: identity.identityType,
        provider: identity.provider,
        normalizedValue: identity.normalizedValue,
        displayValue: identity.value,
        isPrimary: identity.isPrimary,
        source: input.context?.source ?? "crm",
        firstSeenAt: now,
        lastSeenAt: now
      });
    }
  }
}

export async function upsertContactIdentity(
  db: Db,
  input: {
    organizationId: string;
    contactId: string;
    identityType: string;
    provider?: string;
    value: string;
    verifiedAt?: Date | null;
    source?: string | null;
    metadata?: Record<string, unknown>;
  }
) {
  const provider = input.provider ?? "crm";
  const normalizedValue = normalizeIdentityValue(input.identityType, input.value);
  const [conflict] = await db.select().from(contactIdentities).where(and(
    eq(contactIdentities.organizationId, input.organizationId),
    eq(contactIdentities.identityType, input.identityType),
    eq(contactIdentities.provider, provider),
    eq(contactIdentities.normalizedValue, normalizedValue),
    isNull(contactIdentities.endedAt)
  )).limit(1);
  if (conflict && conflict.contactId !== input.contactId) {
    throw new Error(`${input.identityType} identity is already assigned to another contact`);
  }
  if (conflict) {
    const [row] = await db.update(contactIdentities).set({
      displayValue: input.value,
      verifiedAt: input.verifiedAt ?? conflict.verifiedAt,
      source: input.source ?? conflict.source,
      metadata: input.metadata ?? conflict.metadata,
      lastSeenAt: new Date()
    }).where(eq(contactIdentities.id, conflict.id)).returning();
    return row;
  }
  const [row] = await db.insert(contactIdentities).values({
    organizationId: input.organizationId,
    contactId: input.contactId,
    identityType: input.identityType,
    provider,
    normalizedValue,
    displayValue: input.value,
    verifiedAt: input.verifiedAt ?? null,
    source: input.source ?? null,
    metadata: input.metadata ?? {}
  }).returning();
  return row;
}

export function normalizeDomain(domain: string | null | undefined): string | null {
  if (!domain) return null;
  return domain.trim().toLowerCase().replace(/^www\./, "");
}

const CONTACT_COMPANY_PROPERTY_KEYS = [
  "company",
  "company_name",
  "companyname",
  "associatedcompany",
  "associated_company",
  "primary_company",
  "primary_company_name"
] as const;

export function extractContactCompanyName(properties: Record<string, unknown> | null | undefined): string | null {
  if (!properties) return null;
  for (const key of CONTACT_COMPANY_PROPERTY_KEYS) {
    const value = properties[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export function stripContactCompanyProperties(properties: Record<string, unknown> | null | undefined) {
  const next = { ...(properties ?? {}) };
  let removed = false;
  for (const key of CONTACT_COMPANY_PROPERTY_KEYS) {
    if (key in next) {
      delete next[key];
      removed = true;
    }
  }
  return { properties: next, removed };
}

async function seedDefaultPropertyDefinitions(db: Db, organizationId: string) {
  await db.insert(propertyDefinitions).values([
    {
      organizationId,
      objectType: "contact",
      internalName: "job_title",
      label: "Job Title",
      dataType: "string",
      searchable: true
    },
    {
      organizationId,
      objectType: "company",
      internalName: "employee_count",
      label: "Employee Count",
      dataType: "number",
      searchable: true
    }
  ]);
}

export async function writeAudit(
  db: Db,
  input: {
    organizationId: string;
    actorType: string;
    actorId: string;
    action: string;
    entityType: string;
    entityId?: string | null;
    metadata?: Record<string, unknown>;
  }
) {
  await db.insert(auditEvents).values({
    organizationId: input.organizationId,
    actorType: input.actorType,
    actorId: input.actorId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    metadata: input.metadata ?? {}
  });
}

export async function ensureBootstrapOrg(
  db: Db,
  options: { orgName: string; ownerSubject?: string; ownerEmail?: string }
) {
  const existing = await db.select().from(organizations).limit(1);
  if (existing[0]) {
    return existing[0];
  }
  const [org] = await db.insert(organizations).values({ name: options.orgName }).returning();
  if (options.ownerSubject) {
    await db.insert(crmUsers).values({
      organizationId: org.id,
      hexclaveSubject: options.ownerSubject,
      email: options.ownerEmail ?? null,
      role: "admin",
      displayName: "Owner"
    });
  }
  await seedDefaultPropertyDefinitions(db, org.id);
  return org;
}

export async function createOrganization(
  db: Db,
  input: {
    name: string;
    adminSubject?: string;
    email?: string | null;
    displayName?: string | null;
  }
) {
  const [org] = await db.insert(organizations).values({ name: input.name.trim() }).returning();
  await seedDefaultPropertyDefinitions(db, org.id);
  let admin = null;
  if (input.adminSubject) {
    const [created] = await db.insert(crmUsers).values({
      organizationId: org.id,
      hexclaveSubject: input.adminSubject,
      email: input.email ?? null,
      displayName: input.displayName ?? null,
      role: "admin"
    }).returning();
    admin = created;
  }
  return { organization: org, admin };
}

export async function getOrganizationBilling(db: Db, organizationId: string) {
  const rows = await db.select().from(organizationBilling)
    .where(eq(organizationBilling.organizationId, organizationId))
    .limit(1);
  return rows[0] ?? null;
}

export async function ensureOrganizationBilling(db: Db, organizationId: string) {
  const existing = await getOrganizationBilling(db, organizationId);
  if (existing) return existing;
  const [created] = await db.insert(organizationBilling).values({
    organizationId,
    status: "pending"
  }).returning();
  return created;
}

export async function updateOrganizationBilling(
  db: Db,
  organizationId: string,
  input: Partial<{
    status: string;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    stripeCheckoutSessionId: string | null;
    stripePriceId: string | null;
    currentPeriodEnd: Date | null;
    cancelAtPeriodEnd: boolean;
    lastStripeEventCreatedAt: Date | null;
  }>
) {
  const [updated] = await db.update(organizationBilling).set({
    ...input,
    updatedAt: new Date()
  }).where(eq(organizationBilling.organizationId, organizationId)).returning();
  return updated ?? null;
}

export async function findOrganizationBillingByStripeId(
  db: Db,
  input: { customerId?: string | null; subscriptionId?: string | null; checkoutSessionId?: string | null }
) {
  const conditions = [];
  if (input.customerId) conditions.push(eq(organizationBilling.stripeCustomerId, input.customerId));
  if (input.subscriptionId) conditions.push(eq(organizationBilling.stripeSubscriptionId, input.subscriptionId));
  if (input.checkoutSessionId) conditions.push(eq(organizationBilling.stripeCheckoutSessionId, input.checkoutSessionId));
  if (!conditions.length) return null;
  const rows = await db.select().from(organizationBilling).where(or(...conditions)).limit(1);
  return rows[0] ?? null;
}

export async function recordStripeEvent(
  db: Db,
  input: { stripeEventId: string; eventType: string; organizationId?: string | null; payload: unknown }
) {
  const existing = await db.select({ id: stripeEvents.id, processedAt: stripeEvents.processedAt }).from(stripeEvents)
    .where(eq(stripeEvents.stripeEventId, input.stripeEventId)).limit(1);
  if (existing[0]) return existing[0].processedAt === null;
  try {
    await db.insert(stripeEvents).values({
      stripeEventId: input.stripeEventId,
      eventType: input.eventType,
      organizationId: input.organizationId ?? null,
      payload: input.payload
    });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && (error as { code?: string }).code === "23505") {
      return false;
    }
    throw error;
  }
  return true;
}

export async function markStripeEventProcessed(db: Db, stripeEventId: string) {
  await db.update(stripeEvents).set({ processedAt: new Date() })
    .where(eq(stripeEvents.stripeEventId, stripeEventId));
}

export async function findCrmUserBySubject(db: Db, subject: string) {
  const rows = await db.select().from(crmUsers).where(eq(crmUsers.hexclaveSubject, subject)).limit(1);
  return rows[0] ?? null;
}

export async function getOrganizationById(db: Db, organizationId: string) {
  const rows = await db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  return rows[0] ?? null;
}

export async function listOrganizations(db: Db) {
  const rows = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      createdAt: organizations.createdAt,
      memberCount: count(crmUsers.id)
    })
    .from(organizations)
    .leftJoin(crmUsers, and(eq(crmUsers.organizationId, organizations.id), eq(crmUsers.active, true)))
    .groupBy(organizations.id)
    .orderBy(asc(organizations.name));
  return rows;
}

export async function listOrgMembers(db: Db, organizationId: string) {
  return db
    .select({
      id: crmUsers.id,
      email: crmUsers.email,
      displayName: crmUsers.displayName,
      role: crmUsers.role,
      active: crmUsers.active,
      createdAt: crmUsers.createdAt
    })
    .from(crmUsers)
    .where(eq(crmUsers.organizationId, organizationId))
    .orderBy(asc(crmUsers.createdAt));
}

export async function updateMemberRole(
  db: Db,
  organizationId: string,
  memberId: string,
  input: { role?: string; active?: boolean }
) {
  const [updated] = await db
    .update(crmUsers)
    .set({
      ...(input.role !== undefined ? { role: input.role } : {}),
      ...(input.active !== undefined ? { active: input.active } : {})
    })
    .where(and(eq(crmUsers.id, memberId), eq(crmUsers.organizationId, organizationId)))
    .returning();
  return updated ?? null;
}

export async function findOrCreateCrmUser(
  db: Db,
  input: {
    organizationId: string;
    subject: string;
    email?: string | null;
    displayName?: string | null;
    defaultRole?: string;
  }
) {
  const existing = await findCrmUserBySubject(db, input.subject);
  if (existing) return existing;
  const [created] = await db.insert(crmUsers).values({
    organizationId: input.organizationId,
    hexclaveSubject: input.subject,
    email: input.email ?? null,
    displayName: input.displayName ?? null,
    role: input.defaultRole ?? "member"
  }).returning();
  return created;
}

export function createInviteToken(): string {
  return randomBytes(32).toString("hex");
}

export async function createInvitation(
  db: Db,
  input: {
    organizationId: string;
    email: string;
    role: "admin" | "member";
    invitedByUserId?: string | null;
    expiresInDays?: number;
  }
) {
  const emailNormalized = normalizeEmail(input.email);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + (input.expiresInDays ?? 14));
  const token = createInviteToken();

  const existing = await db
    .select()
    .from(organizationInvitations)
    .where(and(
      eq(organizationInvitations.organizationId, input.organizationId),
      eq(organizationInvitations.emailNormalized, emailNormalized),
      isNull(organizationInvitations.acceptedAt)
    ))
    .limit(1);

  if (existing[0]) {
    const [updated] = await db
      .update(organizationInvitations)
      .set({
        role: input.role,
        token,
        invitedByUserId: input.invitedByUserId ?? null,
        expiresAt
      })
      .where(eq(organizationInvitations.id, existing[0].id))
      .returning();
    return updated;
  }

  const [created] = await db.insert(organizationInvitations).values({
    organizationId: input.organizationId,
    email: input.email.trim(),
    emailNormalized,
    role: input.role,
    token,
    invitedByUserId: input.invitedByUserId ?? null,
    expiresAt
  }).returning();
  return created;
}

export async function listPendingInvitations(db: Db, organizationId: string) {
  return db
    .select()
    .from(organizationInvitations)
    .where(and(
      eq(organizationInvitations.organizationId, organizationId),
      isNull(organizationInvitations.acceptedAt)
    ))
    .orderBy(desc(organizationInvitations.createdAt));
}

export async function findInvitationByToken(db: Db, token: string) {
  const rows = await db
    .select({
      invitation: organizationInvitations,
      organizationName: organizations.name
    })
    .from(organizationInvitations)
    .innerJoin(organizations, eq(organizations.id, organizationInvitations.organizationId))
    .where(eq(organizationInvitations.token, token))
    .limit(1);
  return rows[0] ?? null;
}

export async function acceptInvitation(
  db: Db,
  input: {
    token: string;
    subject: string;
    email?: string | null;
    displayName?: string | null;
  }
) {
  const found = await findInvitationByToken(db, input.token);
  if (!found) {
    const error = new Error("Invitation not found") as Error & { statusCode: number };
    error.statusCode = 404;
    throw error;
  }
  const { invitation } = found;
  if (invitation.acceptedAt) {
    const error = new Error("Invitation already accepted") as Error & { statusCode: number };
    error.statusCode = 409;
    throw error;
  }
  if (invitation.expiresAt.getTime() < Date.now()) {
    const error = new Error("Invitation expired") as Error & { statusCode: number };
    error.statusCode = 410;
    throw error;
  }

  const existingUser = await findCrmUserBySubject(db, input.subject);
  if (existingUser) {
    const error = new Error("You already belong to a company") as Error & { statusCode: number };
    error.statusCode = 409;
    throw error;
  }

  if (input.email && normalizeEmail(input.email) !== invitation.emailNormalized) {
    const error = new Error("Signed-in email does not match the invitation") as Error & { statusCode: number };
    error.statusCode = 403;
    throw error;
  }

  const [user] = await db.insert(crmUsers).values({
    organizationId: invitation.organizationId,
    hexclaveSubject: input.subject,
    email: input.email ?? invitation.email,
    displayName: input.displayName ?? null,
    role: invitation.role
  }).returning();

  await db
    .update(organizationInvitations)
    .set({ acceptedAt: new Date() })
    .where(eq(organizationInvitations.id, invitation.id));

  return { user, organizationId: invitation.organizationId, organizationName: found.organizationName };
}

export async function searchContacts(
  db: Db,
  organizationId: string,
  options: { query?: string; limit?: number; page?: number; includeArchived?: boolean }
) {
  const limit = options.limit ?? 25;
  const page = options.page ?? 1;
  const offset = Math.max(0, (page - 1) * limit);
  const filters = buildContactSearchFilters(organizationId, options);
  return db.select().from(contacts).where(and(...filters)).orderBy(desc(contacts.updatedAt)).limit(limit).offset(offset);
}

export async function countContacts(
  db: Db,
  organizationId: string,
  options: { query?: string; includeArchived?: boolean } = {}
) {
  const filters = buildContactSearchFilters(organizationId, options);
  const rows = await db.select({ value: count() }).from(contacts).where(and(...filters));
  return Number(rows[0]?.value ?? 0);
}

export async function createContact(
  db: Db,
  input: {
    organizationId: string;
    email: string;
    phone?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    lifecycleStage?: string | null;
    properties?: Record<string, unknown>;
    change?: ContactChangeContext;
  }
) {
  const emailNormalized = normalizeEmail(input.email);
  const phone = input.phone?.trim() || null;
  const [row] = await db.insert(contacts).values({
    organizationId: input.organizationId,
    email: input.email.trim(),
    emailNormalized,
    phone,
    phoneNormalized: phone ? normalizePhone(phone) : null,
    firstName: input.firstName ?? null,
    lastName: input.lastName ?? null,
    lifecycleStage: input.lifecycleStage ?? null,
    properties: input.properties ?? {}
  }).returning();
  await recordContactChanges(db, {
    organizationId: input.organizationId,
    contactId: row.id,
    previous: {},
    next: {
      email: row.email,
      phone: row.phone,
      firstName: row.firstName,
      lastName: row.lastName,
      lifecycleStage: row.lifecycleStage,
      ...Object.fromEntries(Object.entries((row.properties ?? {}) as Record<string, unknown>)
        .map(([key, value]) => [`properties.${key}`, value]))
    },
    context: { ...input.change, source: input.change?.source ?? "contact.create" }
  });
  await syncContactIdentities(db, {
    organizationId: input.organizationId,
    contactId: row.id,
    email: row.email,
    phone: row.phone,
    context: input.change
  });
  return row;
}

export async function updateContact(
  db: Db,
  organizationId: string,
  id: string,
  input: {
    email?: string;
    phone?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    lifecycleStage?: string | null;
    properties?: Record<string, unknown>;
    version?: number;
    change?: ContactChangeContext;
  }
) {
  const existing = await db.select().from(contacts).where(and(eq(contacts.id, id), eq(contacts.organizationId, organizationId))).limit(1);
  const current = existing[0];
  if (!current) return null;
  if (input.version !== undefined && input.version !== current.version) {
    return { conflict: true as const, current };
  }
  const nextEmail = input.email?.trim() ?? current.email;
  const nextPhone = input.phone === undefined ? current.phone : input.phone?.trim() || null;
  const nextProperties = input.properties ?? current.properties;
  const updateFilters = [eq(contacts.id, id), eq(contacts.organizationId, organizationId)];
  if (input.version !== undefined) updateFilters.push(eq(contacts.version, current.version));
  const [row] = await db.update(contacts).set({
    email: nextEmail,
    emailNormalized: input.email ? normalizeEmail(input.email) : current.emailNormalized,
    phone: nextPhone,
    phoneNormalized: nextPhone ? normalizePhone(nextPhone) : null,
    firstName: input.firstName === undefined ? current.firstName : input.firstName,
    lastName: input.lastName === undefined ? current.lastName : input.lastName,
    lifecycleStage: input.lifecycleStage === undefined ? current.lifecycleStage : input.lifecycleStage,
    properties: nextProperties,
    version: current.version + 1,
    updatedAt: new Date()
  }).where(and(...updateFilters)).returning();
  if (!row) {
    const [latest] = await db.select().from(contacts).where(and(
      eq(contacts.id, id),
      eq(contacts.organizationId, organizationId)
    )).limit(1);
    return { conflict: true as const, current: latest ?? current };
  }
  await recordContactChanges(db, {
    organizationId,
    contactId: row.id,
    previous: {
      email: current.email,
      phone: current.phone,
      firstName: current.firstName,
      lastName: current.lastName,
      lifecycleStage: current.lifecycleStage,
      ...Object.fromEntries(Object.entries((current.properties ?? {}) as Record<string, unknown>)
        .map(([key, value]) => [`properties.${key}`, value]))
    },
    next: {
      email: row.email,
      phone: row.phone,
      firstName: row.firstName,
      lastName: row.lastName,
      lifecycleStage: row.lifecycleStage,
      ...Object.fromEntries(Object.entries((row.properties ?? {}) as Record<string, unknown>)
        .map(([key, value]) => [`properties.${key}`, value]))
    },
    context: input.change
  });
  await syncContactIdentities(db, {
    organizationId,
    contactId: row.id,
    email: row.email,
    phone: row.phone,
    context: input.change
  });
  return { conflict: false as const, row };
}

export async function setPrimaryCompanyAssociation(
  db: Db,
  input: {
    organizationId: string;
    contactId: string;
    companyId: string;
  }
) {
  await db.update(contactCompanyAssociations)
    .set({ label: "secondary" })
    .where(and(
      eq(contactCompanyAssociations.organizationId, input.organizationId),
      eq(contactCompanyAssociations.contactId, input.contactId),
      eq(contactCompanyAssociations.label, "primary")
    ));

  await db.insert(contactCompanyAssociations).values({
    organizationId: input.organizationId,
    contactId: input.contactId,
    companyId: input.companyId,
    label: "primary"
  }).onConflictDoNothing();

  const [row] = await db.update(contactCompanyAssociations).set({ label: "primary" })
    .where(and(
      eq(contactCompanyAssociations.organizationId, input.organizationId),
      eq(contactCompanyAssociations.contactId, input.contactId),
      eq(contactCompanyAssociations.companyId, input.companyId)
    ))
    .returning();
  return row;
}

export async function resolveContactCompanyAssociation(
  db: Db,
  input: {
    organizationId: string;
    contactId: string;
    companyName?: string | null;
    companyIndustry?: string | null;
  }
) {
  const companyName = input.companyName?.trim();
  if (!companyName) return null;
  const company = await upsertCompanyByName(db, {
    organizationId: input.organizationId,
    name: companyName,
    industry: input.companyIndustry ?? undefined
  });
  await setPrimaryCompanyAssociation(db, {
    organizationId: input.organizationId,
    contactId: input.contactId,
    companyId: company.row.id
  });
  return company.row;
}

export async function reconcileContactCompanyAssociations(
  db: Db,
  input: {
    organizationId: string;
  }
) {
  const rows = await db.select().from(contacts).where(and(
    eq(contacts.organizationId, input.organizationId),
    isNull(contacts.archivedAt)
  ));

  let matched = 0;
  let createdCompanies = 0;
  let cleanedProperties = 0;
  let skipped = 0;

  for (const contact of rows) {
    const companyName = extractContactCompanyName((contact.properties ?? {}) as Record<string, unknown>);
    if (!companyName) {
      skipped += 1;
      continue;
    }

    const existingCompany = await findCompanyByName(db, input.organizationId, companyName);
    const company = await resolveContactCompanyAssociation(db, {
      organizationId: input.organizationId,
      contactId: contact.id,
      companyName
    });
    if (!company) {
      skipped += 1;
      continue;
    }
    matched += 1;
    if (!existingCompany) createdCompanies += 1;

    const stripped = stripContactCompanyProperties((contact.properties ?? {}) as Record<string, unknown>);
    if (stripped.removed) {
      await updateContact(db, input.organizationId, contact.id, {
        properties: stripped.properties,
        change: {
          actorType: "system",
          actorId: "reconcile-contact-companies",
          source: "contact.company.reconcile"
        }
      });
      cleanedProperties += 1;
    }
  }

  return { scanned: rows.length, matched, createdCompanies, cleanedProperties, skipped };
}

export async function findContactByEmail(db: Db, organizationId: string, email: string) {
  const rows = await db.select().from(contacts).where(and(
    eq(contacts.organizationId, organizationId),
    eq(contacts.emailNormalized, normalizeEmail(email))
  )).limit(1);
  if (rows[0]) return rows[0];
  const identities = await db.select({ contactId: contactIdentities.contactId }).from(contactIdentities).where(and(
    eq(contactIdentities.organizationId, organizationId),
    eq(contactIdentities.identityType, "email"),
    eq(contactIdentities.provider, "crm"),
    eq(contactIdentities.normalizedValue, normalizeEmail(email)),
    isNull(contactIdentities.endedAt)
  )).limit(1);
  if (!identities[0]) return null;
  return getContactById(db, organizationId, identities[0].contactId);
}

export async function findContactByExternalRecordId(
  db: Db,
  input: { organizationId: string; provider: string; objectType: string; externalId: string }
) {
  const rows = await db.select({ internalId: externalRecordIds.internalId }).from(externalRecordIds).where(and(
    eq(externalRecordIds.organizationId, input.organizationId),
    eq(externalRecordIds.provider, input.provider),
    eq(externalRecordIds.objectType, input.objectType),
    eq(externalRecordIds.externalId, input.externalId)
  )).limit(1);
  if (!rows[0]) return null;
  return getContactById(db, input.organizationId, rows[0].internalId);
}

export async function findContactsByEmails(db: Db, organizationId: string, emails: string[]) {
  const normalized = [...new Set(emails.map(normalizeEmail).filter(Boolean))];
  if (normalized.length === 0) return [];
  return db.select().from(contacts).where(and(
    eq(contacts.organizationId, organizationId),
    inArray(contacts.emailNormalized, normalized)
  ));
}

export async function getEmailTrackingAddress(db: Db, organizationId: string, userId: string) {
  const rows = await db.select().from(emailTrackingAddresses).where(and(
    eq(emailTrackingAddresses.organizationId, organizationId),
    eq(emailTrackingAddresses.userId, userId),
    eq(emailTrackingAddresses.active, true)
  )).limit(1);
  return rows[0] ?? null;
}

export async function isEmailSuppressed(db: Db, organizationId: string, email: string) {
  const rows = await db.select().from(suppressionEntries).where(and(
    eq(suppressionEntries.organizationId, organizationId),
    eq(suppressionEntries.emailNormalized, normalizeEmail(email))
  )).limit(1);
  return Boolean(rows[0]);
}

export async function enqueueJob(
  db: Db,
  input: { organizationId?: string | null; kind: string; payload: Record<string, unknown>; priority?: number; availableAt?: Date }
) {
  const [job] = await db.insert(jobs).values({
    organizationId: input.organizationId ?? null,
    kind: input.kind,
    payload: input.payload,
    priority: input.priority ?? 100,
    availableAt: input.availableAt ?? new Date()
  }).returning();
  return job;
}

export async function claimJobs(db: Db, limit = 10) {
  const queued = await db.select().from(jobs).where(and(
    eq(jobs.status, "queued"),
    sql`${jobs.availableAt} <= NOW()`
  )).orderBy(asc(jobs.priority), asc(jobs.availableAt)).limit(limit);

  const claimed: Array<typeof jobs.$inferSelect> = [];
  for (const job of queued) {
    const updated = await db.update(jobs).set({
      status: "running",
      lockedAt: new Date(),
      attempts: job.attempts + 1
    }).where(and(eq(jobs.id, job.id), eq(jobs.status, "queued"))).returning();
    if (updated[0]) claimed.push(updated[0]);
  }
  return claimed;
}

export async function completeJob(db: Db, id: string, error?: string, options?: { maxAttempts?: number }) {
  if (error) {
    const maxAttempts = options?.maxAttempts ?? 5;
    const [current] = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
    const attempts = current?.attempts ?? 1;
    const retryable = attempts < maxAttempts;
    await db.update(jobs).set({
      status: retryable ? "queued" : "failed",
      lastError: error,
      lockedAt: null,
      availableAt: new Date(Date.now() + Math.min(60_000 * attempts, 15 * 60_000))
    }).where(eq(jobs.id, id));
    return;
  }
  await db.update(jobs).set({
    status: "completed",
    completedAt: new Date(),
    lastError: null,
    lockedAt: null
  }).where(eq(jobs.id, id));
}

export async function getContactById(db: Db, organizationId: string, id: string) {
  const rows = await db.select().from(contacts).where(and(
    eq(contacts.organizationId, organizationId),
    eq(contacts.id, id)
  )).limit(1);
  return rows[0] ?? null;
}

function buildContactSearchFilters(
  organizationId: string,
  options: { query?: string; includeArchived?: boolean }
) {
  const filters: SQL[] = [eq(contacts.organizationId, organizationId)];
  if (!options.includeArchived) {
    filters.push(isNull(contacts.archivedAt));
  }
  if (options.query) {
    const q = `%${options.query}%`;
    filters.push(or(
      ilike(contacts.email, q),
      ilike(contacts.phone, q),
      ilike(contacts.firstName, q),
      ilike(contacts.lastName, q),
      sql`exists (
        select 1
        from ${contactCompanyAssociations}
        inner join ${companies} on ${companies.id} = ${contactCompanyAssociations.companyId}
        where ${contactCompanyAssociations.contactId} = ${contacts.id}
          and ${contactCompanyAssociations.organizationId} = ${organizationId}
          and ${companies.organizationId} = ${organizationId}
          and ${companies.archivedAt} is null
          and ${companies.name} ilike ${q}
      )`
    )!);
  }
  return filters;
}

export async function listCompanies(
  db: Db,
  organizationId: string,
  options: { query?: string; limit?: number; page?: number } = {}
) {
  const limit = options.limit ?? 25;
  const page = options.page ?? 1;
  const offset = Math.max(0, (page - 1) * limit);
  const filters: SQL[] = [eq(companies.organizationId, organizationId), isNull(companies.archivedAt)];
  if (options.query) {
    const q = `%${options.query}%`;
    filters.push(or(ilike(companies.name, q), ilike(companies.domain, q))!);
  }
  return db.select().from(companies).where(and(...filters)).orderBy(asc(companies.name)).limit(limit).offset(offset);
}

export async function countCompanies(
  db: Db,
  organizationId: string,
  options: { query?: string } = {}
) {
  const filters: SQL[] = [eq(companies.organizationId, organizationId), isNull(companies.archivedAt)];
  if (options.query) {
    const q = `%${options.query}%`;
    filters.push(or(ilike(companies.name, q), ilike(companies.domain, q))!);
  }
  const rows = await db.select({ value: count() }).from(companies).where(and(...filters));
  return Number(rows[0]?.value ?? 0);
}

export async function findCompanyByName(db: Db, organizationId: string, name: string) {
  const normalized = name.trim();
  if (!normalized) return null;
  const rows = await db.select().from(companies).where(and(
    eq(companies.organizationId, organizationId),
    eq(companies.name, normalized),
    isNull(companies.archivedAt)
  )).limit(1);
  return rows[0] ?? null;
}

export async function upsertCompanyByName(
  db: Db,
  input: {
    organizationId: string;
    name: string;
    domain?: string | null;
    industry?: string | null;
    properties?: Record<string, unknown>;
  }
) {
  const existing = await findCompanyByName(db, input.organizationId, input.name);
  if (!existing) {
    const [row] = await db.insert(companies).values({
      organizationId: input.organizationId,
      name: input.name.trim(),
      domain: input.domain ?? null,
      domainNormalized: normalizeDomain(input.domain),
      industry: input.industry ?? null,
      properties: input.properties ?? {}
    }).returning();
    return { row, created: true as const };
  }

  const [row] = await db.update(companies).set({
    domain: input.domain === undefined ? existing.domain : input.domain,
    domainNormalized: input.domain === undefined ? existing.domainNormalized : normalizeDomain(input.domain),
    industry: input.industry === undefined ? existing.industry : input.industry,
    properties: {
      ...((existing.properties ?? {}) as Record<string, unknown>),
      ...(input.properties ?? {})
    },
    version: existing.version + 1,
    updatedAt: new Date()
  }).where(eq(companies.id, existing.id)).returning();
  return { row, created: false as const };
}

export async function getContactTimeline(db: Db, organizationId: string, contactId: string) {
  const [events, activities] = await Promise.all([
    db.select().from(customerEvents).where(and(
      eq(customerEvents.organizationId, organizationId),
      eq(customerEvents.contactId, contactId)
    )).orderBy(desc(customerEvents.occurredAt)).limit(100),
    db.select().from(emailActivities).where(and(
      eq(emailActivities.organizationId, organizationId),
      eq(emailActivities.contactId, contactId)
    )).orderBy(desc(emailActivities.occurredAt)).limit(100)
  ]);
  const emailEvents = activities.map((activity) => ({
    id: activity.id,
    organizationId: activity.organizationId,
    contactId: activity.contactId,
    companyId: null,
    eventType: `email.${activity.activityType}`,
    source: activity.direction === "inbound" ? "email_inbound" : "email_outbound",
    occurredAt: activity.occurredAt,
    payload: {
      direction: activity.direction,
      activityType: activity.activityType,
      provider: activity.provider,
      providerEmailId: activity.providerEmailId,
      fromEmail: activity.fromEmail,
      toEmails: activity.toEmails,
      ccEmails: activity.ccEmails,
      bccEmails: activity.bccEmails,
      subject: activity.subject,
      messageId: activity.messageId,
      inReplyTo: activity.inReplyTo,
      threadKey: activity.threadKey,
      bodyText: activity.bodyText,
      metadata: activity.metadata
    },
    dedupeKey: activity.dedupeKey,
    privacyClass: "standard",
    createdAt: activity.createdAt
  }));
  return [...events, ...emailEvents]
    .sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime())
    .slice(0, 100);
}

export async function getContactPropertyHistory(db: Db, organizationId: string, contactId: string) {
  return db.select().from(propertyHistory).where(and(
    eq(propertyHistory.organizationId, organizationId),
    eq(propertyHistory.objectType, "contact"),
    eq(propertyHistory.recordId, contactId)
  )).orderBy(desc(propertyHistory.createdAt)).limit(250);
}

export async function findAgentByCredentialHash(db: Db, credentialHash: string) {
  const rows = await db.select().from(agentIdentities).where(eq(agentIdentities.credentialHash, credentialHash)).limit(1);
  const agent = rows[0];
  if (!agent || agent.revokedAt) return null;
  if (agent.expiresAt && agent.expiresAt.getTime() < Date.now()) return null;
  return agent;
}

export async function touchAgent(db: Db, id: string) {
  await db.update(agentIdentities).set({ lastUsedAt: new Date() }).where(eq(agentIdentities.id, id));
}

export async function storeWebhookEvent(
  db: Db,
  input: { organizationId?: string | null; provider: string; eventType?: string; payload: unknown; signatureValid: boolean }
) {
  const [row] = await db.insert(webhookEvents).values({
    organizationId: input.organizationId ?? null,
    provider: input.provider,
    eventType: input.eventType ?? null,
    payload: input.payload as Record<string, unknown>,
    signatureValid: input.signatureValid
  }).returning();
  return row;
}

export async function listCampaigns(db: Db, organizationId: string) {
  return db.select().from(campaigns).where(eq(campaigns.organizationId, organizationId)).orderBy(desc(campaigns.updatedAt));
}

export async function listSegments(db: Db, organizationId: string, options: { query?: string; limit?: number } = {}) {
  const filters = [eq(segments.organizationId, organizationId)];
  if (options.query?.trim()) {
    filters.push(ilike(segments.name, `%${options.query.trim()}%`));
  }
  const query = db.select().from(segments)
    .where(and(...filters))
    .orderBy(asc(segments.name));
  return options.limit === undefined
    ? query
    : query.limit(Math.min(Math.max(options.limit, 1), 100));
}

export async function getSegmentById(db: Db, organizationId: string, id: string) {
  const rows = await db.select().from(segments).where(and(
    eq(segments.organizationId, organizationId),
    eq(segments.id, id)
  )).limit(1);
  return rows[0] ?? null;
}

export async function listPropertyDefinitions(
  db: Db,
  organizationId: string,
  options?: { objectType?: string; includeArchived?: boolean }
) {
  const filters: SQL[] = [eq(propertyDefinitions.organizationId, organizationId)];
  if (options?.objectType) {
    filters.push(eq(propertyDefinitions.objectType, options.objectType));
  }
  if (!options?.includeArchived) {
    filters.push(eq(propertyDefinitions.archived, false));
  }
  return db.select().from(propertyDefinitions).where(and(...filters)).orderBy(asc(propertyDefinitions.label));
}

export async function upsertPropertyDefinition(
  db: Db,
  input: {
    organizationId: string;
    objectType: string;
    internalName: string;
    label: string;
    dataType: PropertyDataType;
    fieldGroup?: string | null;
    options?: unknown[];
    required?: boolean;
    searchable?: boolean;
    hubspotMetadata?: Record<string, unknown>;
    archived?: boolean;
  }
) {
  const internalName = normalizeHubspotInternalName(input.internalName);
  const existing = await db.select().from(propertyDefinitions).where(and(
    eq(propertyDefinitions.organizationId, input.organizationId),
    eq(propertyDefinitions.objectType, input.objectType),
    eq(propertyDefinitions.internalName, internalName)
  )).limit(1);

  if (existing[0]) {
    const [row] = await db.update(propertyDefinitions).set({
      label: input.label,
      dataType: input.dataType,
      fieldGroup: input.fieldGroup ?? null,
      options: input.options ?? [],
      required: input.required ?? false,
      searchable: input.searchable ?? false,
      hubspotMetadata: input.hubspotMetadata ?? {},
      archived: input.archived ?? false
    }).where(eq(propertyDefinitions.id, existing[0].id)).returning();
    return { row, created: false as const };
  }

  const [row] = await db.insert(propertyDefinitions).values({
    organizationId: input.organizationId,
    objectType: input.objectType,
    internalName,
    label: input.label,
    dataType: input.dataType,
    fieldGroup: input.fieldGroup ?? null,
    options: input.options ?? [],
    required: input.required ?? false,
    searchable: input.searchable ?? false,
    hubspotMetadata: input.hubspotMetadata ?? {},
    archived: input.archived ?? false
  }).returning();
  return { row, created: true as const };
}

export type ContactPropertyDeletionImpact = {
  property: {
    id: string;
    label: string;
    internalName: string;
    archived: boolean;
  };
  contactsWithValue: number;
  historyEntries: number;
  references: {
    segments: number;
    forms: number;
    workflows: number;
    savedViews: number;
  };
};

function escapeLikePattern(value: string) {
  return value.replace(/[%_\\]/g, "\\$&");
}

export async function getContactPropertyDeletionImpact(
  db: Db,
  organizationId: string,
  propertyDefinitionId: string
): Promise<ContactPropertyDeletionImpact | null> {
  const [property] = await db.select().from(propertyDefinitions).where(and(
    eq(propertyDefinitions.id, propertyDefinitionId),
    eq(propertyDefinitions.organizationId, organizationId),
    eq(propertyDefinitions.objectType, "contact")
  )).limit(1);

  if (!property) return null;

  const internalName = property.internalName;
  const directReferencePattern = `%${escapeLikePattern(`properties.${internalName}`)}%`;
  const plainReferencePattern = `%${escapeLikePattern(internalName)}%`;

  const [
    contactRows,
    historyRows,
    segmentRows,
    formRows,
    workflowRows,
    savedViewRows
  ] = await Promise.all([
    db.select({ count: count() }).from(contacts).where(and(
      eq(contacts.organizationId, organizationId),
      sql`${contacts.properties} ? ${internalName}`
    )),
    db.select({ count: count() }).from(propertyHistory).where(and(
      eq(propertyHistory.organizationId, organizationId),
      eq(propertyHistory.objectType, "contact"),
      eq(propertyHistory.propertyName, internalName)
    )),
    db.select({ count: count() }).from(segments).where(and(
      eq(segments.organizationId, organizationId),
      sql`coalesce(${segments.filterAst}::text, '') ilike ${directReferencePattern} escape '\\'`
    )),
    db.select({ count: count() }).from(forms).where(and(
      eq(forms.organizationId, organizationId),
      sql`coalesce(${forms.fields}::text, '') ilike ${plainReferencePattern} escape '\\'`
    )),
    db.select({ count: count() }).from(workflows).where(and(
      eq(workflows.organizationId, organizationId),
      sql`coalesce(${workflows.definition}::text, '') ilike ${plainReferencePattern} escape '\\'`
    )),
    db.select({ count: count() }).from(savedViews).where(and(
      eq(savedViews.organizationId, organizationId),
      eq(savedViews.objectType, "contact"),
      sql`(
        coalesce(${savedViews.filterAst}::text, '') ilike ${directReferencePattern} escape '\\'
        or coalesce(${savedViews.columns}::text, '') ilike ${plainReferencePattern} escape '\\'
      )`
    ))
  ]);

  return {
    property: {
      id: property.id,
      label: property.label,
      internalName: property.internalName,
      archived: property.archived
    },
    contactsWithValue: Number(contactRows[0]?.count ?? 0),
    historyEntries: Number(historyRows[0]?.count ?? 0),
    references: {
      segments: Number(segmentRows[0]?.count ?? 0),
      forms: Number(formRows[0]?.count ?? 0),
      workflows: Number(workflowRows[0]?.count ?? 0),
      savedViews: Number(savedViewRows[0]?.count ?? 0)
    }
  };
}

export async function deleteContactPropertyDefinition(
  db: Db,
  organizationId: string,
  propertyDefinitionId: string
) {
  const impact = await getContactPropertyDeletionImpact(db, organizationId, propertyDefinitionId);
  if (!impact) return null;

  await db.update(contacts).set({
    properties: sql`${contacts.properties} - ${impact.property.internalName}`
  }).where(and(
    eq(contacts.organizationId, organizationId),
    sql`${contacts.properties} ? ${impact.property.internalName}`
  ));

  const [deleted] = await db.delete(propertyDefinitions).where(and(
    eq(propertyDefinitions.id, propertyDefinitionId),
    eq(propertyDefinitions.organizationId, organizationId),
    eq(propertyDefinitions.objectType, "contact")
  )).returning();

  if (!deleted) return null;

  return {
    deleted,
    impact
  };
}

export async function upsertPropertyDefinitionFromHubspot(
  db: Db,
  organizationId: string,
  objectType: string,
  raw: {
    name: string;
    label?: string;
    type?: string;
    fieldType?: string;
    groupName?: string;
    options?: unknown[];
    hidden?: boolean;
  }
) {
  const dataType = mapHubspotPropertyType(raw.type, raw.fieldType);
  return upsertPropertyDefinition(db, {
    organizationId,
    objectType,
    internalName: raw.name,
    label: raw.label?.trim() || raw.name,
    dataType,
    fieldGroup: raw.groupName ?? null,
    options: Array.isArray(raw.options) ? raw.options : [],
    searchable: dataType === "string" || dataType === "enum",
    hubspotMetadata: {
      type: raw.type ?? null,
      fieldType: raw.fieldType ?? null,
      groupName: raw.groupName ?? null,
      name: raw.name
    },
    archived: Boolean(raw.hidden)
  });
}

export async function upsertContactByEmail(
  db: Db,
  input: {
    organizationId: string;
    email: string;
    phone?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    lifecycleStage?: string | null;
    properties?: Record<string, unknown>;
    change?: ContactChangeContext;
  }
) {
  const existing = await findContactByEmail(db, input.organizationId, input.email);
  if (!existing) {
    const row = await createContact(db, input);
    return { row, created: true as const };
  }
  const mergedProperties = {
    ...((existing.properties ?? {}) as Record<string, unknown>),
    ...(input.properties ?? {})
  };
  const result = await updateContact(db, input.organizationId, existing.id, {
    email: input.email,
    firstName: input.firstName === undefined ? existing.firstName : input.firstName,
    lastName: input.lastName === undefined ? existing.lastName : input.lastName,
    phone: input.phone === undefined ? existing.phone : input.phone,
    lifecycleStage: input.lifecycleStage === undefined ? existing.lifecycleStage : input.lifecycleStage,
    properties: mergedProperties,
    change: input.change
  });
  if (!result || result.conflict) {
    throw new Error("Failed to upsert contact");
  }
  return { row: result.row, created: false as const };
}

export async function upsertExternalRecordId(
  db: Db,
  input: {
    organizationId: string;
    provider: string;
    objectType: string;
    externalId: string;
    internalId: string;
    rawPayload?: Record<string, unknown>;
  }
) {
  const existing = await db.select().from(externalRecordIds).where(and(
    eq(externalRecordIds.organizationId, input.organizationId),
    eq(externalRecordIds.provider, input.provider),
    eq(externalRecordIds.objectType, input.objectType),
    eq(externalRecordIds.externalId, input.externalId)
  )).limit(1);

  if (existing[0]) {
    const [row] = await db.update(externalRecordIds).set({
      internalId: input.internalId,
      rawPayload: input.rawPayload ?? {}
    }).where(eq(externalRecordIds.id, existing[0].id)).returning();
    return row;
  }

  const [row] = await db.insert(externalRecordIds).values({
    organizationId: input.organizationId,
    provider: input.provider,
    objectType: input.objectType,
    externalId: input.externalId,
    internalId: input.internalId,
    rawPayload: input.rawPayload ?? {}
  }).returning();
  return row;
}
