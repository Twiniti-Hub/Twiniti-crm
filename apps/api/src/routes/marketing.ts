import type { FastifyInstance } from "fastify";
import { and, desc, eq, sql } from "drizzle-orm";
import { assertScope } from "@twiniti/auth";
import type { AppEnv } from "@twiniti/config";
import {
  agentIdentitySchema,
  createCampaignSchema,
  csvCompaniesImportBodySchema,
  createSegmentSchema,
  createFormSchema,
  createListSchema,
  createPropertyDefinitionSchema,
  createWorkflowSchema,
  filterAstSchema,
  csvContactsImportBodySchema,
  hubspotContactsImportBodySchema,
  hubspotPropertyDefinitionsImportBodySchema,
  ingestEventSchema,
  updatePropertyDefinitionSchema
} from "@twiniti/contracts";
import {
  agentIdentities,
  campaignApprovals,
  campaignRecipients,
  campaigns,
  companies,
  compileFilterAst,
  contacts,
  contentHash,
  createContact,
  customerEvents,
  emailTrackingAddresses,
  emailEvents,
  emailTemplates,
  enqueueJob,
  experiments,
  findContactByEmail,
  getEmailTrackingAddress,
  HUBSPOT_CONTACT_FIELD_ALIASES,
  HUBSPOT_CONTACT_COMPANY_FIELD_ALIASES,
  getContactPropertyDeletionImpact,
  deleteContactPropertyDefinition,
  forms,
  formSubmissions,
  importJobs,
  importRows,
  isEmailSuppressed,
  listCampaigns,
  listMemberships,
  listPropertyDefinitions,
  listSegments,
  lists,
  mintAgentCredential,
  mintEmailTrackingToken,
  buildEmailTrackingAddress,
  countContacts,
  normalizeEmail,
  normalizeHubspotInternalName,
  parseFilterAst,
  propertyDefinitions,
  upsertPropertyDefinition,
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
import { audit, requireActor, requireOrgId, requireUserRole, sendError } from "../auth-hook.js";

const createTemplateSchema = z.object({
  name: z.string().trim().min(1).max(160),
  subject: z.string().trim().min(1).max(300),
  htmlBody: z.string().min(1),
  textBody: z.string().optional(),
  status: z.enum(["draft", "review", "published", "archived"]).optional()
});

const CONTACT_IMPORT_CHUNK_SIZE = 250;
const COMPANY_IMPORT_CHUNK_SIZE = 250;

async function ensureCsvContactProperties(db: Db, organizationId: string, headers: string[]) {
  const definitions = await listPropertyDefinitions(db, organizationId, { objectType: "contact" });
  const known = new Set(definitions.flatMap((definition) => [
    normalizeHubspotInternalName(definition.internalName),
    normalizeHubspotInternalName(definition.label)
  ]));
  const created: string[] = [];
  for (const header of headers) {
    const internalName = normalizeHubspotInternalName(header);
    if (
      HUBSPOT_CONTACT_FIELD_ALIASES.has(internalName) ||
      HUBSPOT_CONTACT_COMPANY_FIELD_ALIASES.has(internalName) ||
      internalName === "id" ||
      known.has(internalName)
    ) continue;
    await upsertPropertyDefinition(db, {
      organizationId,
      objectType: "contact",
      internalName,
      label: header.trim(),
      dataType: "string",
      fieldGroup: "CSV import",
      searchable: false,
      hubspotMetadata: { source: "csv", originalHeader: header }
    });
    known.add(internalName);
    created.push(internalName);
  }
  return created;
}

async function enqueueContactImportChunks(
  db: Db,
  input: {
    organizationId: string;
    importJobId: string;
    contacts: Array<Record<string, unknown>>;
  }
) {
  const chunkCount = Math.max(1, Math.ceil(input.contacts.length / CONTACT_IMPORT_CHUNK_SIZE));
  for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
    const offset = chunkIndex * CONTACT_IMPORT_CHUNK_SIZE;
    const contacts = input.contacts.slice(offset, offset + CONTACT_IMPORT_CHUNK_SIZE);
    await enqueueJob(db, {
      organizationId: input.organizationId,
      kind: "import.contacts.csv",
      payload: {
        importJobId: input.importJobId,
        contacts,
        offset,
        total: input.contacts.length,
        chunkIndex,
        chunkCount
      }
    });
  }
  return chunkCount;
}

