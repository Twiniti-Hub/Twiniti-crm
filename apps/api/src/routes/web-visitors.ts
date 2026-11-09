import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  reviewWebVisitorResolutionSchema,
  updateWebVisitorIntegrationSchema,
  validateWebVisitorInstallationSchema,
  webVisitorIncomingPayloadSchema,
  webVisitorSettingsSchema
} from "@twiniti/contracts";
import {
  buildWebVisitorEventDedupeKey,
  buildWebVisitorLoaderSnippet,
  enqueueJob,
  hashCredential,
  normalizeWebVisitorSupplierPayload,
  reviewWebVisitorResolution,
  storeWebhookEvent,
  webVisitorIdentityMappings,
  webVisitorIntegrations,
  withServiceRls,
  writeAudit,
  type Db
} from "@twiniti/db";
import { requireActor, requireOrgId, requireUserRole, sendError } from "../auth-hook.js";
import { validateWebVisitorInstallation } from "../web-visitor-installation.js";
import { createWebVisitorLimiter } from "../web-visitor-security.js";

function mintWebhookToken() {
  const token = `wv_${randomBytes(32).toString("base64url")}`;
  return { token, hash: hashCredential(token) };
}

const allowWebhookRequest = createWebVisitorLimiter();

function publicIntegration(row: typeof webVisitorIntegrations.$inferSelect | undefined) {
  const settings = webVisitorSettingsSchema.parse(row?.settings ?? {});
  const publicKey = typeof (row?.settings as Record<string, unknown> | null)?.publicKey === "string"
    ? String((row?.settings as Record<string, unknown>).publicKey)
    : null;
  return {
    configured: Boolean(row),
    enabled: row?.enabled ?? false,
    settings,
    publicKey,
    loaderSnippet: publicKey ? buildWebVisitorLoaderSnippet({ publicKey }) : null,
    lastWebhookAt: row?.lastWebhookAt ?? null,
    createdAt: row?.createdAt ?? null,
    updatedAt: row?.updatedAt ?? null
  };
}

