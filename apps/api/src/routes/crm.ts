import type { FastifyInstance } from "fastify";
import { assertScope, hasScope } from "@twiniti/auth";
import {
  contactSearchSchema,
  createContactSchema,
  createCompanySchema,
  companySearchSchema,
  type ContactSearch,
  updateContactSchema,
  updateCompanySchema,
  upsertContactSchema
} from "@twiniti/contracts";
import {
  companies,
  countCompanies,
  countContacts,
  contactCompanyAssociations,
  contacts as contactsTable,
  createCompany,
  createContact,
  customerEvents,
  findContactByEmail,
  getContactById,
  getContactPropertyHistory,
  getContactTimeline,
  getCompanyById,
  listCompanies,
  normalizeEmail,
  searchContacts,
  suppressionEntries,
  updateContact,
  updateCompany,
  type Db
} from "@twiniti/db";
import { and as andOp, eq as eqOp, isNull } from "drizzle-orm";
import { z } from "zod";
import { audit, requireActor, requireOrgId, requireUserRole, sendError } from "../auth-hook.js";

function mapContact(row: {
  id: string;
  email: string;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  lifecycleStage: string | null;
  properties: unknown;
  version: number;
}) {
  return {
    id: row.id,
    email: row.email,
    phone: row.phone,
    firstName: row.firstName,
    lastName: row.lastName,
    lifecycleStage: row.lifecycleStage,
    properties: (row.properties ?? {}) as Record<string, unknown>,
    version: row.version
  };
}

function mapCompany(row: {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  properties: unknown;
  version: number;
}) {
  return {
    id: row.id,
    name: row.name,
    domain: row.domain,
    industry: row.industry,
    properties: (row.properties ?? {}) as Record<string, unknown>,
    version: row.version
  };
}

