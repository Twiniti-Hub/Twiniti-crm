import "dotenv/config";
import { and, eq } from "drizzle-orm";
import { loadEnv } from "@twiniti/config";
import {
  campaignRecipients,
  campaigns,
  claimJobs,
  completeJob,
  createContact,
  emailEvents,
  emailSends,
  enqueueJob,
  findContactByEmail,
  getDb,
  importJobs,
  importRows,
  isEmailSuppressed,
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

    const html = personalizeForContact(campaign.htmlBody ?? "", {
      email: recipient.emailNormalized,
      firstName: null,
      lastName: null
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

async function processHubspotImport(payload: {
  importJobId: string;
  contacts?: Array<Record<string, unknown>>;
}) {
  const [job] = await db.select().from(importJobs).where(eq(importJobs.id, payload.importJobId)).limit(1);
  if (!job) throw new Error("Import job not found");
  await db.update(importJobs).set({ status: "running" }).where(eq(importJobs.id, job.id));

  let imported = 0;
  let skipped = 0;
  let failed = 0;
  for (const row of payload.contacts ?? []) {
    const email = String(row.email ?? "");
    try {
      if (!email) {
        skipped += 1;
        continue;
      }
      const existing = await findContactByEmail(db, job.organizationId, email);
      if (existing) {
        skipped += 1;
        await db.insert(importRows).values({
          organizationId: job.organizationId,
          importJobId: job.id,
          objectType: "contact",
          externalId: String(row.id ?? email),
          status: "skipped",
          payload: row
        });
        continue;
      }
      const contact = await createContact(db, {
        organizationId: job.organizationId,
        email,
        firstName: typeof row.firstname === "string" ? row.firstname : typeof row.firstName === "string" ? row.firstName : null,
        lastName: typeof row.lastname === "string" ? row.lastname : typeof row.lastName === "string" ? row.lastName : null,
        properties: row
      });
      imported += 1;
      await db.insert(importRows).values({
        organizationId: job.organizationId,
        importJobId: job.id,
        objectType: "contact",
        externalId: String(row.id ?? email),
        status: "imported",
        payload: { ...row, internalId: contact.id }
      });
    } catch (error) {
      failed += 1;
      await db.insert(importRows).values({
        organizationId: job.organizationId,
        importJobId: job.id,
        objectType: "contact",
        externalId: String(row.id ?? email),
        status: "failed",
        payload: row,
        error: error instanceof Error ? error.message : "import failed"
      });
    }
  }

  await db.update(importJobs).set({
    status: "completed",
    stats: { imported, skipped, failed },
    completedAt: new Date()
  }).where(eq(importJobs.id, job.id));
}

async function processResendWebhook(payload: { webhookEventId: string }) {
  const [event] = await db.select().from(webhookEvents).where(eq(webhookEvents.id, payload.webhookEventId)).limit(1);
  if (!event) return;
  const body = event.payload as Record<string, unknown>;
  const data = (body.data ?? body) as Record<string, unknown>;
  const dedupeKey = String(body.id ?? data.email_id ?? event.id);
  try {
    await db.insert(emailEvents).values({
      organizationId: event.organizationId ?? "00000000-0000-0000-0000-000000000000",
      resendId: typeof data.email_id === "string" ? data.email_id : null,
      eventType: event.eventType ?? "unknown",
      email: typeof data.to === "string" ? data.to : Array.isArray(data.to) ? String(data.to[0]) : null,
      payload: body,
      dedupeKey
    });
  } catch {
    // duplicate webhook events are ignored
  }
  await db.update(webhookEvents).set({ processedAt: new Date() }).where(eq(webhookEvents.id, event.id));
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
  const definition = workflow.definition as { steps?: Array<{ type: string; campaignId?: string }> };
  const stepIndex = payload.stepIndex ?? 0;
  const step = definition.steps?.[stepIndex];
  await db.insert(workflowRuns).values({
    organizationId: workflow.organizationId,
    enrollmentId: payload.enrollmentId,
    stepIndex,
    status: "completed",
    result: { step: step ?? null }
  });
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
    case "import.hubspot":
      await processHubspotImport(payload as { importJobId: string; contacts?: Array<Record<string, unknown>> });
      return;
    case "webhook.resend.process":
      await processResendWebhook(payload as { webhookEventId: string });
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
