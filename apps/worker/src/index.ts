import "dotenv/config";
import { and, eq } from "drizzle-orm";
import { loadEnv } from "@twiniti/config";
import {
  campaignRecipients,
  campaigns,
  claimJobs,
  completeJob,
  emailEvents,
  emailActivities,
  emailTrackingAddresses,
  emailSends,
  enqueueJob,
  getContactById,
  findContactsByEmails,
  findContactByExternalRecordId,
  getDb,
  HUBSPOT_CORE_CONTACT_FIELDS,
  importJobs,
  importRows,
  isEmailSuppressed,
  getTrackingToken,
  parseEmailAddresses,
  getEmailHeader,
  parseMessageReferences,
  classifyEmailActivity,
  listPropertyDefinitions,
  mapHubspotContactRow,
  organizations,
  reconcileContactCompanyAssociations,
  resolveContactCompanyAssociation,
  stripContactCompanyProperties,
  upsertCompanyByName,
  upsertContactByEmail,
  upsertContactIdentity,
  updateContact,
  upsertExternalRecordId,
  upsertPropertyDefinitionFromHubspot,
  webhookEvents,
  workflowEnrollments,
  workflowRuns,
  workflows,
  writeAudit
} from "@twiniti/db";
import { getReceivedEmail, personalizeForContact, sendEmail } from "@twiniti/email";

const env = loadEnv({
  ...process.env,
  DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://user:password@localhost:5432/twiniti_crm"
});

const db = getDb(env.DATABASE_URL);
const CHECKPOINT_EVERY = 25;

type ContactImportStats = {
  imported?: number;
  updated?: number;
  failed?: number;
  unmapped?: number;
  cursor?: number;
  total?: number;
  chunkCount?: number;
  completedChunks?: number;
};

type CompanyImportStats = {
  imported?: number;
  updated?: number;
  failed?: number;
  cursor?: number;
  total?: number;
  chunkCount?: number;
  completedChunks?: number;
};

function mergeContactImportStats(
  base: ContactImportStats,
  delta: ContactImportStats
): Required<ContactImportStats> {
  const imported = Number(base.imported ?? 0) + Number(delta.imported ?? 0);
  const updated = Number(base.updated ?? 0) + Number(delta.updated ?? 0);
  const failed = Number(base.failed ?? 0) + Number(delta.failed ?? 0);
  const unmapped = Number(base.unmapped ?? 0) + Number(delta.unmapped ?? 0);
  const completedChunks = Number(base.completedChunks ?? 0) + Number(delta.completedChunks ?? 0);
  const total = Number(delta.total ?? base.total ?? imported + updated + failed);
  return {
    imported,
    updated,
    failed,
    unmapped,
    cursor: imported + updated + failed,
    total,
    chunkCount: Number(delta.chunkCount ?? base.chunkCount ?? 1),
    completedChunks
  };
}

function mergeCompanyImportStats(
  base: CompanyImportStats,
  delta: CompanyImportStats
): Required<CompanyImportStats> {
  const imported = Number(base.imported ?? 0) + Number(delta.imported ?? 0);
  const updated = Number(base.updated ?? 0) + Number(delta.updated ?? 0);
  const failed = Number(base.failed ?? 0) + Number(delta.failed ?? 0);
  const completedChunks = Number(base.completedChunks ?? 0) + Number(delta.completedChunks ?? 0);
  const total = Number(delta.total ?? base.total ?? imported + updated + failed);
  return {
    imported,
    updated,
    failed,
    cursor: imported + updated + failed,
    total,
    chunkCount: Number(delta.chunkCount ?? base.chunkCount ?? 1),
    completedChunks
  };
}