export async function registerWebVisitorRoutes(app: FastifyInstance, db: Db) {
  app.get("/api/v1/organization/integrations/web-visitors", async (request, reply) => {
    try {
      const actor = requireActor(request);
      requireUserRole(actor, "admin");
      const organizationId = requireOrgId(actor);
      const [row] = await db.select().from(webVisitorIntegrations).where(eq(webVisitorIntegrations.organizationId, organizationId)).limit(1);
      return { data: publicIntegration(row) };
    } catch (error) { return sendError(reply, error); }
  });

  app.put("/api/v1/organization/integrations/web-visitors", async (request, reply) => {
    try {
      const actor = requireActor(request);
      requireUserRole(actor, "admin");
      const organizationId = requireOrgId(actor);
      const input = updateWebVisitorIntegrationSchema.parse(request.body);
      const [existing] = await db.select().from(webVisitorIntegrations).where(eq(webVisitorIntegrations.organizationId, organizationId)).limit(1);
      const nextSettings = {
        ...webVisitorSettingsSchema.parse(existing?.settings ?? {}),
        ...(input.settings ?? {}),
        ...(input.publicKey ? { publicKey: input.publicKey } : {})
      };
      let token: string | null = null;
      let row: typeof webVisitorIntegrations.$inferSelect;
      if (existing) {
        [row] = await db.update(webVisitorIntegrations).set({ enabled: input.enabled, settings: nextSettings, updatedAt: new Date() }).where(eq(webVisitorIntegrations.id, existing.id)).returning();
      } else {
        const minted = mintWebhookToken();
        token = minted.token;
        [row] = await db.insert(webVisitorIntegrations).values({ organizationId, enabled: input.enabled, settings: nextSettings, webhookTokenHash: minted.hash }).returning();
      }
      await writeAudit(db, { organizationId, actorType: "user", actorId: actor.id, action: existing ? "web_visitors.updated" : "web_visitors.created", entityType: "web_visitor_integration", entityId: row.id, metadata: { enabled: row.enabled } });
      return { data: { ...publicIntegration(row), webhookToken: token } };
    } catch (error) { return sendError(reply, error); }
  });

  app.post("/api/v1/organization/integrations/web-visitors/rotate-webhook-token", async (request, reply) => {
    try {
      const actor = requireActor(request);
      requireUserRole(actor, "admin");
      const organizationId = requireOrgId(actor);
      const minted = mintWebhookToken();
      const [row] = await db.update(webVisitorIntegrations).set({ webhookTokenHash: minted.hash, updatedAt: new Date() }).where(eq(webVisitorIntegrations.organizationId, organizationId)).returning();
      if (!row) return reply.code(404).send({ error: { code: "not_found", message: "WV App is not configured" } });
      await writeAudit(db, { organizationId, actorType: "user", actorId: actor.id, action: "web_visitors.webhook_token_rotated", entityType: "web_visitor_integration", entityId: row.id });
      return { data: { webhookToken: minted.token } };
    } catch (error) { return sendError(reply, error); }
  });

  app.post("/api/v1/organization/integrations/web-visitors/validate-installation", async (request, reply) => {
    try {
      const actor = requireActor(request);
      requireUserRole(actor, "admin");
      const organizationId = requireOrgId(actor);
      const input = validateWebVisitorInstallationSchema.parse(request.body);
      const [integration] = await db.select().from(webVisitorIntegrations).where(eq(webVisitorIntegrations.organizationId, organizationId)).limit(1);
      const publicKey = typeof (integration?.settings as Record<string, unknown> | null)?.publicKey === "string"
        ? String((integration!.settings as Record<string, unknown>).publicKey) : null;
      if (!integration || !publicKey) return reply.code(409).send({ error: { code: "not_configured", message: "Save the WV App public key before validating installation." } });
      const result = await validateWebVisitorInstallation({ websiteUrl: input.url, publicKey });
      await writeAudit(db, { organizationId, actorType: "user", actorId: actor.id, action: "web_visitors.installation_validated", entityType: "web_visitor_integration", entityId: integration.id, metadata: { hostname: result.hostname, status: result.status } });
      return { data: result };
    } catch (error) { return sendError(reply, error); }
  });

  app.delete("/api/v1/organization/integrations/web-visitors", async (request, reply) => {
    try {
      const actor = requireActor(request);
      requireUserRole(actor, "admin");
      const organizationId = requireOrgId(actor);
      const [row] = await db.update(webVisitorIntegrations).set({ enabled: false, webhookTokenHash: hashCredential(randomBytes(32).toString("hex")), updatedAt: new Date() }).where(eq(webVisitorIntegrations.organizationId, organizationId)).returning();
      if (row) await writeAudit(db, { organizationId, actorType: "user", actorId: actor.id, action: "web_visitors.disabled", entityType: "web_visitor_integration", entityId: row.id });
      return reply.code(204).send();
    } catch (error) { return sendError(reply, error); }
  });

  app.get("/api/v1/organization/integrations/web-visitors/resolutions", async (request, reply) => {
    try {
      const actor = requireActor(request);
      requireUserRole(actor, "admin");
      const organizationId = requireOrgId(actor);
      const rows = await db.select().from(webVisitorIdentityMappings).where(and(eq(webVisitorIdentityMappings.organizationId, organizationId), eq(webVisitorIdentityMappings.resolutionState, "ambiguous"))).orderBy(desc(webVisitorIdentityMappings.updatedAt)).limit(100);
      return { data: rows };
    } catch (error) { return sendError(reply, error); }
  });

  app.post("/api/v1/organization/integrations/web-visitors/resolutions/:id/review", async (request, reply) => {
    try {
      const actor = requireActor(request);
      requireUserRole(actor, "admin");
      const organizationId = requireOrgId(actor);
      const { id } = request.params as { id: string };
      const input = reviewWebVisitorResolutionSchema.parse(request.body);
      if (input.action === "attach" && !input.contactId) return reply.code(422).send({ error: { code: "contact_required", message: "contactId is required to attach" } });
      const reviewInput = { organizationId, mappingId: id, action: input.action, contactId: input.contactId, reviewedBy: actor.id };
      let row;
      if (request.tenantConnection) {
        await db.execute(sql`SAVEPOINT web_visitor_review`);
        try {
          row = await reviewWebVisitorResolution(db, reviewInput);
          await db.execute(sql`RELEASE SAVEPOINT web_visitor_review`);
        } catch (error) {
          await db.execute(sql`ROLLBACK TO SAVEPOINT web_visitor_review`);
          throw error;
        }
      } else {
        row = await db.transaction((tx) => reviewWebVisitorResolution(tx as unknown as Db, reviewInput));
      }
      if (!row) return reply.code(404).send({ error: { code: "not_found", message: "Resolution not found" } });
      await writeAudit(db, { organizationId, actorType: "user", actorId: actor.id, action: `web_visitors.resolution_${input.action}`, entityType: "web_visitor_identity_mapping", entityId: row.id, metadata: { contactId: input.contactId ?? null, reason: input.reason } });
      return { data: row };
    } catch (error) { return sendError(reply, error); }
  });

  app.post("/api/v1/webhooks/web-visitors/:token", async (request, reply) => {
    try {
      const { token } = request.params as { token: string };
      if (!token || token.length > 200) return reply.code(404).send({ error: { code: "not_found", message: "Not found" } });
      const tokenHash = hashCredential(token);
      if (!allowWebhookRequest(request.ip)) return reply.code(429).send({ error: { code: "rate_limited", message: "Too many requests" } });
      return withServiceRls(db, null, async (tx) => {
        const [integration] = await tx.select().from(webVisitorIntegrations).where(and(eq(webVisitorIntegrations.webhookTokenHash, tokenHash), eq(webVisitorIntegrations.enabled, true))).limit(1);
        if (!integration) return reply.code(404).send({ error: { code: "not_found", message: "Not found" } });
        const body = request.body as Record<string, unknown>;
        const profile = Object.hasOwn(body, "Captured URL")
          ? normalizeWebVisitorSupplierPayload(body)
          : webVisitorIncomingPayloadSchema.parse(body);
        const dedupeKey = buildWebVisitorEventDedupeKey({ integrationId: integration.id, profile });
        const event = await storeWebhookEvent(tx, { organizationId: integration.organizationId, provider: "web_visitors", eventType: "profile.received", payload: profile, signatureValid: true, dedupeKey });
        const job = await enqueueJob(tx, { organizationId: integration.organizationId, kind: "webhook.web_visitors.process", payload: { webhookEventId: event.id, organizationId: integration.organizationId, integrationId: integration.id }, dedupeKey: `web-visitors-job:${dedupeKey}` });
        await tx.update(webVisitorIntegrations).set({ lastWebhookAt: new Date(), updatedAt: new Date() }).where(eq(webVisitorIntegrations.id, integration.id));
        return reply.code(202).send({ data: { accepted: true, eventId: event.id, jobId: job.id } });
      });
    } catch (error) { return sendError(reply, error); }
  });
}
