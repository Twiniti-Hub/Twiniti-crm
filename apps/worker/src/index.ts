import "dotenv/config";
import { and, eq } from "drizzle-orm";
import { loadEnv } from "@twiniti/config";
import {
  campaignRecipients,
  campaigns,
  claimJobs,
  completeJob,
  emailEvents,
  emailSends,
  enqueueJob,
  getContactById,
  getDb,
  HUBSPOT_CORE_CONTACT_FIELDS,
  importJobs,
  importRows,
  isEmailSuppressed,
  listPropertyDefinitions,
  mapHubspotContactRow,
  organizations,
  upsertContactByEmail,
  upsertExternalRecordId,
  upsertPropertyDefinitionFromHubspot,
  webhookEvents,
  workflowEnrollments,
  workflowRuns,
  workflows,
  writeAudit
} from "@twiniti/db";
import { personalizeForContact, sendEmail } from "@twiniti/email";

const env = loadEnv({
  ...process.env,
  DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://user:password@localhost:5432/twiniti_crm"
});

const db = getDb(env.DATABASE_URL);
const CHECKPOINT_EVERY = 25;

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
}) {
  const [job] = await db.select().from(importJobs).where(eq(importJobs.id, payload.importJobId)).limit(1);
  if (!job) throw new Error("Import job not found");
  const contactsPayload = payload.contacts ?? [];
  const start = Math.max(0, Number(payload.cursor ?? (job.stats as { cursor?: number })?.cursor ?? 0));

  await db.update(importJobs).set({ status: "running" }).where(eq(importJobs.id, job.id));

  const definitions = await listPropertyDefinitions(db, job.organizationId, { objectType: "contact" });
  const definedNames = new Set(definitions.map((d) => d.internalName));
  for (const core of HUBSPOT_CORE_CONTACT_FIELDS) definedNames.add(core);

  let imported = Number((job.stats as { imported?: number })?.imported ?? 0);
  let updated = Number((job.stats as { updated?: number })?.updated ?? 0);
  let failed = Number((job.stats as { failed?: number })?.failed ?? 0);
  let unmapped = Number((job.stats as { unmapped?: number })?.unmapped ?? 0);
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
        const result = await upsertContactByEmail(db, {
          organizationId: job.organizationId,
          email: mapped.email,
          firstName: mapped.firstName,
          lastName: mapped.lastName,
          lifecycleStage: mapped.lifecycleStage,
          properties: mapped.properties
        });
        if (result.created) imported += 1;
        else updated += 1;

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
      await db.update(importJobs).set({
        stats: { imported, updated, failed, unmapped, cursor, total: contactsPayload.length }
      }).where(eq(importJobs.id, job.id));
    }
  }

  await db.update(importJobs).set({
    status: "completed",
    stats: { imported, updated, failed, unmapped, cursor, total: contactsPayload.length },
    completedAt: new Date()
  }).where(eq(importJobs.id, job.id));
}

async function processResendWebhook(payload: { webhookEventId: string; organizationId?: string | null }) {
  const [event] = await db.select().from(webhookEvents).where(eq(webhookEvents.id, payload.webhookEventId)).limit(1);
  if (!event) return;
  const body = event.payload as Record<string, unknown>;
  const data = (body.data ?? body) as Record<string, unknown>;
  const dedupeKey = String(body.id ?? data.email_id ?? event.id);
  let organizationId = event.organizationId ?? payload.organizationId ?? null;
  if (!organizationId) {
    const [org] = await db.select().from(organizations).limit(1);
    organizationId = org?.id ?? null;
  }
  if (!organizationId) {
    await db.update(webhookEvents).set({
      processedAt: new Date()
    }).where(eq(webhookEvents.id, event.id));
    throw new Error("Cannot process Resend webhook without an organization");
  }
  try {
    await db.insert(emailEvents).values({
      organizationId,
      resendId: typeof data.email_id === "string" ? data.email_id : null,
      eventType: event.eventType ?? "unknown",
      email: typeof data.to === "string" ? data.to : Array.isArray(data.to) ? String(data.to[0]) : null,
      payload: body,
      dedupeKey
    });
  } catch {
    // duplicate webhook events are ignored
  }
  await db.update(webhookEvents).set({
    organizationId,
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