function pickString(row: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function mapCompanyImportRow(row: Record<string, unknown>): {
  name: string;
  industry: string | null;
  properties: Record<string, unknown>;
} | { error: string } {
  const name = pickString(row, ["Company name", "company_name", "company", "name"]);
  if (!name) return { error: "missing company name" };
  const industry = pickString(row, ["Industry", "industry"]);
  const propertyMap: Record<string, string[]> = {
    company_owner: ["Company owner", "company_owner"],
    create_date: ["Create Date", "create_date"],
    phone_number: ["Phone Number", "phone_number", "phone"],
    last_activity_date: ["Last Activity Date", "last_activity_date"],
    city: ["City", "city"],
    country_region: ["Country/Region", "country_region", "country"]
  };
  const properties: Record<string, unknown> = {};
  for (const [key, aliases] of Object.entries(propertyMap)) {
    const value = pickString(row, aliases);
    if (value) properties[key] = value;
  }
  return { name, industry, properties };
}

async function processCampaignSend(payload: { campaignId: string }) {
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, payload.campaignId)).limit(1);
  if (!campaign) throw new Error("Campaign not found");
  const recipients = await db.select().from(campaignRecipients).where(and(
    eq(campaignRecipients.campaignId, campaign.id),
    eq(campaignRecipients.status, "pending")
  ));

  for (const recipient of recipients) {
    if (await isEmailSuppressed(db, campaign.organizationId, recipient.emailNormalized)) {
      await db.update(campaignRecipients).set({ status: "suppressed" }).where(eq(campaignRecipients.id, recipient.id));
      continue;
    }

    const contact = recipient.contactId
      ? await getContactById(db, campaign.organizationId, recipient.contactId)
      : null;

    const html = personalizeForContact(campaign.htmlBody ?? "", {
      email: recipient.emailNormalized,
      firstName: contact?.firstName ?? null,
      lastName: contact?.lastName ?? null,
      properties: (contact?.properties ?? {}) as Record<string, unknown>
    });

    if (!env.RESEND_API_KEY) {
      await db.update(campaignRecipients).set({ status: "simulated" }).where(eq(campaignRecipients.id, recipient.id));
      await db.insert(emailSends).values({
        organizationId: campaign.organizationId,
        campaignId: campaign.id,
        contactId: recipient.contactId,
        toEmail: recipient.emailNormalized,
        status: "simulated",
        idempotencyKey: recipient.idempotencyKey
      });
      await db.insert(emailActivities).values({
        organizationId: campaign.organizationId,
        contactId: recipient.contactId,
        direction: "outbound",
        activityType: "sent",
        fromEmail: env.RESEND_FROM_EMAIL,
        toEmails: [recipient.emailNormalized],
        subject: campaign.subject ?? campaign.name,
        dedupeKey: `campaign:${recipient.idempotencyKey}:sent`,
        occurredAt: new Date(),
        metadata: { campaignId: campaign.id, simulated: true }
      }).onConflictDoNothing();
      continue;
    }

    const result = await sendEmail({
      apiKey: env.RESEND_API_KEY,
      from: env.RESEND_FROM_EMAIL,
      to: recipient.emailNormalized,
      subject: campaign.subject ?? campaign.name,
      html,
      idempotencyKey: recipient.idempotencyKey
    });

    const resendId = (result.data as { id?: string } | null | undefined)?.id ?? null;
    await db.update(campaignRecipients).set({
      status: result.error ? "failed" : "sent",
      resendId,
      error: result.error ? JSON.stringify(result.error) : null
    }).where(eq(campaignRecipients.id, recipient.id));

    await db.insert(emailSends).values({
      organizationId: campaign.organizationId,
      campaignId: campaign.id,
      contactId: recipient.contactId,
      toEmail: recipient.emailNormalized,
      status: result.error ? "failed" : "sent",
      resendId,
      idempotencyKey: recipient.idempotencyKey
    });
    await db.insert(emailActivities).values({
      organizationId: campaign.organizationId,
      contactId: recipient.contactId,
      direction: "outbound",
      activityType: result.error ? "failed" : "sent",
      providerEmailId: resendId,
      fromEmail: env.RESEND_FROM_EMAIL,
      toEmails: [recipient.emailNormalized],
      subject: campaign.subject ?? campaign.name,
      dedupeKey: `campaign:${recipient.idempotencyKey}:sent`,
      occurredAt: new Date(),
      metadata: { campaignId: campaign.id }
    }).onConflictDoNothing();
  }

  await db.update(campaigns).set({ status: "sent", sentAt: new Date(), updatedAt: new Date() }).where(eq(campaigns.id, campaign.id));
  await writeAudit(db, {
    organizationId: campaign.organizationId,
    actorType: "system",
    actorId: "worker",
    action: "campaign.sent",
    entityType: "campaign",
    entityId: campaign.id,
    metadata: { recipients: recipients.length }
  });
}