async function ensureCsvCompanyProperties(db: Db, organizationId: string, headers: string[]) {
  const definitions = await listPropertyDefinitions(db, organizationId, { objectType: "company" });
  const known = new Set(definitions.flatMap((definition) => [
    normalizeHubspotInternalName(definition.internalName),
    normalizeHubspotInternalName(definition.label)
  ]));
  const reserved = new Set(["company_name", "name", "industry"]);
  const created: string[] = [];
  for (const header of headers) {
    const internalName = normalizeHubspotInternalName(header);
    if (reserved.has(internalName) || known.has(internalName)) continue;
    await upsertPropertyDefinition(db, {
      organizationId,
      objectType: "company",
      internalName,
      label: header.trim(),
      dataType: "string",
      fieldGroup: "CSV import",
      searchable: false,
      hubspotMetadata: { source: "csv", originalHeader: header }
    });
    known.add(internalName);
    created.push(internalName);
  }
  return created;
}

async function enqueueCompanyImportChunks(
  db: Db,
  input: {
    organizationId: string;
    importJobId: string;
    companies: Array<Record<string, unknown>>;
  }
) {
  const chunkCount = Math.max(1, Math.ceil(input.companies.length / COMPANY_IMPORT_CHUNK_SIZE));
  for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
    const offset = chunkIndex * COMPANY_IMPORT_CHUNK_SIZE;
    const companies = input.companies.slice(offset, offset + COMPANY_IMPORT_CHUNK_SIZE);
    await enqueueJob(db, {
      organizationId: input.organizationId,
      kind: "import.companies.csv",
      payload: {
        importJobId: input.importJobId,
        companies,
        offset,
        total: input.companies.length,
        chunkIndex,
        chunkCount
      }
    });
  }
  return chunkCount;
}

const publicFormSubmitSchema = z.object({
  payload: z.record(z.unknown())
});

