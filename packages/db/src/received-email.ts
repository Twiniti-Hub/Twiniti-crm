import { and, eq } from "drizzle-orm";
import type { Db } from "./client.js";
import {
  buildReceivedEmailDedupeKey,
  classifyEmailActivity,
  normalizeTrackedEmail,
  parseEmailAddresses,
  type EmailActivityClassification
} from "./email-tracking.js";
import { ensureContactByEmail, type ContactRow } from "./outbound-email.js";
import { findContactsByEmails, type ContactChangeContext } from "./repositories.js";
import { emailActivities } from "./schema.js";

export function parseDisplayNameFromAddressField(value: unknown): Map<string, { firstName: string | null; lastName: string | null }> {
  const result = new Map<string, { firstName: string | null; lastName: string | null }>();
  const values = Array.isArray(value) ? value : [value];
  for (const item of values) {
    if (typeof item !== "string") continue;
    const bracketMatch = item.match(/^\s*([^<]+?)<\s*([^>]+)\s*>\s*$/);
    if (bracketMatch) {
      const displayName = bracketMatch[1]?.replace(/^["']|["']$/g, "").trim() ?? "";
      const emails = parseEmailAddresses(bracketMatch[2]);
      const names = splitDisplayName(displayName);
      for (const email of emails) result.set(email, names);
      continue;
    }
    for (const email of parseEmailAddresses(item)) {
      if (!result.has(email)) result.set(email, { firstName: null, lastName: null });
    }
  }
  return result;
}

function splitDisplayName(displayName: string): { firstName: string | null; lastName: string | null } {
  const trimmed = displayName.trim();
  if (!trimmed) return { firstName: null, lastName: null };
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0] ?? null, lastName: null };
  return { firstName: parts[0] ?? null, lastName: parts.slice(1).join(" ") || null };
}

/** Participant To/Cc addresses eligible for auto-create on outbound BCC logging. */
export function participantEmailsForAutoCreate(
  participantEmails: string[],
  trackingEmail: string,
  classification: EmailActivityClassification
): string[] {
  const tracking = normalizeTrackedEmail(trackingEmail);
  const unique = [...new Set(participantEmails.map(normalizeTrackedEmail))].filter((email) => email && email !== tracking);
  if (classification.direction === "inbound") return [];
  return unique;
}

/** Contacts that should receive a timeline row for this received message. */
export function contactsToRecordForReceivedEmail(input: {
  participantEmails: string[];
  trackingEmail: string;
  fromEmail: string | null;
  classification: EmailActivityClassification;
  contactsByEmail: Map<string, ContactRow>;
}): Array<ContactRow | null> {
  const tracking = normalizeTrackedEmail(input.trackingEmail);
  const participants = [...new Set(input.participantEmails.map(normalizeTrackedEmail))].filter((email) => email && email !== tracking);

  if (input.classification.direction === "inbound") {
    const from = input.fromEmail ? normalizeTrackedEmail(input.fromEmail) : null;
    const fromContact = from ? input.contactsByEmail.get(from) ?? null : null;
    return fromContact ? [fromContact] : [null];
  }

  const rows: ContactRow[] = [];
  for (const email of participants) {
    const contact = input.contactsByEmail.get(email);
    if (contact) rows.push(contact);
  }
  return rows.length > 0 ? rows : [null];
}

export async function resolveContactsForReceivedEmail(
  db: Db,
  organizationId: string,
  input: {
    participantEmails: string[];
    fromEmail: string | null;
    trackingEmail: string;
    inReplyTo?: string | null;
    references?: string[];
    rawTo?: unknown;
    rawCc?: unknown;
    change?: ContactChangeContext;
  }
): Promise<{
  classification: EmailActivityClassification;
  contactsByEmail: Map<string, ContactRow>;
  contactsToRecord: Array<ContactRow | null>;
}> {
  const fromEmail = input.fromEmail ? normalizeTrackedEmail(input.fromEmail) : null;
  const participantEmails = [...new Set(input.participantEmails.map(normalizeTrackedEmail))].filter(Boolean);
  const lookupEmails = [...new Set([
    ...participantEmails,
    ...(fromEmail ? [fromEmail] : [])
  ])];
  const existing = lookupEmails.length > 0
    ? await findContactsByEmails(db, organizationId, lookupEmails)
    : [];
  const contactsByEmail = new Map(existing.map((row) => [row.emailNormalized, row]));

  const classification = classifyEmailActivity({
    fromEmail,
    contactEmails: [...contactsByEmail.keys()],
    inReplyTo: input.inReplyTo,
    references: input.references
  });

  const nameByEmail = new Map<string, { firstName: string | null; lastName: string | null }>();
  for (const [email, names] of parseDisplayNameFromAddressField(input.rawTo)) nameByEmail.set(email, names);
  for (const [email, names] of parseDisplayNameFromAddressField(input.rawCc)) {
    if (!nameByEmail.has(email)) nameByEmail.set(email, names);
  }

  const autoCreateEmails = participantEmailsForAutoCreate(
    participantEmails,
    input.trackingEmail,
    classification
  );
  for (const email of autoCreateEmails) {
    if (contactsByEmail.has(email)) continue;
    const names = nameByEmail.get(email);
    const contact = await ensureContactByEmail(db, organizationId, email, {
      firstName: names?.firstName ?? null,
      lastName: names?.lastName ?? null,
      change: input.change ?? { actorType: "system", actorId: "worker", source: "bcc.received" }
    });
    contactsByEmail.set(email, contact);
  }

  const contactsToRecord = contactsToRecordForReceivedEmail({
    participantEmails,
    trackingEmail: input.trackingEmail,
    fromEmail,
    classification,
    contactsByEmail
  });

  return { classification, contactsByEmail, contactsToRecord };
}

/**
 * Re-link a prior unmatched received activity when replaying BCC ingest after auto-create ships.
 * Returns true when an unmatched row was upgraded instead of inserting a duplicate.
 */
export async function adoptUnmatchedReceivedEmailActivity(
  db: Db,
  organizationId: string,
  input: { providerEmailId: string; messageId?: string | null; contactId: string }
): Promise<boolean> {
  const unmatchedKey = buildReceivedEmailDedupeKey({
    providerEmailId: input.providerEmailId,
    messageId: input.messageId,
    contactId: null
  });
  const matchedKey = buildReceivedEmailDedupeKey({
    providerEmailId: input.providerEmailId,
    messageId: input.messageId,
    contactId: input.contactId
  });
  if (unmatchedKey === matchedKey) return false;

  const [existing] = await db.select().from(emailActivities).where(and(
    eq(emailActivities.organizationId, organizationId),
    eq(emailActivities.dedupeKey, unmatchedKey)
  )).limit(1);
  if (!existing) return false;

  const [conflict] = await db.select().from(emailActivities).where(and(
    eq(emailActivities.organizationId, organizationId),
    eq(emailActivities.dedupeKey, matchedKey)
  )).limit(1);
  if (conflict) return false;

  await db.update(emailActivities).set({
    contactId: input.contactId,
    dedupeKey: matchedKey,
    metadata: {
      ...(existing.metadata as Record<string, unknown>),
      matchedContact: true,
      adoptedFromUnmatched: true
    }
  }).where(eq(emailActivities.id, existing.id));
  return true;
}