async function processHubspotPropertiesImport(payload: {
  importJobId: string;
  objectType?: string;
  properties?: Array<Record<string, unknown>>;
  cursor?: number;
}) {
  const [job] = await db.select().from(importJobs).where(eq(importJobs.id, payload.importJobId)).limit(1);
  if (!job) throw new Error("Import job not found");
  const objectType = payload.objectType ?? "contact";
  const properties = payload.properties ?? [];
  const start = Math.max(0, Number(payload.cursor ?? (job.stats as { cursor?: number })?.cursor ?? 0));

  await db.update(importJobs).set({ status: "running" }).where(eq(importJobs.id, job.id));

  let created = Number((job.stats as { created?: number })?.created ?? 0);
  let updated = Number((job.stats as { updated?: number })?.updated ?? 0);
  let failed = Number((job.stats as { failed?: number })?.failed ?? 0);
  let cursor = start;

  for (let i = start; i < properties.length; i += 1) {
    const raw = properties[i] ?? {};
    const name = typeof raw.name === "string" ? raw.name : "";
    try {
      if (!name) {
        failed += 1;
        await db.insert(importRows).values({
          organizationId: job.organizationId,
          importJobId: job.id,
          objectType: "property_definition",
          externalId: `row-${i}`,
          status: "failed",
          payload: raw,
          error: "missing name"
        });
      } else {
        const result = await upsertPropertyDefinitionFromHubspot(db, job.organizationId, objectType, {
          name,
          label: typeof raw.label === "string" ? raw.label : undefined,
          type: typeof raw.type === "string" ? raw.type : undefined,
          fieldType: typeof raw.fieldType === "string" ? raw.fieldType : undefined,
          groupName: typeof raw.groupName === "string" ? raw.groupName : undefined,
          options: Array.isArray(raw.options) ? raw.options : [],
          hidden: Boolean(raw.hidden)
        });
        if (result.created) created += 1;
        else updated += 1;
        await db.insert(importRows).values({
          organizationId: job.organizationId,
          importJobId: job.id,
          objectType: "property_definition",
          externalId: name,
          status: result.created ? "imported" : "updated",
          payload: { ...raw, internalId: result.row.id }
        });
      }
    } catch (error) {
      failed += 1;
      await db.insert(importRows).values({
        organizationId: job.organizationId,
        importJobId: job.id,
        objectType: "property_definition",
        externalId: name || `row-${i}`,
        status: "failed",
        payload: raw,
        error: error instanceof Error ? error.message : "import failed"
      });
    }

    cursor = i + 1;
    if (cursor % CHECKPOINT_EVERY === 0 || cursor === properties.length) {
      await db.update(importJobs).set({
        stats: { created, updated, failed, cursor, total: properties.length }
      }).where(eq(importJobs.id, job.id));
    }
  }

  await db.update(importJobs).set({
    status: "completed",
    stats: { created, updated, failed, cursor, total: properties.length },
    completedAt: new Date()
  }).where(eq(importJobs.id, job.id));
}

