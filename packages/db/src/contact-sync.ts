import { and, eq, isNull, lte, or, sql } from "drizzle-orm";
import type { Db } from "./client.js";
import {
  contactSyncConnections,
  contactSyncCursors,
  contactSyncRuns,
  contactSyncSources,
  contacts,
  crmUsers,
  customerEvents,
  organizations
} from "./schema.js";
import { createContact, findContactByEmail, updateContact } from "./repositories.js";

export type NormalizedContactSource = {
  externalId: string;
  addressBookKey?: string;
  etag?: string | null;
  deleted?: boolean;
  firstName?: string | null;
  lastName?: string | null;
  emails?: Array<{ value: string; label?: string; primary?: boolean }>;
  phones?: Array<{ value: string; label?: string; primary?: boolean }>;
  organization?: string | null;
  jobTitle?: string | null;
  addresses?: Array<Record<string, string | undefined>>;
};

export async function listContactSyncConnections(db: Db, organizationId: string, ownerUserId: string) {
  return db.select().from(contactSyncConnections).where(and(
    eq(contactSyncConnections.organizationId, organizationId),
    eq(contactSyncConnections.ownerUserId, ownerUserId),
    isNull(contactSyncConnections.disconnectedAt)
  ));
}
export async function getContactSyncConnection(db: Db, organizationId: string, ownerUserId: string, id: string) {
  const [row] = await db.select().from(contactSyncConnections).where(and(
    eq(contactSyncConnections.id, id),
    eq(contactSyncConnections.organizationId, organizationId),
    eq(contactSyncConnections.ownerUserId, ownerUserId),
    isNull(contactSyncConnections.disconnectedAt)
  )).limit(1);
  return row ?? null;
}

export async function assertPersonalWorkspaceOwner(db: Db, organizationId: string, userId: string) {
  const [row] = await db.select({
    workspaceKind: organizations.workspaceKind,
    role: crmUsers.role,
    active: crmUsers.active
  }).from(crmUsers).innerJoin(organizations, eq(organizations.id, crmUsers.organizationId)).where(and(
    eq(crmUsers.id, userId),
    eq(crmUsers.organizationId, organizationId)
  )).limit(1);
  if (!row || !row.active || row.workspaceKind !== "personal" || row.role !== "admin") {
    const error = new Error("Contact sync is available only to the active personal workspace owner");
    (error as Error & { statusCode?: number }).statusCode = 403;
    throw error;
  }
}

export async function createContactSyncRun(
  db: Db,
  input: { organizationId: string; connectionId: string; generation: number; trigger: string }
) {
  const [existing] = await db.select().from(contactSyncRuns).where(and(
    eq(contactSyncRuns.connectionId, input.connectionId),
    or(eq(contactSyncRuns.status, "queued"), eq(contactSyncRuns.status, "running"))
  )).limit(1);
  if (existing) return existing;
  const [row] = await db.insert(contactSyncRuns).values(input).returning();
  return row;
}

export async function listDueContactSyncConnections(db: Db, now = new Date()) {
  return db.select().from(contactSyncConnections).where(and(
    eq(contactSyncConnections.status, "connected"),
    isNull(contactSyncConnections.disconnectedAt),
    lte(contactSyncConnections.nextRunAt, now)
  )).limit(50);
}

function normalizedPrimary<T extends { value: string; primary?: boolean }>(values: T[] | undefined): string | null {
  if (!values?.length) return null;
  return values.find((item) => item.primary)?.value?.trim() || values[0]?.value?.trim() || null;
}

function sourceProperties(source: NormalizedContactSource) {
  return {
    contact_sync: {
      emails: source.emails ?? [],
      phones: source.phones ?? [],
      organization: source.organization ?? null,
      jobTitle: source.jobTitle ?? null,
      addresses: source.addresses ?? []
    }
  };
}

export async function stageContactSyncSource(
  db: Db,
  input: {
    organizationId: string;
    connectionId: string;
    runId: string;
    source: NormalizedContactSource;
  }
) {
  const book = input.source.addressBookKey || "default";
  const normalizedData = input.source as unknown as Record<string, unknown>;
  await db.insert(contactSyncSources).values({
    organizationId: input.organizationId,
    connectionId: input.connectionId,
    addressBookKey: book,
    externalId: input.source.externalId,
    etag: input.source.etag ?? null,
    contentHash: input.source.etag ?? null,
    normalizedData,
    disposition: input.source.deleted ? "removed" : "pending",
    lastSeenRunId: input.runId,
    removedAt: input.source.deleted ? new Date() : null
  }).onConflictDoUpdate({
    target: [contactSyncSources.connectionId, contactSyncSources.addressBookKey, contactSyncSources.externalId],
    set: {
      etag: input.source.etag ?? null,
      contentHash: input.source.etag ?? null,
      normalizedData,
      disposition: input.source.deleted ? "removed" : "pending",
      lastSeenRunId: input.runId,
      removedAt: input.source.deleted ? new Date() : null,
      updatedAt: new Date()
    }
  });
}

