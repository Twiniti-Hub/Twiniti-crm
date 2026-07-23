import { and, asc, desc, eq, ilike, isNull, or, sql, type SQL } from "drizzle-orm";
// neon-http workers use optimistic claim rather than SKIP LOCKED transactions
import type { Db } from "./client.js";
import {
  agentIdentities,
  auditEvents,
  campaigns,
  companies,
  contacts,
  crmUsers,
  customerEvents,
  jobs,
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
      role: "owner",
      displayName: "Owner"
    });
  }
  await db.insert(propertyDefinitions).values([
    {
      organizationId: org.id,
      objectType: "contact",
      internalName: "job_title",
      label: "Job Title",
      dataType: "string",
      searchable: true
    },
    {
      organizationId: org.id,
      objectType: "company",
      internalName: "employee_count",
      label: "Employee Count",
      dataType: "number",
      searchable: true
    }
  ]);
  return org;
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
  const existing = await db.select().from(crmUsers).where(eq(crmUsers.hexclaveSubject, input.subject)).limit(1);
  if (existing[0]) return existing[0];
  const [created] = await db.insert(crmUsers).values({
    organizationId: input.organizationId,
    hexclaveSubject: input.subject,
    email: input.email ?? null,
    displayName: input.displayName ?? null,
    role: input.defaultRole ?? "marketer"
  }).returning();
  return created;
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

export async function completeJob(db: Db, id: string, error?: string) {
  if (error) {
    await db.update(jobs).set({
      status: "failed",
      lastError: error,
      availableAt: new Date(Date.now() + 60_000)
    }).where(eq(jobs.id, id));
    return;
  }
  await db.update(jobs).set({
    status: "completed",
    completedAt: new Date(),
    lastError: null
  }).where(eq(jobs.id, id));
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
  return db.select().from(customerEvents).where(and(
    eq(customerEvents.organizationId, organizationId),
    eq(customerEvents.contactId, contactId)
  )).orderBy(desc(customerEvents.occurredAt)).limit(100);
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