async function processHubspotImport(payload: {
  importJobId: string;
  contacts?: Array<Record<string, unknown>>;
  cursor?: number;
  offset?: number;
  total?: number;
  chunkIndex?: number;
  chunkCount?: number;
}) {
  const [job] = await db.select().from(importJobs).where(eq(importJobs.id, payload.importJobId)).limit(1);
  if (!job) throw new Error("Import job not found");
  const contactsPayload = payload.contacts ?? [];
  const start = Math.max(0, Number(payload.cursor ?? 0));
  const existingStats = (job.stats ?? {}) as ContactImportStats;
  const total = Number(payload.total ?? existingStats.total ?? contactsPayload.length);
  const chunkCount = Number(payload.chunkCount ?? existingStats.chunkCount ?? 1);

  await db.update(importJobs).set({ status: "running" }).where(eq(importJobs.id, job.id));

  const definitions = await listPropertyDefinitions(db, job.organizationId, { objectType: "contact" });
  const definedNames = new Set(definitions.map((d) => d.internalName));
  for (const core of HUBSPOT_CORE_CONTACT_FIELDS) definedNames.add(core);

  let imported = 0;
  let updated = 0;
  let failed = 0;
  let unmapped = 0;
  let cursor = start;

  for (let i = start; i < contactsPayload.length; i += 1) {
    const row = contactsPayload[i] ?? {};
    try {
      const mapped = mapHubspotContactRow(row, definedNames);
      if ("error" in mapped) {
        failed += 1;
        await db.insert(importRows).values({
          organizationId: job.organizationId,
          importJobId: job.id,
          objectType: "contact",
          externalId: String(row.id ?? `row-${i}`),
          status: "failed",
          payload: row,
          error: mapped.error
        });
      } else {
        unmapped += mapped.unmappedKeys.length;
        const externalContact = mapped.externalId
          ? await findContactByExternalRecordId(db, {
              organizationId: job.organizationId,
              provider: "hubspot",
              objectType: "contact",
              externalId: mapped.externalId
            })
          : null;
        const result = await (externalContact
          ? (() => {
              const currentProperties = (externalContact.properties ?? {}) as Record<string, unknown>;
              const cleaned = stripContactCompanyProperties({
                ...currentProperties,
                ...mapped.properties
              });
              return updateContact(db, job.organizationId, externalContact.id, {
                email: mapped.email,
                phone: mapped.phone,
                firstName: mapped.firstName,
                lastName: mapped.lastName,
                lifecycleStage: mapped.lifecycleStage,
                properties: cleaned.properties,
                change: { actorType: "worker", actorId: job.id, source: job.provider === "csv" ? "csv.import" : "hubspot.import" }
              }).then((updated) => {
                if (!updated || updated.conflict) throw new Error("Failed to update imported contact");
                return { row: updated.row, created: false as const };
              });
            })()
          : upsertContactByEmail(db, {
              organizationId: job.organizationId,
              email: mapped.email,
              phone: mapped.phone,
              firstName: mapped.firstName,
              lastName: mapped.lastName,
              lifecycleStage: mapped.lifecycleStage,
              properties: stripContactCompanyProperties(mapped.properties).properties,
              change: { actorType: "worker", actorId: job.id, source: job.provider === "csv" ? "csv.import" : "hubspot.import" }
            }));
        if (result.created) imported += 1;
        else updated += 1;

        await resolveContactCompanyAssociation(db, {
          organizationId: job.organizationId,
          contactId: result.row.id,
          companyName: mapped.companyName
        });

        if (mapped.externalId) {
          await upsertExternalRecordId(db, {
            organizationId: job.organizationId,
            provider: "hubspot",
            objectType: "contact",
            externalId: mapped.externalId,
            internalId: result.row.id,
            rawPayload: row
          });
        }
        for (const [identityType, value] of Object.entries(mapped.identities)) {
          if (!value) continue;
          await upsertContactIdentity(db, {
            organizationId: job.organizationId,
            contactId: result.row.id,
            identityType,
            provider: identityType,
            value,
            source: job.provider === "csv" ? "csv.import" : "hubspot.import"
          });
        }

        await db.insert(importRows).values({
          organizationId: job.organizationId,
          importJobId: job.id,
          objectType: "contact",
          externalId: mapped.externalId ?? mapped.email,
          status: result.created ? "imported" : "updated",
          payload: { ...row, internalId: result.row.id, unmappedKeys: mapped.unmappedKeys }
        });
      }
    } catch (error) {
      failed += 1;
      await db.insert(importRows).values({
        organizationId: job.organizationId,
        importJobId: job.id,
        objectType: "contact",
        externalId: String(row.id ?? row.email ?? `row-${i}`),
        status: "failed",
        payload: row,
        error: error instanceof Error ? error.message : "import failed"
      });
    }

    cursor = i + 1;
    if (cursor % CHECKPOINT_EVERY === 0 || cursor === contactsPayload.length) {
      const merged = mergeContactImportStats(existingStats, {
        imported,
        updated,
        failed,
        unmapped,
        total,
        chunkCount
      });
      await db.update(importJobs).set({
        stats: {
          ...existingStats,
          ...merged
        }
      }).where(eq(importJobs.id, job.id));
    }
  }

  const merged = mergeContactImportStats(existingStats, {
    imported,
    updated,
    failed,
    unmapped,
    total,
    chunkCount,
    completedChunks: 1
  });
  const isComplete = merged.completedChunks >= merged.chunkCount;
  await db.update(importJobs).set({
    status: isComplete ? "completed" : "running",
    stats: {
      ...existingStats,
      ...merged
    },
    completedAt: isComplete ? new Date() : null
  }).where(eq(importJobs.id, job.id));
}

