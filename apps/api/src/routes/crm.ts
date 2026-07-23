import type { FastifyInstance } from "fastify";
import { assertScope, hasScope } from "@twiniti/auth";
import {
  contactSearchSchema,
  createContactSchema,
  createCompanySchema,
  companySearchSchema,
  updateContactSchema,
  upsertContactSchema
} from "@twiniti/contracts";
import {
  companies,
  contactCompanyAssociations,
  contacts as contactsTable,
  createContact,
  customerEvents,
  findContactByEmail,
  getContactById,
  getContactTimeline,
  listCompanies,
  normalizeDomain,
  normalizeEmail,
  searchContacts,
  suppressionEntries,
  updateContact,
  type Db
} from "@twiniti/db";
import { eq as eqOp } from "drizzle-orm";
import { audit, requireActor, requireUserRole, sendError } from "../auth-hook.js";

function mapContact(row: {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  lifecycleStage: string | null;
  properties: unknown;
  version: number;
}) {
  return {
    id: row.id,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    lifecycleStage: row.lifecycleStage,
    properties: (row.properties ?? {}) as Record<string, unknown>,
    version: row.version
  };
}

export async function registerCrmRoutes(app: FastifyInstance, db: Db) {
  app.get("/api/v1/me", async (request) => {
    const actor = requireActor(request);
    return { data: actor };
  });

  app.get("/api/v1/contacts", async (request, reply) => {
    try {
      const actor = requireActor(request);
      if (actor.type === "agent") assertScope(actor, "contacts:read");
      else requireUserRole(actor, "viewer");
      const query = contactSearchSchema.parse(request.query);
      const data = await searchContacts(db, actor.organizationId, query);
      return { data: data.map(mapContact), meta: { limit: query.limit, cursor: query.cursor ?? null } };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/api/v1/contacts/:id", async (request, reply) => {
    try {
      const actor = requireActor(request);
      if (actor.type === "agent") assertScope(actor, "contacts:read");
      const { id } = request.params as { id: string };
      const row = await getContactById(db, actor.organizationId, id);
      if (!row) return reply.code(404).send({ error: { code: "not_found", message: "Contact not found" } });
      return { data: mapContact(row) };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/api/v1/contacts/:id/timeline", async (request, reply) => {
    try {
      const actor = requireActor(request);
      if (actor.type === "agent") assertScope(actor, "contacts:read");
      const { id } = request.params as { id: string };
      const data = await getContactTimeline(db, actor.organizationId, id);
      return { data };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/api/v1/contacts", async (request, reply) => {
    try {
      const actor = requireActor(request);
      if (actor.type === "agent") assertScope(actor, "contacts:create");
      else requireUserRole(actor, "marketer");
      const input = createContactSchema.parse(request.body);
      const dryRun = (request.headers["x-dry-run"] === "true");
      const existing = await findContactByEmail(db, actor.organizationId, input.email);
      if (existing) {
        return reply.code(409).send({
          status: "conflict",
          reason: "duplicate_email",
          existing_contact_id: existing.id,
          next_actions: ["update_existing", "create_anyway"]
        });
      }
      if (dryRun) {
        return { data: { ...input, id: "dry-run" }, meta: { dryRun: true } };
      }
      const row = await createContact(db, { organizationId: actor.organizationId, ...input });
      await db.insert(customerEvents).values({
        organizationId: actor.organizationId,
        contactId: row.id,
        eventType: "contact.created",
        source: actor.type,
        occurredAt: new Date(),
        payload: { email: row.email }
      });
      await audit(db, actor, "contact.create", "contact", row.id, { email: row.email });
      reply.code(201);
      return { data: mapContact(row) };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.put("/api/v1/contacts/upsert", async (request, reply) => {
    try {
      const actor = requireActor(request);
      if (actor.type === "agent") {
        if (!hasScope(actor, "contacts:create") && !hasScope(actor, "contacts:update")) {
          assertScope(actor, "contacts:update");
        }
      } else requireUserRole(actor, "marketer");
      const input = upsertContactSchema.parse(request.body);
      const existing = await findContactByEmail(db, actor.organizationId, input.email);
      if (existing) {
        const result = await updateContact(db, actor.organizationId, existing.id, input);
        if (!result || result.conflict) {
          return reply.code(409).send({ error: { code: "version_conflict", message: "Contact version conflict" } });
        }
        await audit(db, actor, "contact.upsert_update", "contact", result.row.id);
        return { data: mapContact(result.row), meta: { upserted: "update" } };
      }
      const row = await createContact(db, { organizationId: actor.organizationId, ...input });
      await audit(db, actor, "contact.upsert_create", "contact", row.id);
      reply.code(201);
      return { data: mapContact(row), meta: { upserted: "create" } };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.patch("/api/v1/contacts/:id", async (request, reply) => {
    try {
      const actor = requireActor(request);
      if (actor.type === "agent") assertScope(actor, "contacts:update");
      else requireUserRole(actor, "marketer");
      const { id } = request.params as { id: string };
      const input = updateContactSchema.parse(request.body);
      const result = await updateContact(db, actor.organizationId, id, input);
      if (!result) return reply.code(404).send({ error: { code: "not_found", message: "Contact not found" } });
      if (result.conflict) {
        return reply.code(409).send({ error: { code: "version_conflict", message: "Contact version conflict", details: { current: result.current } } });
      }
      await audit(db, actor, "contact.update", "contact", result.row.id);
      return { data: mapContact(result.row) };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/api/v1/companies", async (request, reply) => {
    try {
      const actor = requireActor(request);
      if (actor.type === "agent") assertScope(actor, "companies:read");
      const query = companySearchSchema.parse(request.query);
      const data = await listCompanies(db, actor.organizationId, query.query);
      return { data, meta: { limit: query.limit } };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/api/v1/companies", async (request, reply) => {
    try {
      const actor = requireActor(request);
      requireUserRole(actor, "marketer");
      const input = createCompanySchema.parse(request.body);
      const [row] = await db.insert(companies).values({
        organizationId: actor.organizationId,
        name: input.name,
        domain: input.domain ?? null,
        domainNormalized: normalizeDomain(input.domain),
        industry: input.industry ?? null,
        properties: input.properties ?? {}
      }).returning();
      await audit(db, actor, "company.create", "company", row.id);
      reply.code(201);
      return { data: row };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/api/v1/contacts/:id/associate-company", async (request, reply) => {
    try {
      const actor = requireActor(request);
      requireUserRole(actor, "marketer");
      const { id } = request.params as { id: string };
      const body = request.body as { companyId: string; label?: string };
      const [row] = await db.insert(contactCompanyAssociations).values({
        organizationId: actor.organizationId,
        contactId: id,
        companyId: body.companyId,
        label: body.label ?? "primary"
      }).returning();
      await audit(db, actor, "contact.associate_company", "contact", id, { companyId: body.companyId });
      reply.code(201);
      return { data: row };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/api/v1/contacts/merge", async (request, reply) => {
    try {
      const actor = requireActor(request);
      requireUserRole(actor, "admin");
      const body = request.body as { primaryId: string; secondaryId: string };
      const all = await searchContacts(db, actor.organizationId, { limit: 100, includeArchived: true });
      const primary = all.find((row) => row.id === body.primaryId);
      const secondary = all.find((row) => row.id === body.secondaryId);
      if (!primary || !secondary) {
        return reply.code(404).send({ error: { code: "not_found", message: "Contact not found" } });
      }
      const mergedProperties = {
        ...(secondary.properties as Record<string, unknown>),
        ...(primary.properties as Record<string, unknown>)
      };
      const result = await updateContact(db, actor.organizationId, primary.id, {
        firstName: primary.firstName ?? secondary.firstName,
        lastName: primary.lastName ?? secondary.lastName,
        lifecycleStage: primary.lifecycleStage ?? secondary.lifecycleStage,
        properties: mergedProperties
      });
      if (!result || result.conflict) {
        return reply.code(409).send({ error: { code: "version_conflict", message: "Merge conflict" } });
      }
      await db.update(contactsTable).set({ archivedAt: new Date() }).where(eqOp(contactsTable.id, secondary.id));
      await db.insert(customerEvents).values({
        organizationId: actor.organizationId,
        contactId: primary.id,
        eventType: "contact.merged",
        source: actor.type,
        occurredAt: new Date(),
        payload: { secondaryId: secondary.id }
      });
      await audit(db, actor, "contact.merge", "contact", primary.id, { secondaryId: secondary.id });
      return { data: mapContact(result.row), meta: { mergedFrom: secondary.id } };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/api/v1/contacts/export.csv", async (request, reply) => {
    try {
      const actor = requireActor(request);
      requireUserRole(actor, "analyst");
      const rows = await searchContacts(db, actor.organizationId, { limit: 100 });
      const csv = ["email,firstName,lastName,lifecycleStage", ...rows.map((row) =>
        [row.email, row.firstName ?? "", row.lastName ?? "", row.lifecycleStage ?? ""].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")
      )].join("\n");
      reply.header("content-type", "text/csv; charset=utf-8");
      return csv;
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/api/v1/suppressions", async (request, reply) => {
    try {
      const actor = requireActor(request);
      requireUserRole(actor, "marketer");
      const body = request.body as { email: string; reason?: string };
      const [row] = await db.insert(suppressionEntries).values({
        organizationId: actor.organizationId,
        emailNormalized: normalizeEmail(body.email),
        reason: body.reason ?? "manual",
        source: actor.type
      }).returning();
      await db.insert(customerEvents).values({
        organizationId: actor.organizationId,
        eventType: "consent.suppressed",
        source: actor.type,
        occurredAt: new Date(),
        payload: { email: body.email, reason: body.reason ?? "manual" }
      });
      await audit(db, actor, "suppression.create", "suppression", row.id);
      reply.code(201);
      return { data: row };
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
