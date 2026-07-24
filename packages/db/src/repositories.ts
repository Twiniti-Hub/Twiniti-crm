import { and, asc, count, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
// neon-http workers use optimistic claim rather than SKIP LOCKED transactions
import { randomBytes } from "node:crypto";
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
  crmUsers,
  customerEvents,
  emailActivities,
  emailTrackingAddresses,
  externalRecordIds,
  jobs,
  organizationInvitations,
  organizations,
  propertyDefinitions,
  segments,
  suppressionEntries,
  webhookEvents
} from "./schema.js";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizeDomain(domain: string | null | undefined): string | null {
  if (!domain) return null;
  return domain.trim().toLowerCase().replace(/^www\./, "");
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
  options: { query?: string; limit?: number; includeArchived?: boolean }
) {
  const limit = options.limit ?? 25;
  const filters: SQL[] = [eq(contacts.organizationId, organizationId)];
  if (!options.includeArchived) {
    filters.push(isNull(contacts.archivedAt));
  }
  if (options.query) {
    const q = `%${options.query}%`;
    filters.push(or(
      ilike(contacts.email, q),
      ilike(contacts.firstName, q),
      ilike(contacts.lastName, q)
    )!);
  }
  return db.select().from(contacts).where(and(...filters)).orderBy(desc(contacts.updatedAt)).limit(limit);
}

export async function createContact(
  db: Db,
  input: {
    organizationId: string;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
    lifecycleStage?: string | null;
    properties?: Record<string, unknown>;
  }
) {
  const emailNormalized = normalizeEmail(input.email);
  const [row] = await db.insert(contacts).values({
    organizationId: input.organizationId,
    email: input.email.trim(),
    emailNormalized,
    firstName: input.firstName ?? null,
    lastName: input.lastName ?? null,
    lifecycleStage: input.lifecycleStage ?? null,
    properties: input.properties ?? {}
  }).returning();
  return row;
}

export async function updateContact(
  db: Db,
  organizationId: string,
  id: string,
  input: {
    email?: string;
    firstName?: string | null;
    lastName?: string | null;
    lifecycleStage?: string | null;
    properties?: Record<string, unknown>;
    version?: number;
  }
) {
  const existing = await db.select().from(contacts).where(and(eq(contacts.id, id), eq(contacts.organizationId, organizationId))).limit(1);
  const current = existing[0];
  if (!current) return null;
  if (input.version !== undefined && input.version !== current.version) {
    return { conflict: true as const, current };
  }
  const [row] = await db.update(contacts).set({
    email: input.email?.trim() ?? current.email,
    emailNormalized: input.email ? normalizeEmail(input.email) : current.emailNormalized,
    firstName: input.firstName === undefined ? current.firstName : input.firstName,
    lastName: input.lastName === undefined ? current.lastName : input.lastName,
    lifecycleStage: input.lifecycleStage === undefined ? current.lifecycleStage : input.lifecycleStage,
    properties: input.properties ?? current.properties,
    version: current.version + 1,
    updatedAt: new Date()
  }).where(eq(contacts.id, id)).returning();
  return { conflict: false as const, row };
}

export async function findContactByEmail(db: Db, organizationId: string, email: string) {
  const rows = await db.select().from(contacts).where(and(
    eq(contacts.organizationId, organizationId),
    eq(contacts.emailNormalized, normalizeEmail(email))
  )).limit(1);
  return rows[0] ?? null;
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

export async function listCompanies(db: Db, organizationId: string, query?: string) {
  const filters: SQL[] = [eq(companies.organizationId, organizationId), isNull(companies.archivedAt)];
  if (query) {
    const q = `%${query}%`;
    filters.push(or(ilike(companies.name, q), ilike(companies.domain, q))!);
  }
  return db.select().from(companies).where(and(...filters)).orderBy(asc(companies.name)).limit(50);
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

export async function listSegments(db: Db, organizationId: string) {
  return db.select().from(segments).where(eq(segments.organizationId, organizationId)).orderBy(asc(segments.name));
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
    firstName?: string | null;
    lastName?: string | null;
    lifecycleStage?: string | null;
    properties?: Record<string, unknown>;
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
    firstName: input.firstName === undefined ? existing.firstName : input.firstName,
    lastName: input.lastName === undefined ? existing.lastName : input.lastName,
    lifecycleStage: input.lifecycleStage === undefined ? existing.lifecycleStage : input.lifecycleStage,
    properties: mergedProperties
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