async function processCompanyImport(payload: {
  importJobId: string;
  companies?: Array<Record<string, unknown>>;
  cursor?: number;
  total?: number;
  chunkCount?: number;
}) {
  const [job] = await db.select().from(importJobs).where(eq(importJobs.id, payload.importJobId)).limit(1);
  if (!job) throw new Error("Import job not found");
  const companiesPayload = payload.companies ?? [];
  const start = Math.max(0, Number(payload.cursor ?? 0));
  const existingStats = (job.stats ?? {}) as CompanyImportStats;
  const total = Number(payload.total ?? existingStats.total ?? companiesPayload.length);
  const chunkCount = Number(payload.chunkCount ?? existingStats.chunkCount ?? 1);

  await db.update(importJobs).set({ status: "running" }).where(eq(importJobs.id, job.id));

  let imported = 0;
  let updated = 0;
  let failed = 0;
  let cursor = start;

  for (let i = start; i < companiesPayload.length; i += 1) {
    const row = companiesPayload[i] ?? {};
    try {
      const mapped = mapCompanyImportRow(row);
      if ("error" in mapped) {
        failed += 1;
        await db.insert(importRows).values({
          organizationId: job.organizationId,
          importJobId: job.id,
          objectType: "company",
          externalId: String(row["Company name"] ?? row.name ?? `row-${i}`),
          status: "failed",
          payload: row,
          error: mapped.error
        });
      } else {
        const result = await upsertCompanyByName(db, {
          organizationId: job.organizationId,
          name: mapped.name,
          industry: mapped.industry,
          properties: mapped.properties
        });
        if (result.created) imported += 1;
        else updated += 1;
        await db.insert(importRows).values({
          organizationId: job.organizationId,
          importJobId: job.id,
          objectType: "company",
          externalId: mapped.name,
          status: result.created ? "imported" : "updated",
          payload: { ...row, internalId: result.row.id }
        });
      }
    } catch (error) {
      failed += 1;
      await db.insert(importRows).values({
        organizationId: job.organizationId,
        importJobId: job.id,
        objectType: "company",
        externalId: String(row["Company name"] ?? row.name ?? `row-${i}`),
        status: "failed",
        payload: row,
        error: error instanceof Error ? error.message : "import failed"
      });
    }

    cursor = i + 1;
    if (cursor % CHECKPOINT_EVERY === 0 || cursor === companiesPayload.length) {
      const merged = mergeCompanyImportStats(existingStats, {
        imported,
        updated,
        failed,
        total,
        chunkCount
      });
      await db.update(importJobs).set({
        stats: {
          ...existingStats,
          ...merged
        }
      }).where(eq(importJobs.id, job.id));
    }
  }

  const merged = mergeCompanyImportStats(existingStats, {
    imported,
    updated,
    failed,
    total,
    chunkCount,
    completedChunks: 1
  });
  const isComplete = merged.completedChunks >= merged.chunkCount;
  await db.update(importJobs).set({
    status: isComplete ? "completed" : "running",
    stats: {
      ...existingStats,
      ...merged
    },
    completedAt: isComplete ? new Date() : null
  }).where(eq(importJobs.id, job.id));
}

