import { and, eq } from "drizzle-orm";
import type { LogOutboundEmail } from "@twiniti/contracts";
import type { Db } from "./client.js";
import { customerEvents } from "./schema.js";
import { createContact, findContactByEmail, type ContactChangeContext } from "./repositories.js";

/** Outbound email event types agents may ingest via POST /api/v1/events. */
export const AGENT_INGESTIBLE_EMAIL_EVENT_TYPES = new Set([
  "email.sent",
  "email.delivered",
  "email.opened",
  "email.clicked",
  "email.bounced",
  "email.failed"
]);

export function isAgentIngestibleEmailEventType(eventType: string): boolean {
  return AGENT_INGESTIBLE_EMAIL_EVENT_TYPES.has(eventType);
}

/** Build a stable dedupe key from a Graph internetMessageId. */
export function buildOutboundEmailDedupeKey(internetMessageId?: string | null): string | null {
  const normalized = internetMessageId?.trim();
  if (!normalized) return null;
  return `graph:${normalized}`.slice(0, 255);
}

export function extractInternetMessageId(payload: Record<string, unknown>): string | undefined {
  const value = payload.internetMessageId;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export type LogOutboundEmailResult = {
  status: "created" | "duplicate";
  contactId: string;
  event: typeof customerEvents.$inferSelect | null;
};

export async function findCustomerEventByDedupeKey(
  db: Db,
  organizationId: string,
  dedupeKey: string
) {
  const [existing] = await db.select().from(customerEvents).where(and(
    eq(customerEvents.organizationId, organizationId),
    eq(customerEvents.dedupeKey, dedupeKey)
  )).limit(1);
  return existing ?? null;
}

export async function logOutboundEmail(
  db: Db,
  organizationId: string,
  input: LogOutboundEmail,
  change?: ContactChangeContext
): Promise<LogOutboundEmailResult> {
  const email = input.email.trim();
  let contact = await findContactByEmail(db, organizationId, email);
  if (!contact) {
    contact = await createContact(db, {
      organizationId,
      email,
      change: change ?? { actorType: "agent", actorId: "system", source: "outbound-email.log" }
    });
  }

  const payload: Record<string, unknown> = {
    subject: input.subject ?? null,
    mailbox: input.mailbox ?? null,
    from: input.mailbox ?? null,
    internetMessageId: input.internetMessageId ?? null,
    ...(input.pack ? { pack: input.pack } : {}),
    ...(input.batch ? { batch: input.batch } : {}),
    ...(input.metadata ?? {})
  };

  const dedupeKey = buildOutboundEmailDedupeKey(input.internetMessageId);
  const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();

  if (dedupeKey) {
    const existing = await findCustomerEventByDedupeKey(db, organizationId, dedupeKey);
    if (existing) {
      return { status: "duplicate", contactId: contact.id, event: existing };
    }
  }

  const [row] = await db.insert(customerEvents).values({
    organizationId,
    contactId: contact.id,
    eventType: "email.sent",
    source: "microsoft_graph",
    occurredAt,
    payload,
    dedupeKey,
    privacyClass: "standard"
  }).onConflictDoNothing().returning();

  if (row) {
    return { status: "created", contactId: contact.id, event: row };
  }

  if (dedupeKey) {
    const existing = await findCustomerEventByDedupeKey(db, organizationId, dedupeKey);
    return { status: "duplicate", contactId: contact.id, event: existing };
  }

  return { status: "created", contactId: contact.id, event: row ?? null };
}