export async function markMissingContactSyncSourcesRemoved(
  db: Db,
  input: { organizationId: string; connectionId: string; addressBookKey: string; runId: string }
) {
  const rows = await db.select().from(contactSyncSources).where(and(
    eq(contactSyncSources.organizationId, input.organizationId),
    eq(contactSyncSources.connectionId, input.connectionId),
    eq(contactSyncSources.addressBookKey, input.addressBookKey),
    isNull(contactSyncSources.removedAt)
  ));
  const missing = rows.filter((row) => row.lastSeenRunId !== input.runId);
  for (const row of missing) {
    await db.update(contactSyncSources).set({
      disposition: "removed",
      removedAt: new Date(),
      updatedAt: new Date()
    }).where(eq(contactSyncSources.id, row.id));
  }
  return missing.length;
}

export async function applyContactSyncSource(
  db: Db,
  input: {
    organizationId: string;
    connectionId: string;
    generation: number;
    runId: string;
    source: NormalizedContactSource;
  }
): Promise<"created" | "updated" | "unchanged" | "needs_review" | "removed" | "skipped"> {
  const [connection] = await db.select().from(contactSyncConnections).where(and(
    eq(contactSyncConnections.id, input.connectionId),
    eq(contactSyncConnections.organizationId, input.organizationId),
    eq(contactSyncConnections.generation, input.generation),
    isNull(contactSyncConnections.disconnectedAt)
  )).limit(1);
  if (!connection) return "skipped";

  const book = input.source.addressBookKey || "default";
  const [existingSource] = await db.select().from(contactSyncSources).where(and(
    eq(contactSyncSources.connectionId, input.connectionId),
    eq(contactSyncSources.addressBookKey, book),
    eq(contactSyncSources.externalId, input.source.externalId)
  )).limit(1);

  if (input.source.deleted) {
    if (!existingSource) return "unchanged";
    await db.update(contactSyncSources).set({
      disposition: "removed", removedAt: new Date(), lastSeenRunId: input.runId, updatedAt: new Date()
    }).where(eq(contactSyncSources.id, existingSource.id));
    return "removed";
  }

  const normalizedData = input.source as unknown as Record<string, unknown>;
  if (existingSource?.contactId && existingSource.contentHash && existingSource.contentHash === input.source.etag) {
    await db.update(contactSyncSources).set({ lastSeenRunId: input.runId }).where(eq(contactSyncSources.id, existingSource.id));
    return "unchanged";
  }

  const email = normalizedPrimary(input.source.emails);
  const phone = normalizedPrimary(input.source.phones);
  if (!email && !phone && !input.source.firstName?.trim() && !input.source.lastName?.trim()) return "skipped";

  if (existingSource?.contactId) {
    const [current] = await db.select().from(contacts).where(and(
      eq(contacts.id, existingSource.contactId),
      eq(contacts.organizationId, input.organizationId)
    )).limit(1);
    if (!current || current.archivedAt) {
      await db.update(contactSyncSources).set({ disposition: "ignored", contactId: null, updatedAt: new Date() })
        .where(eq(contactSyncSources.id, existingSource.id));
      return "skipped";
    }
    const overrides = new Set(existingSource.localOverrides as string[]);
    const result = await updateContact(db, input.organizationId, current.id, {
      email: overrides.has("email") ? undefined : email,
      phone: overrides.has("phone") ? undefined : phone,
      firstName: overrides.has("firstName") ? undefined : input.source.firstName ?? null,
      lastName: overrides.has("lastName") ? undefined : input.source.lastName ?? null,
      properties: {
        ...(current.properties as Record<string, unknown>),
        ...sourceProperties(input.source)
      },
      version: current.version,
      change: { actorType: "system", actorId: "contact-sync", source: `contact-sync.${connection.provider}` }
    });
    if (!result || result.conflict) return "needs_review";
    await db.update(contactSyncSources).set({
      etag: input.source.etag ?? null,
      contentHash: input.source.etag ?? null,
      normalizedData,
      disposition: "linked",
      lastSeenRunId: input.runId,
      removedAt: null,
      updatedAt: new Date()
    }).where(eq(contactSyncSources.id, existingSource.id));
    return "updated";
  }

  if (email) {
    const matching = await findContactByEmail(db, input.organizationId, email);
    if (matching) {
      if (existingSource) {
        await db.update(contactSyncSources).set({
          normalizedData, disposition: "pending", lastSeenRunId: input.runId, updatedAt: new Date()
        }).where(eq(contactSyncSources.id, existingSource.id));
      } else {
        await db.insert(contactSyncSources).values({
          organizationId: input.organizationId,
          connectionId: input.connectionId,
          addressBookKey: book,
          externalId: input.source.externalId,
          etag: input.source.etag ?? null,
          contentHash: input.source.etag ?? null,
          normalizedData,
          disposition: "pending",
          lastSeenRunId: input.runId
        });
      }
      return "needs_review";
    }
  }

  const contact = await createContact(db, {
    organizationId: input.organizationId,
    email,
    phone,
    firstName: input.source.firstName ?? null,
    lastName: input.source.lastName ?? null,
    properties: sourceProperties(input.source),
    change: { actorType: "system", actorId: "contact-sync", source: `contact-sync.${connection.provider}` }
  });
  await db.insert(customerEvents).values({
    organizationId: input.organizationId,
    contactId: contact.id,
    eventType: "contact.imported",
    source: `contact-sync.${connection.provider}`,
    occurredAt: new Date(),
    payload: { connectionId: input.connectionId, externalId: input.source.externalId }
  });
  if (existingSource) {
    await db.update(contactSyncSources).set({
      contactId: contact.id, normalizedData, disposition: "linked", etag: input.source.etag ?? null,
      contentHash: input.source.etag ?? null, lastSeenRunId: input.runId, removedAt: null, updatedAt: new Date()
    }).where(eq(contactSyncSources.id, existingSource.id));
  } else {
    await db.insert(contactSyncSources).values({
      organizationId: input.organizationId,
      connectionId: input.connectionId,
      contactId: contact.id,
      addressBookKey: book,
      externalId: input.source.externalId,
      etag: input.source.etag ?? null,
      contentHash: input.source.etag ?? null,
      normalizedData,
      disposition: "linked",
      lastSeenRunId: input.runId
    });
  }
  return "created";
}