async function processResendWebhook(payload: { webhookEventId: string; organizationId?: string | null }) {
  const [event] = await db.select().from(webhookEvents).where(eq(webhookEvents.id, payload.webhookEventId)).limit(1);
  if (!event) return;
  const body = event.payload as Record<string, unknown>;
  const data = (body.data ?? body) as Record<string, unknown>;
  const eventType = event.eventType ?? (typeof body.type === "string" ? body.type : "unknown");
  const emailId = typeof data.email_id === "string" ? data.email_id : null;

  if (eventType === "email.received") {
    await processReceivedEmail(body, data, event, emailId);
    return;
  }

  const [relatedSend] = emailId
    ? await db.select().from(emailSends).where(eq(emailSends.resendId, emailId)).limit(1)
    : [];
  const organizationId = event.organizationId ?? payload.organizationId ?? relatedSend?.organizationId ?? null;
  if (organizationId) {
    const dedupeKey = String(body.id ?? data.email_id ?? event.id);
    try {
      await db.insert(emailEvents).values({
        organizationId,
        resendId: emailId,
        eventType,
        email: parseEmailAddresses(data.to)[0] ?? null,
        payload: body,
        dedupeKey
      });
    } catch {
      // duplicate webhook events are ignored
    }

    if (relatedSend && emailId) {
      await db.insert(emailActivities).values({
        organizationId,
        contactId: relatedSend.contactId,
        direction: "outbound",
        activityType: eventType.replace(/^email\./, ""),
        providerEmailId: emailId,
        toEmails: [relatedSend.toEmail],
        dedupeKey: `provider:${emailId}:${eventType}`,
        occurredAt: typeof data.created_at === "string" ? new Date(data.created_at) : new Date(),
        metadata: { webhookEventId: event.id }
      }).onConflictDoNothing();
    }
  }
  await db.update(webhookEvents).set({
    organizationId: organizationId ?? null,
    processedAt: new Date()
  }).where(eq(webhookEvents.id, event.id));
}