export async function registerCrmRoutes(app: FastifyInstance, db: Db) {
  function normalizeContactQuery(query: ContactSearch) {
    return {
      query: query.query,
      limit: query.limit,
      page: query.page
    };
  }

  app.get("/api/v1/contacts", async (request, reply) => {
    try {
      const actor = requireActor(request);
      if (actor.type === "agent") assertScope(actor, "contacts:read");
      else requireUserRole(actor, "member");
      const query = contactSearchSchema.parse(request.query);
      const options = normalizeContactQuery(query);
      const [data, total] = await Promise.all([
        searchContacts(db, requireOrgId(actor), options),
        countContacts(db, requireOrgId(actor), { query: query.query })
      ]);
      return {
        data: data.map(mapContact),
        meta: {
          limit: query.limit,
          page: query.page,
          total,
          pageCount: Math.max(1, Math.ceil(total / query.limit)),
          cursor: query.cursor ?? null
        }
      };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/api/v1/contacts/:id", async (request, reply) => {
    try {
      const actor = requireActor(request);
      if (actor.type === "agent") assertScope(actor, "contacts:read");
      const { id } = request.params as { id: string };
      const row = await getContactById(db, requireOrgId(actor), id);
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
      const data = await getContactTimeline(db, requireOrgId(actor), id);
      return { data };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/api/v1/contacts/:id/history", async (request, reply) => {
    try {
      const actor = requireActor(request);
      if (actor.type === "agent") assertScope(actor, "contacts:read");
      const { id } = request.params as { id: string };
      const data = await getContactPropertyHistory(db, requireOrgId(actor), id);
      return { data };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/api/v1/contacts", async (request, reply) => {
    try {
      const actor = requireActor(request);
      if (actor.type === "agent") assertScope(actor, "contacts:create");
      else requireUserRole(actor, "member");
      const input = createContactSchema.parse(request.body);
      const dryRun = (request.headers["x-dry-run"] === "true");
      const existing = await findContactByEmail(db, requireOrgId(actor), input.email);
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
      const row = await createContact(db, {
        organizationId: requireOrgId(actor),
        ...input,
        change: { actorType: actor.type, actorId: actor.id, source: "api.contact.create" }
      });
      await db.insert(customerEvents).values({
        organizationId: requireOrgId(actor),
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
      } else requireUserRole(actor, "member");
      const input = upsertContactSchema.parse(request.body);
      const existing = await findContactByEmail(db, requireOrgId(actor), input.email);
      if (existing) {
        const result = await updateContact(db, requireOrgId(actor), existing.id, {
          ...input,
          change: { actorType: actor.type, actorId: actor.id, source: "api.contact.upsert" }
        });
        if (!result || result.conflict) {
          return reply.code(409).send({ error: { code: "version_conflict", message: "Contact version conflict" } });
        }
        await audit(db, actor, "contact.upsert_update", "contact", result.row.id);
        return { data: mapContact(result.row), meta: { upserted: "update" } };
      }
      const row = await createContact(db, {
        organizationId: requireOrgId(actor),
        ...input,
        change: { actorType: actor.type, actorId: actor.id, source: "api.contact.upsert" }
      });
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
      else requireUserRole(actor, "member");
      const { id } = request.params as { id: string };
      const input = updateContactSchema.parse(request.body);
      const result = await updateContact(db, requireOrgId(actor), id, {
        ...input,
        change: { actorType: actor.type, actorId: actor.id, source: "api.contact.update" }
      });
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
      const [data, total] = await Promise.all([
        listCompanies(db, requireOrgId(actor), {
          query: query.query,
          limit: query.limit,
          page: query.page
        }),
        countCompanies(db, requireOrgId(actor), { query: query.query })
      ]);
      return {
        data,
        meta: {
          limit: query.limit,
          page: query.page,
          total,
          pageCount: Math.max(1, Math.ceil(total / query.limit)),
          cursor: query.cursor ?? null
        }
      };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/api/v1/companies/:id", async (request, reply) => {
    try {
      const actor = requireActor(request);
      if (actor.type === "agent") assertScope(actor, "companies:read");
      const { id } = request.params as { id: string };
      const organizationId = requireOrgId(actor);
      const company = await getCompanyById(db, organizationId, id);
      if (!company) return reply.code(404).send({ error: { code: "not_found", message: "Company not found" } });

      const associated = await db.select({
        contact: contactsTable
      }).from(contactCompanyAssociations)
        .innerJoin(contactsTable, eqOp(contactsTable.id, contactCompanyAssociations.contactId))
        .where(andOp(
          eqOp(contactCompanyAssociations.companyId, id),
          eqOp(contactCompanyAssociations.organizationId, organizationId),
          eqOp(contactsTable.organizationId, organizationId),
          isNull(contactsTable.archivedAt)
        ));

      return {
        data: {
          ...mapCompany(company),
          contacts: associated.map((row) => mapContact(row.contact))
        }
      };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/api/v1/companies", async (request, reply) => {
    try {
      const actor = requireActor(request);
      if (actor.type === "agent") assertScope(actor, "companies:create");
      else requireUserRole(actor, "member");
      const input = createCompanySchema.parse(request.body);
      const row = await createCompany(db, {
        organizationId: requireOrgId(actor),
        name: input.name,
        domain: input.domain ?? null,
        industry: input.industry ?? null,
        properties: input.properties ?? {}
      });
      await audit(db, actor, "company.create", "company", row.id, { source: `${actor.type}.company.create` });
      reply.code(201);
      return { data: row };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.patch("/api/v1/companies/:id", async (request, reply) => {
    try {
      const actor = requireActor(request);
      if (actor.type === "agent") assertScope(actor, "companies:update");
      else requireUserRole(actor, "member");
      const { id } = request.params as { id: string };
      const input = updateCompanySchema.parse(request.body);
      const result = await updateCompany(db, requireOrgId(actor), id, input);
      if (!result) return reply.code(404).send({ error: { code: "not_found", message: "Company not found" } });
      if (result.conflict) {
        return reply.code(409).send({ error: { code: "version_conflict", message: "Company version conflict", details: { current: result.current } } });
      }
      await audit(db, actor, "company.update", "company", result.row.id, { source: `${actor.type}.company.update` });
      return { data: result.row };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/api/v1/contacts/:id/associate-company", async (request, reply) => {
    try {
      const actor = requireActor(request);
      requireUserRole(actor, "member");
      const { id } = request.params as { id: string };
      const body = z.object({ companyId: z.string().uuid(), label: z.string().trim().max(80).optional() }).parse(request.body);
      const organizationId = requireOrgId(actor);
      const [contact] = await db.select({ id: contactsTable.id }).from(contactsTable).where(andOp(
        eqOp(contactsTable.id, id),
        eqOp(contactsTable.organizationId, organizationId)
      )).limit(1);
      const [company] = await db.select({ id: companies.id }).from(companies).where(andOp(
        eqOp(companies.id, body.companyId),
        eqOp(companies.organizationId, organizationId)
      )).limit(1);
      if (!contact || !company) return reply.code(404).send({ error: { code: "not_found", message: "Contact or company not found" } });
      const [row] = await db.insert(contactCompanyAssociations).values({
        organizationId,
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
      const all = await searchContacts(db, requireOrgId(actor), { limit: 100, includeArchived: true });
      const primary = all.find((row) => row.id === body.primaryId);
      const secondary = all.find((row) => row.id === body.secondaryId);
      if (!primary || !secondary) {
        return reply.code(404).send({ error: { code: "not_found", message: "Contact not found" } });
      }
      const mergedProperties = {
        ...(secondary.properties as Record<string, unknown>),
        ...(primary.properties as Record<string, unknown>)
      };
      const result = await updateContact(db, requireOrgId(actor), primary.id, {
        phone: primary.phone ?? secondary.phone,
        firstName: primary.firstName ?? secondary.firstName,
        lastName: primary.lastName ?? secondary.lastName,
        lifecycleStage: primary.lifecycleStage ?? secondary.lifecycleStage,
        properties: mergedProperties
      });
      if (!result || result.conflict) {
        return reply.code(409).send({ error: { code: "version_conflict", message: "Merge conflict" } });
      }
      await db.update(contactsTable).set({ archivedAt: new Date() }).where(eqOp(contactsTable.id, secondary.id));
      await db.update(contactsTable).set({ mergedIntoContactId: primary.id }).where(eqOp(contactsTable.id, secondary.id));
      await db.insert(customerEvents).values({
        organizationId: requireOrgId(actor),
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
      requireUserRole(actor, "member");
      const rows = await searchContacts(db, requireOrgId(actor), { limit: 100 });
      const csv = ["email,phone,firstName,lastName,lifecycleStage", ...rows.map((row) =>
        [row.email, row.phone ?? "", row.firstName ?? "", row.lastName ?? "", row.lifecycleStage ?? ""].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")
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
      requireUserRole(actor, "member");
      const body = request.body as { email: string; reason?: string };
      const [row] = await db.insert(suppressionEntries).values({
        organizationId: requireOrgId(actor),
        emailNormalized: normalizeEmail(body.email),
        reason: body.reason ?? "manual",
        source: actor.type
      }).returning();
      await db.insert(customerEvents).values({
        organizationId: requireOrgId(actor),
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