export async function registerMarketingRoutes(app: FastifyInstance, db: Db, env: AppEnv) {
  app.get("/api/v1/properties", async (request, reply) => {
    try {
      const actor = requireActor(request);
      if (actor.type === "agent") assertScope(actor, "properties:read");
      const query = request.query as { objectType?: string };
      const data = await listPropertyDefinitions(db, requireOrgId(actor), {
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
      const body = createPropertyDefinitionSchema.parse(request.body);
      const result = await upsertPropertyDefinition(db, {
        organizationId: requireOrgId(actor),
        objectType: body.objectType,
        internalName: body.internalName,
        label: body.label,
        dataType: body.dataType,
        fieldGroup: body.fieldGroup ?? null,
        options: body.options ?? [],
        searchable: body.searchable ?? false,
        required: body.required ?? false
      });
      const row = result.row;
      await audit(db, actor, "property.create", "property_definition", row.id);
      reply.code(result.created ? 201 : 200);
      return { data: row };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.patch("/api/v1/properties/:id", async (request, reply) => {
    try {
      const actor = requireActor(request);
      requireUserRole(actor, "admin");
      const { id } = request.params as { id: string };
      const body = updatePropertyDefinitionSchema.extend({
        archived: z.boolean().optional()
      }).parse(request.body);
      const [existing] = await db.select().from(propertyDefinitions).where(and(
        eq(propertyDefinitions.id, id),
        eq(propertyDefinitions.organizationId, requireOrgId(actor))
      )).limit(1);
      if (!existing) {
        return reply.code(404).send({ error: { code: "not_found", message: "Property definition not found" } });
      }
      const [row] = await db.update(propertyDefinitions).set({
        label: body.label ?? existing.label,
        dataType: body.dataType ?? existing.dataType,
        fieldGroup: body.fieldGroup === undefined ? existing.fieldGroup : (body.fieldGroup || null),
        options: body.options ?? existing.options,
        searchable: body.searchable ?? existing.searchable,
        required: body.required ?? existing.required,
        archived: body.archived ?? existing.archived
      }).where(eq(propertyDefinitions.id, existing.id)).returning();
      await audit(db, actor, "property.update", "property_definition", row.id, {
        archived: row.archived
      });
      return { data: row };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/api/v1/properties/:id/impact", async (request, reply) => {
    try {
      const actor = requireActor(request);
      requireUserRole(actor, "admin");
      const { id } = request.params as { id: string };
      const impact = await getContactPropertyDeletionImpact(db, requireOrgId(actor), id);
      if (!impact) {
        return reply.code(404).send({ error: { code: "not_found", message: "Property definition not found" } });
      }
      return { data: impact };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.delete("/api/v1/properties/:id", async (request, reply) => {
    try {
      const actor = requireActor(request);
      requireUserRole(actor, "admin");
      const { id } = request.params as { id: string };
      const result = await deleteContactPropertyDefinition(db, requireOrgId(actor), id);
      if (!result) {
        return reply.code(404).send({ error: { code: "not_found", message: "Property definition not found" } });
      }
      await audit(db, actor, "property.delete", "property_definition", result.deleted.id, {
        internalName: result.deleted.internalName,
        contactsWithValue: result.impact.contactsWithValue,
        references: result.impact.references
      });
      return {
        data: {
          property: result.impact.property,
          contactsWithValue: result.impact.contactsWithValue,
          historyEntries: result.impact.historyEntries,
          references: result.impact.references
        }
      };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/api/v1/segments", async (request, reply) => {
    try {
      const actor = requireActor(request);
      if (actor.type === "agent") assertScope(actor, "segments:read");
      return { data: await listSegments(db, requireOrgId(actor)) };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/api/v1/segments", async (request, reply) => {
    try {
      const actor = requireActor(request);
      requireUserRole(actor, "member");
      const input = createSegmentSchema.parse(request.body);
      parseFilterAst(input.filterAst);
      const [row] = await db.insert(segments).values({
        organizationId: requireOrgId(actor),
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
      const [segment] = await db.select().from(segments).where(and(eq(segments.id, id), eq(segments.organizationId, requireOrgId(actor)))).limit(1);
      if (!segment) return reply.code(404).send({ error: { code: "not_found", message: "Segment not found" } });
      const filter = compileFilterAst(parseFilterAst(segment.filterAst));
      const rows = await db.select().from(contacts).where(and(eq(contacts.organizationId, requireOrgId(actor)), filter));
      return { data: { count: rows.length } };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/api/v1/lists", async (request, reply) => {
    try {
      const actor = requireActor(request);
      if (actor.type === "agent") assertScope(actor, "lists:read");
      const data = await db.select().from(lists).where(eq(lists.organizationId, requireOrgId(actor)));
      return { data };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/api/v1/lists", async (request, reply) => {
    try {
      const actor = requireActor(request);
      requireUserRole(actor, "member");
      const input = createListSchema.parse(request.body);
      const [row] = await db.insert(lists).values({
        organizationId: requireOrgId(actor),
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
      requireUserRole(actor, "member");
      const { id } = request.params as { id: string };
      const body = z.object({ contactId: z.string().uuid() }).parse(request.body);
      const organizationId = requireOrgId(actor);
      const [list] = await db.select({ id: lists.id }).from(lists).where(and(
        eq(lists.id, id),
        eq(lists.organizationId, organizationId)
      )).limit(1);
      const [contact] = await db.select({ id: contacts.id }).from(contacts).where(and(
        eq(contacts.id, body.contactId),
        eq(contacts.organizationId, organizationId)
      )).limit(1);
      if (!list || !contact) return reply.code(404).send({ error: { code: "not_found", message: "List or contact not found" } });
      const [row] = await db.insert(listMemberships).values({
        organizationId,
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
      if (actor.type === "agent") assertScope(actor, "forms:read");
      const data = await db.select().from(forms).where(eq(forms.organizationId, requireOrgId(actor)));
      return { data };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/api/v1/forms", async (request, reply) => {
    try {
      const actor = requireActor(request);
      requireUserRole(actor, "member");
      const input = createFormSchema.parse(request.body);
      const [row] = await db.insert(forms).values({
        organizationId: requireOrgId(actor),
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
      const rows = await db.select().from(forms).where(and(eq(forms.slug, slug), eq(forms.published, true))).limit(2);
      if (rows.length !== 1) return reply.code(404).send({ error: { code: "not_found", message: "Form not found" } });
      return { data: rows[0] };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/api/v1/public/forms/:slug/submit", async (request, reply) => {
    try {
      const { slug } = request.params as { slug: string };
      const input = publicFormSubmitSchema.parse(request.body);
      const formsForSlug = await db.select().from(forms).where(and(eq(forms.slug, slug), eq(forms.published, true))).limit(2);
      const form = formsForSlug.length === 1 ? formsForSlug[0] : null;
      if (!form) return reply.code(404).send({ error: { code: "not_found", message: "Form not found" } });
      const email = String(input.payload.email ?? "");
      if (!email) return reply.code(400).send({ error: { code: "bad_request", message: "email is required" } });
      let contact = await findContactByEmail(db, form.organizationId, email);
      if (!contact) {
        contact = await createContact(db, {
          organizationId: form.organizationId,
          email,
          phone: typeof input.payload.phone === "string" ? input.payload.phone : null,
          firstName: typeof input.payload.firstName === "string" ? input.payload.firstName : null,
          lastName: typeof input.payload.lastName === "string" ? input.payload.lastName : null,
          properties: input.payload,
          change: { actorType: "public_form", actorId: form.id, source: "public.form" }
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
      if (actor.type === "agent") assertScope(actor, "templates:read");
      const data = await db.select().from(emailTemplates).where(eq(emailTemplates.organizationId, requireOrgId(actor)));
      return { data };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/api/v1/templates", async (request, reply) => {
    try {
      const actor = requireActor(request);
      requireUserRole(actor, "member");
      const input = createTemplateSchema.parse(request.body);
      const [row] = await db.insert(emailTemplates).values({
        organizationId: requireOrgId(actor),
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
      if (actor.type === "agent") assertScope(actor, "campaigns:read");
      return { data: await listCampaigns(db, requireOrgId(actor)) };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/api/v1/campaigns", async (request, reply) => {
    try {
      const actor = requireActor(request);
      if (actor.type === "agent") assertScope(actor, "campaigns:create");
      else requireUserRole(actor, "member");
      const input = createCampaignSchema.parse(request.body);
      const organizationId = requireOrgId(actor);
      if (input.templateId) {
        const [template] = await db.select({ id: emailTemplates.id }).from(emailTemplates).where(and(
          eq(emailTemplates.id, input.templateId),
          eq(emailTemplates.organizationId, organizationId)
        )).limit(1);
        if (!template) return reply.code(400).send({ error: { code: "bad_request", message: "Template does not belong to this organization" } });
      }
      if (input.segmentId) {
        const [segment] = await db.select({ id: segments.id }).from(segments).where(and(
          eq(segments.id, input.segmentId),
          eq(segments.organizationId, organizationId)
        )).limit(1);
        if (!segment) return reply.code(400).send({ error: { code: "bad_request", message: "Segment does not belong to this organization" } });
      }
      if (input.listId) {
        const [list] = await db.select({ id: lists.id }).from(lists).where(and(
          eq(lists.id, input.listId),
          eq(lists.organizationId, organizationId)
        )).limit(1);
        if (!list) return reply.code(400).send({ error: { code: "bad_request", message: "List does not belong to this organization" } });
      }
      const hash = contentHash([input.name, input.subject ?? "", input.htmlBody ?? ""]);
      const [row] = await db.insert(campaigns).values({
        organizationId,
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
      const organizationId = requireOrgId(actor);
      const [campaign] = await db.select().from(campaigns).where(and(eq(campaigns.id, id), eq(campaigns.organizationId, organizationId))).limit(1);
      if (!campaign) return reply.code(404).send({ error: { code: "not_found", message: "Campaign not found" } });
      const sampleContacts = await searchContacts(db, requireOrgId(actor), { limit: 3 });
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
        preview.suppressed = await isEmailSuppressed(db, requireOrgId(actor), preview.email);
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
      else requireUserRole(actor, "member");
      const { id } = request.params as { id: string };
      const organizationId = requireOrgId(actor);
      const [campaign] = await db.select().from(campaigns).where(and(eq(campaigns.id, id), eq(campaigns.organizationId, organizationId))).limit(1);
      if (!campaign) return reply.code(404).send({ error: { code: "not_found", message: "Campaign not found" } });
      let recipients = await searchContacts(db, organizationId, { limit: 100 });
      if (campaign.segmentId) {
        const [segment] = await db.select().from(segments).where(and(
          eq(segments.id, campaign.segmentId),
          eq(segments.organizationId, organizationId)
        )).limit(1);
        if (segment) {
          const filter = compileFilterAst(parseFilterAst(segment.filterAst));
          recipients = await db.select().from(contacts).where(and(eq(contacts.organizationId, organizationId), filter));
        }
      }
      const allowed = [];
      for (const contact of recipients) {
        if (!(await isEmailSuppressed(db, organizationId, contact.email))) {
          allowed.push(contact);
        }
      }
      await db.delete(campaignRecipients).where(and(
        eq(campaignRecipients.campaignId, campaign.id),
        eq(campaignRecipients.organizationId, organizationId)
      ));
      if (allowed.length) {
        await db.insert(campaignRecipients).values(allowed.map((contact) => ({
          organizationId,
          campaignId: campaign.id,
          contactId: contact.id,
          emailNormalized: normalizeEmail(contact.email),
          idempotencyKey: `${campaign.id}:${contact.id}:${campaign.contentHash ?? "na"}`
        })));
      }
      const [approval] = await db.insert(campaignApprovals).values({
        organizationId,
        campaignId: campaign.id,
        agentId: actor.type === "agent" ? actor.id : null,
        requestedBy: actor.id,
        status: "pending",
        recipientCount: allowed.length,
        contentHash: campaign.contentHash ?? contentHash([campaign.id]),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }).returning();
      await db.update(campaigns).set({ status: "review", recipientCount: allowed.length, updatedAt: new Date() }).where(and(
        eq(campaigns.id, campaign.id),
        eq(campaigns.organizationId, organizationId)
      ));
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
        eq(campaignApprovals.organizationId, requireOrgId(actor)),
        eq(campaignApprovals.status, "pending"),
        sql`${campaignApprovals.expiresAt} > NOW()`
      )).limit(1);
      if (!pending[0]) return reply.code(404).send({ error: { code: "not_found", message: "No pending approval" } });
      const [approval] = await db.update(campaignApprovals).set({
        status: "approved",
        approvedBy: actor.id,
        decidedAt: new Date()
      }).where(eq(campaignApprovals.id, pending[0].id)).returning();
      await db.update(campaigns).set({ status: "scheduled", updatedAt: new Date() }).where(and(
        eq(campaigns.id, id),
        eq(campaigns.organizationId, requireOrgId(actor))
      ));
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
      const organizationId = requireOrgId(actor);
      const approvals = await db.select().from(campaignApprovals).where(and(
        eq(campaignApprovals.campaignId, id),
        eq(campaignApprovals.organizationId, organizationId),
        eq(campaignApprovals.status, "approved"),
        sql`${campaignApprovals.expiresAt} > NOW()`
      )).limit(1);
      if (!approvals[0]) {
        return reply.code(403).send({ error: { code: "approval_required", message: "Campaign send requires approval" } });
      }
      const [campaign] = await db.select().from(campaigns).where(and(
        eq(campaigns.id, id),
        eq(campaigns.organizationId, organizationId),
        eq(campaigns.status, "scheduled")
      )).limit(1);
      if (!campaign) return reply.code(409).send({ error: { code: "conflict", message: "Campaign is not approved for sending" } });
      if (approvals[0].contentHash !== campaign.contentHash) {
        return reply.code(409).send({ error: { code: "conflict", message: "Campaign content changed after approval" } });
      }
      await db.update(campaigns).set({ status: "sending", updatedAt: new Date() }).where(and(
        eq(campaigns.id, id),
        eq(campaigns.organizationId, organizationId)
      ));
      const job = await enqueueJob(db, {
        organizationId,
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
      const data = await db.select().from(agentIdentities).where(eq(agentIdentities.organizationId, requireOrgId(actor)));
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
        organizationId: requireOrgId(actor),
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
        eq(agentIdentities.organizationId, requireOrgId(actor))
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
      { name: "list_segments", scope: "segments:read" },
      { name: "get_segment", scope: "segments:read" },
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
      requireUserRole(actor, "member");
      const input = ingestEventSchema.parse(request.body);
      const organizationId = requireOrgId(actor);
      if (input.contactId) {
        const [contact] = await db.select({ id: contacts.id }).from(contacts).where(and(
          eq(contacts.id, input.contactId),
          eq(contacts.organizationId, organizationId)
        )).limit(1);
        if (!contact) return reply.code(404).send({ error: { code: "not_found", message: "Contact not found" } });
      }
      if (input.companyId) {
        const [company] = await db.select({ id: companies.id }).from(companies).where(and(
          eq(companies.id, input.companyId),
          eq(companies.organizationId, organizationId)
        )).limit(1);
        if (!company) return reply.code(404).send({ error: { code: "not_found", message: "Company not found" } });
      }
      const [row] = await db.insert(customerEvents).values({
        organizationId,
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
        organizationId: requireOrgId(actor),
        provider: "hubspot",
        mode: "csv",
        status: "queued",
        stats: { queued: body.properties.length, kind: "properties", cursor: 0 }
      }).returning();
      await enqueueJob(db, {
        organizationId: requireOrgId(actor),
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

  app.post("/api/v1/imports/contacts/csv", async (request, reply) => {
    try {
      const actor = requireActor(request);
      requireUserRole(actor, "admin");
      const body = csvContactsImportBodySchema.parse(request.body);
      const organizationId = requireOrgId(actor);
      const createdProperties = await ensureCsvContactProperties(db, organizationId, body.headers);
      const [job] = await db.insert(importJobs).values({
        organizationId,
        provider: "csv",
        mode: "csv",
        status: "queued",
        stats: {
          queued: body.contacts.length,
          kind: "contacts",
          cursor: 0,
          total: body.contacts.length,
          chunkSize: CONTACT_IMPORT_CHUNK_SIZE,
          chunkCount: 0,
          completedChunks: 0,
          createdProperties
        }
      }).returning();
      const chunkCount = await enqueueContactImportChunks(db, {
        organizationId,
        importJobId: job.id,
        contacts: body.contacts
      });
      await db.update(importJobs).set({
        stats: {
          queued: body.contacts.length,
          kind: "contacts",
          cursor: 0,
          total: body.contacts.length,
          chunkSize: CONTACT_IMPORT_CHUNK_SIZE,
          chunkCount,
          completedChunks: 0,
          createdProperties
        }
      }).where(eq(importJobs.id, job.id));
      await audit(db, actor, "import.contacts.csv", "import_job", job.id, {
        count: body.contacts.length,
        createdProperties,
        chunkCount
      });
      reply.code(202);
      return {
        data: {
          ...job,
          stats: {
            queued: body.contacts.length,
            kind: "contacts",
            cursor: 0,
            total: body.contacts.length,
            chunkSize: CONTACT_IMPORT_CHUNK_SIZE,
            chunkCount,
            completedChunks: 0,
            createdProperties
          }
        }
      };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/api/v1/imports/companies/csv", async (request, reply) => {
    try {
      const actor = requireActor(request);
      requireUserRole(actor, "admin");
      const body = csvCompaniesImportBodySchema.parse(request.body);
      const organizationId = requireOrgId(actor);
      const createdProperties = await ensureCsvCompanyProperties(db, organizationId, body.headers);
      const [job] = await db.insert(importJobs).values({
        organizationId,
        provider: "csv",
        mode: "csv",
        status: "queued",
        stats: {
          queued: body.companies.length,
          kind: "companies",
          cursor: 0,
          total: body.companies.length,
          chunkSize: COMPANY_IMPORT_CHUNK_SIZE,
          chunkCount: 0,
          completedChunks: 0,
          createdProperties
        }
      }).returning();
      const chunkCount = await enqueueCompanyImportChunks(db, {
        organizationId,
        importJobId: job.id,
        companies: body.companies
      });
      await db.update(importJobs).set({
        stats: {
          queued: body.companies.length,
          kind: "companies",
          cursor: 0,
          total: body.companies.length,
          chunkSize: COMPANY_IMPORT_CHUNK_SIZE,
          chunkCount,
          completedChunks: 0,
          createdProperties
        }
      }).where(eq(importJobs.id, job.id));
      await audit(db, actor, "import.companies.csv", "import_job", job.id, {
        count: body.companies.length,
        createdProperties,
        chunkCount
      });
      reply.code(202);
      return {
        data: {
          ...job,
          stats: {
            queued: body.companies.length,
            kind: "companies",
            cursor: 0,
            total: body.companies.length,
            chunkSize: COMPANY_IMPORT_CHUNK_SIZE,
            chunkCount,
            completedChunks: 0,
            createdProperties
          }
        }
      };
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
        organizationId: requireOrgId(actor),
        provider: "hubspot",
        mode: "csv",
        status: "queued",
        stats: { queued: body.contacts.length, kind: "contacts", cursor: body.cursor ?? 0 }
      }).returning();
      await enqueueJob(db, {
        organizationId: requireOrgId(actor),
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

  app.get("/api/v1/imports", async (request, reply) => {
    try {
      const actor = requireActor(request);
      requireUserRole(actor, "member");
      const rows = await db.select().from(importJobs).where(
        eq(importJobs.organizationId, requireOrgId(actor))
      ).orderBy(desc(importJobs.createdAt)).limit(20);
      return { data: rows };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/api/v1/imports/:id/failures", async (request, reply) => {
    try {
      const actor = requireActor(request);
      requireUserRole(actor, "member");
      const { id } = request.params as { id: string };
      const [job] = await db.select({ id: importJobs.id }).from(importJobs).where(and(
        eq(importJobs.id, id),
        eq(importJobs.organizationId, requireOrgId(actor))
      )).limit(1);
      if (!job) return reply.code(404).send({ error: { code: "not_found", message: "Import job not found" } });
      const rows = await db.select().from(importRows).where(and(
        eq(importRows.importJobId, id),
        eq(importRows.organizationId, requireOrgId(actor)),
        eq(importRows.status, "failed")
      )).orderBy(desc(importRows.createdAt)).limit(100);
      return { data: rows };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/api/v1/imports/:id", async (request, reply) => {
    try {
      const actor = requireActor(request);
      requireUserRole(actor, "member");
      const { id } = request.params as { id: string };
      const [job] = await db.select().from(importJobs).where(and(
        eq(importJobs.id, id),
        eq(importJobs.organizationId, requireOrgId(actor))
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
      if (actor.type === "agent") assertScope(actor, "workflows:read");
      const data = await db.select().from(workflows).where(eq(workflows.organizationId, requireOrgId(actor)));
      return { data };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/api/v1/workflows", async (request, reply) => {
    try {
      const actor = requireActor(request);
      requireUserRole(actor, "member");
      const input = createWorkflowSchema.parse(request.body);
      const [row] = await db.insert(workflows).values({
        organizationId: requireOrgId(actor),
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
      requireUserRole(actor, "member");
      const { id } = request.params as { id: string };
      const body = z.object({ contactId: z.string().uuid() }).parse(request.body);
      const organizationId = requireOrgId(actor);
      const [workflow] = await db.select({ id: workflows.id }).from(workflows).where(and(
        eq(workflows.id, id),
        eq(workflows.organizationId, organizationId),
        eq(workflows.status, "active")
      )).limit(1);
      const [contact] = await db.select({ id: contacts.id }).from(contacts).where(and(
        eq(contacts.id, body.contactId),
        eq(contacts.organizationId, organizationId)
      )).limit(1);
      if (!workflow || !contact) return reply.code(404).send({ error: { code: "not_found", message: "Workflow or contact not found" } });
      const [row] = await db.insert(workflowEnrollments).values({
        organizationId,
        workflowId: id,
        contactId: body.contactId,
        status: "active"
      }).returning();
      await enqueueJob(db, {
        organizationId,
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
      if (actor.type === "agent") assertScope(actor, "reports:read");
      const [contactCount, campaignRows, segmentRows] = await Promise.all([
        countContacts(db, requireOrgId(actor)),
        listCampaigns(db, requireOrgId(actor)),
        listSegments(db, requireOrgId(actor))
      ]);
      return {
        data: {
          contacts: contactCount,
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
      requireUserRole(actor, "member");
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

  app.get("/api/v1/email/tracking-address", async (request, reply) => {
    try {
      const actor = requireActor(request);
      requireUserRole(actor, "member");
      const organizationId = requireOrgId(actor);
      let address = await getEmailTrackingAddress(db, organizationId, actor.id);
      if (!address) {
        await db.insert(emailTrackingAddresses).values({
          organizationId,
          userId: actor.id,
          token: mintEmailTrackingToken()
        }).onConflictDoNothing();
        address = await getEmailTrackingAddress(db, organizationId, actor.id);
      }
      if (!address) throw new Error("Unable to create email tracking address");
      return {
        data: {
          address: buildEmailTrackingAddress(env.EMAIL_TRACKING_DOMAIN, address.token),
          domain: env.EMAIL_TRACKING_DOMAIN
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
      const event = await storeWebhookEvent(db, {
        organizationId: null,
        provider: "resend",
        eventType: typeof payload.type === "string" ? payload.type : "unknown",
        payload,
        signatureValid: true
      });
      await enqueueJob(db, {
        organizationId: null,
        kind: "webhook.resend.process",
        payload: { webhookEventId: event.id, organizationId: null }
      });
      return { data: { accepted: true, signatureValid: true } };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/api/v1/deliverability", async (request, reply) => {
    try {
      const actor = requireActor(request);
      requireUserRole(actor, "member");
      const events = await db.select().from(emailEvents).where(eq(emailEvents.organizationId, requireOrgId(actor))).limit(100);
      const suppressions = await db.select().from(suppressionEntries).where(eq(suppressionEntries.organizationId, requireOrgId(actor))).limit(100);
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
      requireUserRole(actor, "member");
      const body = request.body as { name: string; campaignId?: string; variants?: unknown[]; conversionGoal?: string };
      if (body.campaignId) {
        const [campaign] = await db.select({ id: campaigns.id }).from(campaigns).where(and(
          eq(campaigns.id, body.campaignId),
          eq(campaigns.organizationId, requireOrgId(actor))
        )).limit(1);
        if (!campaign) return reply.code(404).send({ error: { code: "not_found", message: "Campaign not found" } });
      }
      const [row] = await db.insert(experiments).values({
        organizationId: requireOrgId(actor),
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
      if (actor.type === "agent") assertScope(actor, "reports:read");
      const data = await db.select().from(reportDefinitions).where(eq(reportDefinitions.organizationId, requireOrgId(actor)));
      return { data };
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