async function processReceivedEmail(
  body: Record<string, unknown>,
  data: Record<string, unknown>,
  event: typeof webhookEvents.$inferSelect,
  emailId: string | null
) {
  if (!emailId) {
    await db.update(webhookEvents).set({ processedAt: new Date() }).where(eq(webhookEvents.id, event.id));
    return;
  }

  const receivedResult = env.RESEND_API_KEY
    ? await getReceivedEmail({ apiKey: env.RESEND_API_KEY, emailId })
    : { data: null, error: null };
  if (receivedResult.error) throw new Error(`Unable to retrieve received email ${emailId}`);
  const message = { ...data, ...(receivedResult.data ?? {}) } as Record<string, unknown>;
  const addressValues = [message.to, message.received_for, getEmailHeader(message.headers, "to", "delivered-to")];
  const token = getTrackingToken(addressValues, env.EMAIL_TRACKING_DOMAIN);
  if (!token) {
    await db.update(webhookEvents).set({ processedAt: new Date() }).where(eq(webhookEvents.id, event.id));
    return;
  }

  const [trackingAddress] = await db.select().from(emailTrackingAddresses).where(and(
    eq(emailTrackingAddresses.token, token),
    eq(emailTrackingAddresses.active, true)
  )).limit(1);
  if (!trackingAddress) {
    await db.update(webhookEvents).set({ processedAt: new Date() }).where(eq(webhookEvents.id, event.id));
    return;
  }

  const fromEmail = parseEmailAddresses(message.from)[0] ?? null;
  const trackingEmail = `log_${token}@${env.EMAIL_TRACKING_DOMAIN.trim().toLowerCase()}`;
  const toEmails = parseEmailAddresses(message.to).filter((email) => email !== trackingEmail);
  const ccEmails = parseEmailAddresses(message.cc);
  const bccEmails = parseEmailAddresses(message.bcc);
  const participantEmails = [...new Set([
    ...toEmails,
    ...ccEmails,
    ...parseEmailAddresses(getEmailHeader(message.headers, "to", "cc"))
  ])];
  const contacts = await findContactsByEmails(db, trackingAddress.organizationId, [...participantEmails, ...(fromEmail ? [fromEmail] : [])]);
  const matchedContacts = contacts.filter((candidate) =>
    candidate.emailNormalized === fromEmail || participantEmails.includes(candidate.emailNormalized)
  );
  const inReplyTo = getEmailHeader(message.headers, "in-reply-to") ?? (typeof message.in_reply_to === "string" ? message.in_reply_to : null);
  const references = parseMessageReferences(getEmailHeader(message.headers, "references") ?? message.references);
  const classification = classifyEmailActivity({
    fromEmail,
    contactEmails: contacts.map((candidate) => candidate.emailNormalized),
    inReplyTo,
    references
  });
  const messageId = typeof message.message_id === "string" ? message.message_id : getEmailHeader(message.headers, "message-id");
  const subject = typeof message.subject === "string" ? message.subject : null;
  const occurredAt = typeof message.created_at === "string" ? new Date(message.created_at) : new Date(event.createdAt);
  const contactsToRecord = matchedContacts.length > 0 ? matchedContacts : [null];
  for (const contact of contactsToRecord) {
    const metadata = {
      webhookEventId: event.id,
      matchedContact: Boolean(contact),
      candidateEmails: contacts.map((candidate) => candidate.emailNormalized)
    };
    await db.insert(emailActivities).values({
      organizationId: trackingAddress.organizationId,
      contactId: contact?.id ?? null,
      trackingAddressId: trackingAddress.id,
      direction: classification.direction,
      activityType: classification.activityType,
      providerEmailId: emailId,
      fromEmail,
      toEmails,
      ccEmails,
      bccEmails,
      subject,
      messageId,
      inReplyTo,
      threadKey: inReplyTo ?? references[0] ?? messageId ?? subject?.toLowerCase() ?? emailId,
      bodyText: typeof message.text === "string" ? message.text : null,
      bodyHtml: typeof message.html === "string" ? message.html : null,
      metadata,
      dedupeKey: `received:${emailId}:${contact?.id ?? "unmatched"}`,
      occurredAt
    }).onConflictDoNothing();
  }

  await db.insert(emailEvents).values({
    organizationId: trackingAddress.organizationId,
    resendId: emailId,
    eventType: "email.received",
    email: fromEmail,
    payload: body,
    dedupeKey: String(body.id ?? emailId)
  }).onConflictDoNothing();
  await db.update(webhookEvents).set({
    organizationId: trackingAddress.organizationId,
    processedAt: new Date()
  }).where(eq(webhookEvents.id, event.id));
}