export async function finishContactSyncRun(
  db: Db,
  input: {
    organizationId: string;
    connectionId: string;
    generation: number;
    runId: string;
    status: "completed" | "completed_with_warnings" | "failed";
    stats: Record<string, number>;
    cursor?: string | null;
    requestFingerprint?: string | null;
    errorCode?: string | null;
    errorMessage?: string | null;
  }
) {
  const now = new Date();
  await db.update(contactSyncRuns).set({
    status: input.status,
    stats: input.stats,
    errorCode: input.errorCode ?? null,
    errorMessage: input.errorMessage?.slice(0, 500) ?? null,
    completedAt: now
  }).where(and(
    eq(contactSyncRuns.id, input.runId),
    eq(contactSyncRuns.organizationId, input.organizationId),
    eq(contactSyncRuns.generation, input.generation)
  ));
  if (input.status !== "failed" && input.cursor !== undefined) {
    await db.insert(contactSyncCursors).values({
      organizationId: input.organizationId,
      connectionId: input.connectionId,
      cursor: input.cursor ?? null,
      requestFingerprint: input.requestFingerprint ?? null
    }).onConflictDoUpdate({
      target: [contactSyncCursors.connectionId, contactSyncCursors.addressBookKey],
      set: { cursor: input.cursor ?? null, requestFingerprint: input.requestFingerprint ?? null, updatedAt: now }
    });
  }
  await db.update(contactSyncConnections).set({
    status: input.status === "failed" ? "error" : "connected",
    lastSuccessAt: input.status === "failed" ? undefined : now,
    nextRunAt: input.status === "failed" ? new Date(now.getTime() + 15 * 60_000) : new Date(now.getTime() + 30 * 60_000 + Math.floor(Math.random() * 120_000)),
    lastErrorCode: input.errorCode ?? null,
    lastErrorMessage: input.errorMessage?.slice(0, 500) ?? null,
    updatedAt: now
  }).where(and(
    eq(contactSyncConnections.id, input.connectionId),
    eq(contactSyncConnections.organizationId, input.organizationId),
    eq(contactSyncConnections.generation, input.generation),
    isNull(contactSyncConnections.disconnectedAt)
  ));
}
