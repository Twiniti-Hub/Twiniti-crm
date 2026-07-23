import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { assertScope } from "@twiniti/auth";
import type { AppEnv } from "@twiniti/config";
import {
  agentIdentitySchema,
  createCampaignSchema,
  createSegmentSchema,
  createFormSchema,
  createListSchema,
  createWorkflowSchema,
  filterAstSchema,
  hubspotContactsImportBodySchema,
  hubspotPropertyDefinitionsImportBodySchema,
  ingestEventSchema
} from "@twiniti/contracts";
import {
  agentIdentities,
  campaignApprovals,
  campaignRecipients,
  campaigns,
  compileFilterAst,
  contacts,
  contentHash,
  createContact,
  customerEvents,
  emailEvents,
  emailTemplates,
  enqueueJob,
  experiments,
  findContactByEmail,
  forms,
  formSubmissions,
  importJobs,
  isEmailSuppressed,
  listCampaigns,
  listMemberships,
  listPropertyDefinitions,
  listSegments,
  lists,
  mintAgentCredential,
  normalizeEmail,
  organizations,
  parseFilterAst,
  propertyDefinitions,
  reportDefinitions,
  searchContacts,
  segments,
  storeWebhookEvent,
  suppressionEntries,
  workflows,
  workflowEnrollments,
  type Db
} from "@twiniti/db";
import { personalizeForContact, verifyResendWebhookSignature } from "@twiniti/email";
import { z } from "zod";
import { audit, requireActor, requireUserRole, sendError } from "../auth-hook.js";

const createTemplateSchema = z.object({
  name: z.string().trim().min(1).max(160),
  subject: z.string().trim().min(1).max(300),
  htmlBody: z.string().min(1),
  textBody: z.string().optional(),
  status: z.enum(["draft", "review", "published", "archived"]).optional()
});

const publicFormSubmitSchema = z.object({
  payload: z.record(z.unknown())
});