async function processWorkflowStep(payload: {
  enrollmentId?: string;
  workflowId?: string;
  contactId?: string;
  stepIndex?: number;
  formId?: string;
}) {
  if (!payload.workflowId || !payload.enrollmentId) {
    if (payload.formId && payload.contactId) {
      const matches = await db.select().from(workflows).where(eq(workflows.triggerType, "form_submission"));
      for (const workflow of matches) {
        const [enrollment] = await db.insert(workflowEnrollments).values({
          organizationId: workflow.organizationId,
          workflowId: workflow.id,
          contactId: payload.contactId,
          status: "active"
        }).returning();
        await enqueueJob(db, {
          organizationId: workflow.organizationId,
          kind: "workflow.run_step",
          payload: {
            enrollmentId: enrollment.id,
            workflowId: workflow.id,
            contactId: payload.contactId,
            stepIndex: 0
          }
        });
      }
    }
    return;
  }

  const [workflow] = await db.select().from(workflows).where(eq(workflows.id, payload.workflowId)).limit(1);
  if (!workflow) return;
  const definition = workflow.definition as {
    steps?: Array<{ type: string; campaignId?: string; field?: string; value?: unknown }>;
  };
  const stepIndex = payload.stepIndex ?? 0;
  const step = definition.steps?.[stepIndex];

  if (step?.type === "condition" && step.field && payload.contactId) {
    const contact = await getContactById(db, workflow.organizationId, payload.contactId);
    const props = (contact?.properties ?? {}) as Record<string, unknown>;
    const field = String(step.field);
    const actual = field.startsWith("properties.")
      ? props[field.slice("properties.".length)]
      : field === "lifecycle_stage" || field === "lifecyclestage"
        ? contact?.lifecycleStage
        : null;
    const matched = actual === step.value;
    await db.insert(workflowRuns).values({
      organizationId: workflow.organizationId,
      enrollmentId: payload.enrollmentId,
      stepIndex,
      status: matched ? "completed" : "skipped",
      result: { step, actual, matched }
    });
    if (!matched) {
      await db.update(workflowEnrollments).set({
        status: "completed",
        updatedAt: new Date()
      }).where(eq(workflowEnrollments.id, payload.enrollmentId));
      return;
    }
  } else {
    await db.insert(workflowRuns).values({
      organizationId: workflow.organizationId,
      enrollmentId: payload.enrollmentId,
      stepIndex,
      status: "completed",
      result: { step: step ?? null }
    });
  }

  await db.update(workflowEnrollments).set({
    currentStep: stepIndex + 1,
    status: step ? "active" : "completed",
    updatedAt: new Date()
  }).where(eq(workflowEnrollments.id, payload.enrollmentId));

  if (step?.type === "send_campaign" && step.campaignId) {
    await enqueueJob(db, {
      organizationId: workflow.organizationId,
      kind: "campaign.send",
      payload: { campaignId: step.campaignId }
    });
  }
}

async function processContactCompanyReconciliation(payload: { organizationId: string }) {
  return reconcileContactCompanyAssociations(db, {
    organizationId: payload.organizationId
  });
}

async function handleJob(kind: string, payload: Record<string, unknown>) {
  switch (kind) {
    case "campaign.send":
      await processCampaignSend(payload as { campaignId: string });
      return;
    case "import.hubspot.properties":
      await processHubspotPropertiesImport(payload as {
        importJobId: string;
        objectType?: string;
        properties?: Array<Record<string, unknown>>;
        cursor?: number;
      });
      return;
    case "import.hubspot":
      await processHubspotImport(payload as {
        importJobId: string;
        contacts?: Array<Record<string, unknown>>;
        cursor?: number;
      });
      return;
    case "import.contacts.csv":
      await processHubspotImport(payload as {
        importJobId: string;
        contacts?: Array<Record<string, unknown>>;
        cursor?: number;
      });
      return;
    case "import.companies.csv":
      await processCompanyImport(payload as {
        importJobId: string;
        companies?: Array<Record<string, unknown>>;
        cursor?: number;
        total?: number;
        chunkCount?: number;
      });
      return;
    case "webhook.resend.process":
      await processResendWebhook(payload as { webhookEventId: string; organizationId?: string | null });
      return;
    case "workflow.trigger.form_submit":
    case "workflow.run_step":
      await processWorkflowStep(payload as {
        enrollmentId?: string;
        workflowId?: string;
        contactId?: string;
        stepIndex?: number;
        formId?: string;
      });
      return;
    case "contacts.reconcile_companies":
      await processContactCompanyReconciliation(payload as { organizationId: string });
      return;
    case "noop":
      return;
    default:
      throw new Error(`Unknown job kind: ${kind}`);
  }
}

async function tick() {
  const claimed = await claimJobs(db, 5);
  for (const job of claimed) {
    try {
      await handleJob(job.kind, job.payload as Record<string, unknown>);
      await completeJob(db, job.id);
    } catch (error) {
      await completeJob(db, job.id, error instanceof Error ? error.message : "job failed");
    }
  }
}

console.log("[worker] started");
await enqueueJob(db, { kind: "noop", payload: { hello: "worker" } });
setInterval(() => {
  void tick();
}, 2000);
void tick();