export async function registerMarketingRoutes(app: FastifyInstance, db: Db, env: AppEnv) {
  app.get("/api/v1/properties", async (request, reply) => {
    try {
      const actor = requireActor(request);
      const query = request.query as { objectType?: string };
      const data = await listPropertyDefinitions(db, actor.organizationId, {
        objectType: query.objectType
      });
      return { data };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/api/v1/properties", async (request, reply) => {
    try {
      const actor = requireActor(request);
      requireUserRole(actor, "admin");
      const body = request.body as {
        objectType: string;
        internalName: string;
        label: string;
        dataType: string;
        options?: unknown[];
        searchable?: boolean;
        required?: boolean;
      };
      const [row] = await db.insert(propertyDefinitions).values({
        organizationId: actor.organizationId,
        objectType: body.objectType,
        internalName: body.internalName,
        label: body.label,
        dataType: body.dataType,
        options: body.options ?? [],
        searchable: body.searchable ?? false,
        required: body.required ?? false
      }).returning();
      await audit(db, actor, "property.create", "property_definition", row.id);
      reply.code(201);
      return { data: row };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/api/v1/segments", async (request, reply) => {
    try {
      const actor = requireActor(request);
      if (actor.type === "agent") assertScope(actor, "segments:read");
      return { data: await listSegments(db, actor.organizationId) };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/api/v1/segments", async (request, reply) => {
    try {
      const actor = requireActor(request);
      requireUserRole(actor, "marketer");
      const input = createSegmentSchema.parse(request.body);
      parseFilterAst(input.filterAst);
      const [row] = await db.insert(segments).values({
        organizationId: actor.organizationId,
        name: input.name,
        description: input.description ?? null,
        filterAst: input.filterAst
      }).returning();
      await audit(db, actor, "segment.create", "segment", row.id);
      reply.code(201);
      return { data: row };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/api/v1/segments/:id/estimate", async (request, reply) => {
    try {
      const actor = requireActor(request);
      if (actor.type === "agent") assertScope(actor, "segments:read");
      const { id } = request.params as { id: string };
      const [segment] = await db.select().from(segments).where(and(eq(segments.id, id), eq(segments.organizationId, actor.organizationId))).limit(1);
      if (!segment) return reply.code(404).send({ error: { code: "not_found", message: "Segment not found" } });
      const filter = compileFilterAst(parseFilterAst(segment.filterAst));
      const rows = await db.select().from(contacts).where(and(eq(contacts.organizationId, actor.organizationId), filter));
      return { data: { count: rows.length } };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/api/v1/lists", async (request, reply) => {
    try {
      const actor = requireActor(request);
      const data = await db.select().from(lists).where(eq(lists.organizationId, actor.organizationId));
      return { data };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/api/v1/lists", async (request, reply) => {
    try {
      const actor = requireActor(request);
      requireUserRole(actor, "marketer");
      const input = createListSchema.parse(request.body);
      const [row] = await db.insert(lists).values({
        organizationId: actor.organizationId,
        name: input.name,
        listType: input.listType ?? "static",
        description: input.description ?? null
      }).returning();
      reply.code(201);
      return { data: row };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/api/v1/lists/:id/members", async (request, reply) => {
    try {
      const actor = requireActor(request);
      requireUserRole(actor, "marketer");
      const { id } = request.params as { id: string };
      const body = request.body as { contactId: string };
      const [row] = await db.insert(listMemberships).values({
        organizationId: actor.organizationId,
        listId: id,
        contactId: body.contactId
      }).returning();
      reply.code(201);
      return { data: row };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/api/v1/forms", async (request, reply) => {
    try {
      const actor = requireActor(request);
      const data = await db.select().from(forms).where(eq(forms.organizationId, actor.organizationId));
      return { data };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/api/v1/forms", async (request, reply) => {
    try {
      const actor = requireActor(request);
      requireUserRole(actor, "marketer");
      const input = createFormSchema.parse(request.body);
      const [row] = await db.insert(forms).values({
        organizationId: actor.organizationId,
        name: input.name,
        slug: input.slug,
        fields: input.fields ?? [],
        settings: input.settings ?? {},
        published: input.published ?? false
      }).returning();
      reply.code(201);
      return { data: row };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/api/v1/public/forms/:slug", async (request, reply) => {
    try {
      const { slug } = request.params as { slug: string };
      const rows = await db.select().from(forms).where(and(eq(forms.slug, slug), eq(forms.published, true))).limit(1);
      if (!rows[0]) return reply.code(404).send({ error: { code: "not_found", message: "Form not found" } });
      return { data: rows[0] };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/api/v1/public/forms/:slug/submit", async (request, reply) => {
    try {
      const { slug } = request.params as { slug: string };
      const input = publicFormSubmitSchema.parse(request.body);
      const [form] = await db.select().from(forms).where(and(eq(forms.slug, slug), eq(forms.published, true))).limit(1);
      if (!form) return reply.code(404).send({ error: { code: "not_found", message: "Form not found" } });
      const email = String(input.payload.email ?? "");
      if (!email) return reply.code(400).send({ error: { code: "bad_request", message: "email is required" } });
      let contact = await findContactByEmail(db, form.organizationId, email);
      if (!contact) {
        contact = await createContact(db, {
          organizationId: form.organizationId,
          email,
          firstName: typeof input.payload.firstName === "string" ? input.payload.firstName : null,
          lastName: typeof input.payload.lastName === "string" ? input.payload.lastName : null,
          properties: input.payload
        });
      }
      const [submission] = await db.insert(formSubmissions).values({
        organizationId: form.organizationId,
        formId: form.id,
        contactId: contact.id,
        payload: input.payload
      }).returning();
      await enqueueJob(db, {
        organizationId: form.organizationId,
        kind: "workflow.trigger.form_submit",
        payload: { formId: form.id, contactId: contact.id, submissionId: submission.id }
      });
      reply.code(201);
      return { data: { submissionId: submission.id, contactId: contact.id } };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/api/v1/templates", async (request, reply) => {
    try {
      const actor = requireActor(request);
      const data = await db.select().from(emailTemplates).where(eq(emailTemplates.organizationId, actor.organizationId));
      return { data };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/api/v1/templates", async (request, reply) => {
    try {
      const actor = requireActor(request);
      requireUserRole(actor, "marketer");
      const input = createTemplateSchema.parse(request.body);
      const [row] = await db.insert(emailTemplates).values({
        organizationId: actor.organizationId,
        name: input.name,
        subject: input.subject,
        htmlBody: input.htmlBody,
        textBody: input.textBody ?? null,
        status: input.status ?? "draft"
      }).returning();
      reply.code(201);
      return { data: row };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/api/v1/campaigns", async (request, reply) => {
    try {
      const actor = requireActor(request);
      return { data: await listCampaigns(db, actor.organizationId) };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/api/v1/campaigns", async (request, reply) => {
    try {
      const actor = requireActor(request);
      if (actor.type === "agent") assertScope(actor, "campaigns:create");
      else requireUserRole(actor, "marketer");
      const input = createCampaignSchema.parse(request.body);
      const hash = contentHash([input.name, input.subject ?? "", input.htmlBody ?? ""]);
      const [row] = await db.insert(campaigns).values({
        organizationId: actor.organizationId,
        name: input.name,
        templateId: input.templateId ?? null,
        segmentId: input.segmentId ?? null,
        listId: input.listId ?? null,
        subject: input.subject ?? null,
        htmlBody: input.htmlBody ?? null,
        contentHash: hash,
        createdByType: actor.type,
        createdById: actor.id,
        status: "draft"
      }).returning();
      await audit(db, actor, "campaign.create", "campaign", row.id);
      reply.code(201);
      return { data: row };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/api/v1/campaigns/:id/preview", async (request, reply) => {
    try {
      const actor = requireActor(request);
      if (actor.type === "agent") assertScope(actor, "campaigns:preview");
      const { id } = request.params as { id: string };
      const [campaign] = await db.select().from(campaigns).where(and(eq(campaigns.id, id), eq(campaigns.organizationId, actor.organizationId))).limit(1);
      if (!campaign) return reply.code(404).send({ error: { code: "not_found", message: "Campaign not found" } });
      const sampleContacts = await searchContacts(db, actor.organizationId, { limit: 3 });
      const previews = sampleContacts.map((contact) => ({
        contactId: contact.id,
        email: contact.email,
        html: personalizeForContact(campaign.htmlBody ?? "", {
          email: contact.email,
          firstName: contact.firstName,
          lastName: contact.lastName,
          properties: (contact.properties ?? {}) as Record<string, unknown>
        }),
        suppressed: false
      }));
      for (const preview of previews) {
        preview.suppressed = await isEmailSuppressed(db, actor.organizationId, preview.email);
      }
      return {
        data: {
          campaignId: campaign.id,
          subject: campaign.subject,
          recipientEstimate: campaign.recipientCount ?? sampleContacts.length,
          previews
        }
      };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/api/v1/campaigns/:id/request-approval", async (request, reply) => {
    try {
      const actor = requireActor(request);
      if (actor.type === "agent") assertScope(actor, "campaigns:request_approval");
      else requireUserRole(actor, "marketer");
      const { id } = request.params as { id: string };
      const [campaign] = await db.select().from(campaigns).where(and(eq(campaigns.id, id), eq(campaigns.organizationId, actor.organizationId))).limit(1);
      if (!campaign) return reply.code(404).send({ error: { code: "not_found", message: "Campaign not found" } });
      let recipients = await searchContacts(db, actor.organizationId, { limit: 100 });
      if (campaign.segmentId) {
        const [segment] = await db.select().from(segments).where(eq(segments.id, campaign.segmentId)).limit(1);
        if (segment) {
          const filter = compileFilterAst(parseFilterAst(segment.filterAst));
          recipients = await db.select().from(contacts).where(and(eq(contacts.organizationId, actor.organizationId), filter));
        }
      }
      const allowed = [];
      for (const contact of recipients) {
        if (!(await isEmailSuppressed(db, actor.organizationId, contact.email))) {
          allowed.push(contact);
        }
      }
      await db.delete(campaignRecipients).where(eq(campaignRecipients.campaignId, campaign.id));
      if (allowed.length) {
        await db.insert(campaignRecipients).values(allowed.map((contact) => ({
          organizationId: actor.organizationId,
          campaignId: campaign.id,
          contactId: contact.id,
          emailNormalized: normalizeEmail(contact.email),
          idempotencyKey: `${campaign.id}:${contact.id}:${campaign.contentHash ?? "na"}`
        })));
      }
      const [approval] = await db.insert(campaignApprovals).values({
        organizationId: actor.organizationId,
        campaignId: campaign.id,
        agentId: actor.type === "agent" ? actor.id : null,
        requestedBy: actor.id,
        status: "pending",
        recipientCount: allowed.length,
        contentHash: campaign.contentHash ?? contentHash([campaign.id]),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }).returning();
      await db.update(campaigns).set({ status: "review", recipientCount: allowed.length, updatedAt: new Date() }).where(eq(campaigns.id, campaign.id));
      await audit(db, actor, "campaign.request_approval", "campaign", campaign.id, { recipientCount: allowed.length });
      return { data: approval };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/api/v1/campaigns/:id/approve", async (request, reply) => {
    try {
      const actor = requireActor(request);
      requireUserRole(actor, "admin");
      const { id } = request.params as { id: string };
      const pending = await db.select().from(campaignApprovals).where(and(
        eq(campaignApprovals.campaignId, id),
        eq(campaignApprovals.organizationId, actor.organizationId),
        eq(campaignApprovals.status, "pending")
      )).limit(1);
      if (!pending[0]) return reply.code(404).send({ error: { code: "not_found", message: "No pending approval" } });
      const [approval] = await db.update(campaignApprovals).set({
        status: "approved",
        approvedBy: actor.id,
        decidedAt: new Date()
      }).where(eq(campaignApprovals.id, pending[0].id)).returning();
      await db.update(campaigns).set({ status: "scheduled", updatedAt: new Date() }).where(eq(campaigns.id, id));
      await audit(db, actor, "campaign.approve", "campaign", id);
      return { data: approval };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/api/v1/campaigns/:id/send", async (request, reply) => {
    try {
      const actor = requireActor(request);
      if (actor.type === "agent") assertScope(actor, "campaigns:send");
      else requireUserRole(actor, "admin");
      const { id } = request.params as { id: string };
      const approvals = await db.select().from(campaignApprovals).where(and(
        eq(campaignApprovals.campaignId, id),
        eq(campaignApprovals.status, "approved")
      )).limit(1);
      if (!approvals[0]) {
        return reply.code(403).send({ error: { code: "approval_required", message: "Campaign send requires approval" } });
      }
      await db.update(campaigns).set({ status: "sending", updatedAt: new Date() }).where(eq(campaigns.id, id));
      const job = await enqueueJob(db, {
        organizationId: actor.organizationId,
        kind: "campaign.send",
        payload: { campaignId: id, approvalId: approvals[0].id },
        priority: 10
      });
      await audit(db, actor, "campaign.send_queued", "campaign", id, { jobId: job.id });
      return { data: { jobId: job.id, status: "sending" } };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/api/v1/agents", async (request, reply) => {
    try {
      const actor = requireActor(request);
      requireUserRole(actor, "admin");
      const data = await db.select().from(agentIdentities).where(eq(agentIdentities.organizationId, actor.organizationId));
      return {
        data: data.map((row) => ({
          id: row.id,
          name: row.name,
          purpose: row.purpose,
          scopes: row.scopes,
          expiresAt: row.expiresAt,
          revokedAt: row.revokedAt,
          lastUsedAt: row.lastUsedAt
        }))
      };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/api/v1/agents", async (request, reply) => {
    try {
      const actor = requireActor(request);
      requireUserRole(actor, "admin");
      const input = agentIdentitySchema.parse(request.body);
      const credential = mintAgentCredential();
      const [row] = await db.insert(agentIdentities).values({
        organizationId: actor.organizationId,
        name: input.name,
        purpose: input.purpose,
        scopes: input.scopes,
        credentialHash: credential.hash,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null
      }).returning();
      await audit(db, actor, "agent.create", "agent", row.id);
      reply.code(201);
      return { data: { id: row.id, name: row.name, scopes: row.scopes, token: credential.token } };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/api/v1/agents/:id/revoke", async (request, reply) => {
    try {
      const actor = requireActor(request);
      requireUserRole(actor, "admin");
      const { id } = request.params as { id: string };
      const [row] = await db.update(agentIdentities).set({ revokedAt: new Date() }).where(and(
        eq(agentIdentities.id, id),
        eq(agentIdentities.organizationId, actor.organizationId)
      )).returning();
      if (!row) return reply.code(404).send({ error: { code: "not_found", message: "Agent not found" } });
      await audit(db, actor, "agent.revoke", "agent", id);
      return { data: { id, revokedAt: row.revokedAt } };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/api/v1/agents/tools", async () => ({
    tools: [
      { name: "search_contacts", scope: "contacts:read" },
      { name: "get_contact", scope: "contacts:read" },
      { name: "create_contact", scope: "contacts:create" },
      { name: "upsert_contact", scope: "contacts:update" },
      { name: "update_contact", scope: "contacts:update" },
      { name: "get_contact_timeline", scope: "contacts:read" },
      { name: "create_campaign_draft", scope: "campaigns:create" },
      { name: "preview_campaign", scope: "campaigns:preview" },
      { name: "validate_campaign", scope: "campaigns:preview" },
      { name: "request_campaign_approval", scope: "campaigns:request_approval" },
      { name: "send_approved_campaign", scope: "campaigns:send" },
      { name: "get_campaign_status", scope: "campaigns:preview" },
      { name: "get_email_events", scope: "email_events:read" },
      { name: "estimate_segment_size", scope: "segments:read" }
    ]
  }));

  app.post("/api/v1/events", async (request, reply) => {
    try {
      const actor = requireActor(request);
      requireUserRole(actor, "marketer");
      const input = ingestEventSchema.parse(request.body);
      const [row] = await db.insert(customerEvents).values({
        organizationId: actor.organizationId,
        contactId: input.contactId ?? null,
        companyId: input.companyId ?? null,
        eventType: input.eventType,
        source: input.source,
        occurredAt: new Date(input.occurredAt ?? Date.now()),
        payload: input.payload ?? {},
        dedupeKey: input.dedupeKey ?? null,
        privacyClass: input.privacyClass ?? "standard"
      }).returning();
      reply.code(201);
      return { data: row };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/api/v1/imports/hubspot/properties", async (request, reply) => {
    try {
      const actor = requireActor(request);
      requireUserRole(actor, "admin");
      const body = hubspotPropertyDefinitionsImportBodySchema.parse(request.body);
      const [job] = await db.insert(importJobs).values({
        organizationId: actor.organizationId,
        provider: "hubspot",
        mode: "csv",
        status: "queued",
        stats: { queued: body.properties.length, kind: "properties", cursor: 0 }
      }).returning();
      await enqueueJob(db, {
        organizationId: actor.organizationId,
        kind: "import.hubspot.properties",
        payload: {
          importJobId: job.id,
          objectType: body.objectType,
          properties: body.properties,
          cursor: 0
        }
      });
      await audit(db, actor, "import.hubspot.properties", "import_job", job.id, {
        count: body.properties.length
      });
      reply.code(202);
      return { data: job };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/api/v1/imports/hubspot", async (request, reply) => {
    try {
      const actor = requireActor(request);
      requireUserRole(actor, "admin");
      const body = hubspotContactsImportBodySchema.parse(request.body);
      const [job] = await db.insert(importJobs).values({
        organizationId: actor.organizationId,
        provider: "hubspot",
        mode: "csv",
        status: "queued",
        stats: { queued: body.contacts.length, kind: "contacts", cursor: body.cursor ?? 0 }
      }).returning();
      await enqueueJob(db, {
        organizationId: actor.organizationId,
        kind: "import.hubspot",
        payload: {
          importJobId: job.id,
          contacts: body.contacts,
          cursor: body.cursor ?? 0
        }
      });
      await audit(db, actor, "import.hubspot.contacts", "import_job", job.id, {
        count: body.contacts.length
      });
      reply.code(202);
      return { data: job };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/api/v1/imports/:id", async (request, reply) => {
    try {
      const actor = requireActor(request);
      requireUserRole(actor, "viewer");
      const { id } = request.params as { id: string };
      const [job] = await db.select().from(importJobs).where(and(
        eq(importJobs.id, id),
        eq(importJobs.organizationId, actor.organizationId)
      )).limit(1);
      if (!job) return reply.code(404).send({ error: { code: "not_found", message: "Import job not found" } });
      return { data: job };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/api/v1/workflows", async (request, reply) => {
    try {
      const actor = requireActor(request);
      const data = await db.select().from(workflows).where(eq(workflows.organizationId, actor.organizationId));
      return { data };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/api/v1/workflows", async (request, reply) => {
    try {
      const actor = requireActor(request);
      requireUserRole(actor, "marketer");
      const input = createWorkflowSchema.parse(request.body);
      const [row] = await db.insert(workflows).values({
        organizationId: actor.organizationId,
        name: input.name,
        triggerType: input.triggerType,
        definition: input.definition ?? {},
        status: input.status ?? "draft"
      }).returning();
      reply.code(201);
      return { data: row };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/api/v1/workflows/:id/enroll", async (request, reply) => {
    try {
      const actor = requireActor(request);
      requireUserRole(actor, "marketer");
      const { id } = request.params as { id: string };
      const body = request.body as { contactId: string };
      const [row] = await db.insert(workflowEnrollments).values({
        organizationId: actor.organizationId,
        workflowId: id,
        contactId: body.contactId,
        status: "active"
      }).returning();
      await enqueueJob(db, {
        organizationId: actor.organizationId,
        kind: "workflow.run_step",
        payload: { enrollmentId: row.id, workflowId: id, contactId: body.contactId, stepIndex: 0 }
      });
      reply.code(201);
      return { data: row };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/api/v1/reports/overview", async (request, reply) => {
    try {
      const actor = requireActor(request);
      const contactRows = await searchContacts(db, actor.organizationId, { limit: 100 });
      const campaignRows = await listCampaigns(db, actor.organizationId);
      const segmentRows = await listSegments(db, actor.organizationId);
      return {
        data: {
          contacts: contactRows.length,
          campaigns: campaignRows.length,
          segments: segmentRows.length,
          attributionModel: "last_touch",
          freshness: new Date().toISOString(),
          definition: "Overview counts from live CRM tables"
        }
      };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/api/v1/ai/suggest-segment", async (request, reply) => {
    try {
      const actor = requireActor(request);
      requireUserRole(actor, "marketer");
      const body = request.body as { prompt?: string };
      const prompt = (body.prompt ?? "").toLowerCase();
      const filterAst = prompt.includes("inactive")
        ? { op: "and", children: [{ op: "eq", field: "lifecycle_stage", value: "lead" }] }
        : { op: "and", children: [{ op: "contains", field: "email", value: "@" }] };
      filterAstSchema.parse(filterAst);
      return {
        data: {
          draft: true,
          explanation: "Suggested filter AST derived from prompt keywords. Review before saving.",
          filterAst
        }
      };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/api/v1/webhooks/resend", async (request, reply) => {
    try {
      const raw = typeof request.body === "string" ? request.body : JSON.stringify(request.body ?? {});
      const signature = request.headers["svix-signature"] ?? request.headers["resend-signature"];
      const signatureHeader = Array.isArray(signature) ? signature[0] : signature;
      const valid = verifyResendWebhookSignature(raw, signatureHeader, env.RESEND_WEBHOOK_SECRET);
      if (!valid) {
        return reply.code(401).send({
          error: { code: "unauthorized", message: "Invalid Resend webhook signature" }
        });
      }
      const payload = typeof request.body === "object" && request.body ? request.body as Record<string, unknown> : { raw };
      const [org] = await db.select().from(organizations).limit(1);
      const event = await storeWebhookEvent(db, {
        organizationId: org?.id ?? null,
        provider: "resend",
        eventType: typeof payload.type === "string" ? payload.type : "unknown",
        payload,
        signatureValid: true
      });
      await enqueueJob(db, {
        organizationId: org?.id ?? null,
        kind: "webhook.resend.process",
        payload: { webhookEventId: event.id, organizationId: org?.id ?? null }
      });
      return { data: { accepted: true, signatureValid: true } };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/api/v1/deliverability", async (request, reply) => {
    try {
      const actor = requireActor(request);
      requireUserRole(actor, "analyst");
      const events = await db.select().from(emailEvents).where(eq(emailEvents.organizationId, actor.organizationId)).limit(100);
      const suppressions = await db.select().from(suppressionEntries).where(eq(suppressionEntries.organizationId, actor.organizationId)).limit(100);
      return {
        data: {
          recentEvents: events.length,
          suppressions: suppressions.length,
          fromEmail: env.RESEND_FROM_EMAIL,
          bounceRateHint: events.filter((e) => e.eventType.includes("bounce")).length,
          complaintRateHint: events.filter((e) => e.eventType.includes("complaint")).length
        }
      };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/api/v1/experiments", async (request, reply) => {
    try {
      const actor = requireActor(request);
      requireUserRole(actor, "marketer");
      const body = request.body as { name: string; campaignId?: string; variants?: unknown[]; conversionGoal?: string };
      const [row] = await db.insert(experiments).values({
        organizationId: actor.organizationId,
        name: body.name,
        campaignId: body.campaignId ?? null,
        variants: body.variants ?? [],
        conversionGoal: body.conversionGoal ?? "click",
        status: "draft"
      }).returning();
      reply.code(201);
      return { data: row };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/api/v1/reports/definitions", async (request, reply) => {
    try {
      const actor = requireActor(request);
      const data = await db.select().from(reportDefinitions).where(eq(reportDefinitions.organizationId, actor.organizationId));
      return { data };
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
