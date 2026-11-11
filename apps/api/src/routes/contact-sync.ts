import { createHash, randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { and, eq, isNull } from "drizzle-orm";
import {
  contactSyncConnections,
  contactSyncOauthTransactions,
  contactSyncCursors,
  contactSyncRuns,
  contactSyncSources,
  createContact,
  createContactSyncRun,
  discoverIcloudAddressBooks,
  enqueueJob,
  getContactById,
  getContactSyncConnection,
  listContactSyncConnections,
  type Db,
  updateContact
} from "@twiniti/db";
import type { AppEnv } from "@twiniti/config";
import {
  createIcloudConnectionSchema,
  disconnectContactSyncSchema,
  updateContactSyncScopeSchema
} from "@twiniti/contracts";
import { encryptResendSecret, decryptResendSecret } from "@twiniti/email";
import { audit, requireActor, requireOrgId, requireUserRole, sendError } from "../auth-hook.js";
import { assertPersonalWorkspaceOwner } from "@twiniti/db";

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
function base64Url(value: Buffer) {
  return value.toString("base64url");
}

function safeConnection(row: typeof contactSyncConnections.$inferSelect) {
  return {
    id: row.id,
    provider: row.provider,
    accountLabel: row.accountLabel,
    status: row.status,
    selectedScope: row.selectedScope,
    generation: row.generation,
    previewRevision: row.previewRevision,
    lastSuccessAt: row.lastSuccessAt?.toISOString() ?? null,
    nextRunAt: row.nextRunAt?.toISOString() ?? null,
    lastErrorCode: row.lastErrorCode,
    lastErrorMessage: row.lastErrorMessage
  };
}

async function queueRun(db: Db, connection: typeof contactSyncConnections.$inferSelect, trigger: string) {
  const run = await createContactSyncRun(db, {
    organizationId: connection.organizationId,
    connectionId: connection.id,
    generation: connection.generation,
    trigger
  });
  await enqueueJob(db, {
    organizationId: connection.organizationId,
    kind: "contacts.sync",
    payload: { connectionId: connection.id, runId: run.id, generation: connection.generation },
    dedupeKey: `contacts.sync:${connection.id}:${run.id}`
  });
  return run;
}

async function exchangeGoogleCode(env: AppEnv, input: { code: string; redirectUri: string; verifier: string }) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: input.code,
      client_id: env.GOOGLE_CONTACTS_CLIENT_ID,
      client_secret: env.GOOGLE_CONTACTS_CLIENT_SECRET,
      redirect_uri: input.redirectUri,
      code_verifier: input.verifier,
      grant_type: "authorization_code"
    }),
    redirect: "error",
    signal: AbortSignal.timeout(30_000)
  });
  if (!response.ok) throw new Error("Google authorization could not be completed");
  return response.json() as Promise<{ access_token: string; refresh_token?: string }>;
}

async function googleAccount(accessToken: string) {
  const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { authorization: `Bearer ${accessToken}` },
    redirect: "error",
    signal: AbortSignal.timeout(30_000)
  });
  if (!response.ok) throw new Error("Google account could not be identified");
  return response.json() as Promise<{ sub: string; email?: string }>;
}

export async function registerContactSyncRoutes(app: FastifyInstance, db: Db, env: AppEnv) {
  const encryptionKey = env.CONTACT_SYNC_ENCRYPTION_KEY;

  async function personalOwner(request: Parameters<typeof requireActor>[0]) {
    const actor = requireActor(request);
    requireUserRole(actor, "admin");
    const organizationId = requireOrgId(actor);
    await assertPersonalWorkspaceOwner(db, organizationId, actor.id);
    if (!env.CONTACT_SYNC_ENABLED) {
      const error = new Error("Contact sync is not enabled");
      (error as Error & { statusCode?: number }).statusCode = 503;
      throw error;
    }
    if (!encryptionKey) throw new Error("Contact sync credential encryption is not configured");
    return { actor, organizationId };
  }

  app.get("/api/v1/personal/contact-connections", async (request, reply) => {
    try {
      const { actor, organizationId } = await personalOwner(request);
      const rows = await listContactSyncConnections(db, organizationId, actor.id);
      return { data: rows.map(safeConnection) };
    } catch (error) { return sendError(reply, error); }
  });

  app.post("/api/v1/personal/contact-connections/google/authorize", async (request, reply) => {
    try {
      const { actor, organizationId } = await personalOwner(request);
      if (!env.GOOGLE_CONTACTS_CLIENT_ID || !env.GOOGLE_CONTACTS_CLIENT_SECRET || !env.GOOGLE_CONTACTS_REDIRECT_URI) {
        throw new Error("Google Contacts is not configured");
      }
      const state = base64Url(randomBytes(32));
      const verifier = base64Url(randomBytes(48));
      const challenge = base64Url(createHash("sha256").update(verifier).digest());
      await db.insert(contactSyncOauthTransactions).values({
        organizationId,
        ownerUserId: actor.id,
        provider: "google",
        stateHash: hash(state),
        codeVerifierCiphertext: encryptResendSecret(verifier, encryptionKey),
        redirectUri: env.GOOGLE_CONTACTS_REDIRECT_URI,
        expiresAt: new Date(Date.now() + 10 * 60_000)
      });
      const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      url.searchParams.set("client_id", env.GOOGLE_CONTACTS_CLIENT_ID);
      url.searchParams.set("redirect_uri", env.GOOGLE_CONTACTS_REDIRECT_URI);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("access_type", "offline");
      url.searchParams.set("prompt", "consent");
      url.searchParams.set("scope", "openid email https://www.googleapis.com/auth/contacts.readonly");
      url.searchParams.set("state", state);
      url.searchParams.set("code_challenge", challenge);
      url.searchParams.set("code_challenge_method", "S256");
      return { data: { authorizationUrl: url.toString() } };
    } catch (error) { return sendError(reply, error); }
  });

  app.get("/api/v1/personal/contact-connections/google/callback", async (request, reply) => {
    try {
      const { actor, organizationId } = await personalOwner(request);
      const query = request.query as { state?: string; code?: string; error?: string };
      if (query.error || !query.state || !query.code) throw new Error("Google authorization was cancelled or invalid");
      const [transaction] = await db.select().from(contactSyncOauthTransactions).where(and(
        eq(contactSyncOauthTransactions.organizationId, organizationId),
        eq(contactSyncOauthTransactions.ownerUserId, actor.id),
        eq(contactSyncOauthTransactions.stateHash, hash(query.state)),
        isNull(contactSyncOauthTransactions.consumedAt)
      )).limit(1);
      if (!transaction || transaction.expiresAt.getTime() <= Date.now()) throw new Error("Google authorization expired");
      await db.update(contactSyncOauthTransactions).set({ consumedAt: new Date() })
        .where(eq(contactSyncOauthTransactions.id, transaction.id));
      const verifier = decryptResendSecret(transaction.codeVerifierCiphertext, encryptionKey);
      const token = await exchangeGoogleCode(env, { code: query.code, redirectUri: transaction.redirectUri, verifier });
      if (!token.refresh_token) throw new Error("Google did not return durable contact access; reconnect and grant consent");
      const account = await googleAccount(token.access_token);
      const [connection] = await db.insert(contactSyncConnections).values({
        organizationId,
        ownerUserId: actor.id,
        provider: "google",
        providerAccountId: account.sub,
        accountLabel: account.email || "Google Contacts",
        status: "previewing",
        selectedScope: ["google-contacts"],
        secretCiphertext: encryptResendSecret(JSON.stringify({ provider: "google", refreshToken: token.refresh_token }), encryptionKey)
      }).returning();
      await queueRun(db, connection, "preview");
      await audit(db, actor, "contact_sync.connect", "contact_sync_connection", connection.id, { provider: "google" });
      return reply.redirect(`${env.WEB_ORIGIN.replace(/\/$/, "")}/settings?contactSync=google-connected`);
    } catch (error) { return sendError(reply, error); }
  });

  app.post("/api/v1/personal/contact-connections/icloud", async (request, reply) => {
    try {
      const { actor, organizationId } = await personalOwner(request);
      const input = createIcloudConnectionSchema.parse(request.body);
      const books = await discoverIcloudAddressBooks({ account: input.account, password: input.appSpecificPassword });
      if (!books.length) throw new Error("No iCloud contact address books were found");
      const [connection] = await db.insert(contactSyncConnections).values({
        organizationId,
        ownerUserId: actor.id,
        provider: "icloud",
        providerAccountId: hash(input.account.toLowerCase()),
        accountLabel: input.account,
        status: "previewing",
        selectedScope: books.map((book) => book.key),
        secretCiphertext: encryptResendSecret(JSON.stringify({
          provider: "icloud", account: input.account, appSpecificPassword: input.appSpecificPassword
        }), encryptionKey)
      }).returning();
      await queueRun(db, connection, "preview");
      await audit(db, actor, "contact_sync.connect", "contact_sync_connection", connection.id, { provider: "icloud" });
      reply.code(202);
      return { data: { ...safeConnection(connection), availableScopes: books } };
    } catch (error) { return sendError(reply, error); }
  });

  app.patch("/api/v1/personal/contact-connections/:id/scope", async (request, reply) => {
    try {
      const { actor, organizationId } = await personalOwner(request);
      const { id } = request.params as { id: string };
      const input = updateContactSyncScopeSchema.parse(request.body);
      const current = await getContactSyncConnection(db, organizationId, actor.id, id);
      if (!current) return reply.code(404).send({ error: { code: "not_found", message: "Connection not found" } });
      const [connection] = await db.update(contactSyncConnections).set({
        selectedScope: input.selectedScope,
        status: "previewing",
        previewRevision: current.previewRevision + 1,
        updatedAt: new Date()
      }).where(eq(contactSyncConnections.id, id)).returning();
      await queueRun(db, connection, "preview");
      return { data: safeConnection(connection) };
    } catch (error) { return sendError(reply, error); }
  });

  app.get("/api/v1/personal/contact-connections/:id/preview", async (request, reply) => {
    try {
      const { actor, organizationId } = await personalOwner(request);
      const { id } = request.params as { id: string };
      const connection = await getContactSyncConnection(db, organizationId, actor.id, id);
      if (!connection) return reply.code(404).send({ error: { code: "not_found", message: "Connection not found" } });
      const rows = await db.select().from(contactSyncSources).where(and(
        eq(contactSyncSources.organizationId, organizationId),
        eq(contactSyncSources.connectionId, id),
        eq(contactSyncSources.disposition, "pending")
      )).limit(100);
      return {
        data: {
          connection: safeConnection(connection),
          count: rows.length,
          sample: rows.slice(0, 20).map((row) => ({ id: row.id, ...row.normalizedData }))
        }
      };
    } catch (error) { return sendError(reply, error); }
  });

  app.post("/api/v1/personal/contact-connections/:id/import", async (request, reply) => {
    try {
      const { actor, organizationId } = await personalOwner(request);
      const { id } = request.params as { id: string };
      const body = request.body as { previewRevision?: number };
      const connection = await getContactSyncConnection(db, organizationId, actor.id, id);
      if (!connection) return reply.code(404).send({ error: { code: "not_found", message: "Connection not found" } });
      if (body.previewRevision !== undefined && body.previewRevision !== connection.previewRevision) {
        return reply.code(409).send({ error: { code: "stale_preview", message: "Refresh the preview before importing" } });
      }
      const run = await queueRun(db, connection, "import");
      await db.update(contactSyncConnections).set({ status: "syncing", updatedAt: new Date() }).where(eq(contactSyncConnections.id, id));
      reply.code(202);
      return { data: { runId: run.id } };
    } catch (error) { return sendError(reply, error); }
  });

  app.post("/api/v1/personal/contact-connections/:id/sync", async (request, reply) => {
    try {
      const { actor, organizationId } = await personalOwner(request);
      const { id } = request.params as { id: string };
      const connection = await getContactSyncConnection(db, organizationId, actor.id, id);
      if (!connection) return reply.code(404).send({ error: { code: "not_found", message: "Connection not found" } });
      if (connection.updatedAt.getTime() > Date.now() - 60_000 && connection.status === "syncing") {
        return reply.code(429).send({ error: { code: "sync_throttled", message: "A sync is already running" } });
      }
      const run = await queueRun(db, connection, "manual");
      await db.update(contactSyncConnections).set({ status: "syncing", updatedAt: new Date() }).where(eq(contactSyncConnections.id, id));
      reply.code(202);
      return { data: { runId: run.id } };
    } catch (error) { return sendError(reply, error); }
  });

  app.get("/api/v1/personal/contact-connections/:id/runs/:runId", async (request, reply) => {
    try {
      const { actor, organizationId } = await personalOwner(request);
      const { id, runId } = request.params as { id: string; runId: string };
      const connection = await getContactSyncConnection(db, organizationId, actor.id, id);
      if (!connection) return reply.code(404).send({ error: { code: "not_found", message: "Connection not found" } });
      const [run] = await db.select().from(contactSyncRuns).where(and(
        eq(contactSyncRuns.id, runId),
        eq(contactSyncRuns.connectionId, id),
        eq(contactSyncRuns.organizationId, organizationId)
      )).limit(1);
      if (!run) return reply.code(404).send({ error: { code: "not_found", message: "Run not found" } });
      return { data: run };
    } catch (error) { return sendError(reply, error); }
  });

  app.get("/api/v1/personal/contact-connections/:id/conflicts", async (request, reply) => {
    try {
      const { actor, organizationId } = await personalOwner(request);
      const { id } = request.params as { id: string };
      const connection = await getContactSyncConnection(db, organizationId, actor.id, id);
      if (!connection) return reply.code(404).send({ error: { code: "not_found", message: "Connection not found" } });
      const rows = await db.select().from(contactSyncSources).where(and(
        eq(contactSyncSources.connectionId, id),
        eq(contactSyncSources.organizationId, organizationId),
        eq(contactSyncSources.disposition, "pending")
      )).limit(100);
      return { data: rows.map((row) => ({ id: row.id, source: row.normalizedData })) };
    } catch (error) { return sendError(reply, error); }
  });

  app.post("/api/v1/personal/contact-connections/:id/conflicts/:sourceId/resolve", async (request, reply) => {
    try {
      const { actor, organizationId } = await personalOwner(request);
      const { id, sourceId } = request.params as { id: string; sourceId: string };
      const body = request.body as { action?: "link" | "create" | "ignore"; contactId?: string };
      const connection = await getContactSyncConnection(db, organizationId, actor.id, id);
      if (!connection) return reply.code(404).send({ error: { code: "not_found", message: "Connection not found" } });
      const [source] = await db.select().from(contactSyncSources).where(and(
        eq(contactSyncSources.id, sourceId),
        eq(contactSyncSources.connectionId, id),
        eq(contactSyncSources.organizationId, organizationId)
      )).limit(1);
      if (!source) return reply.code(404).send({ error: { code: "not_found", message: "Source not found" } });
      if (body.action === "ignore") {
        await db.update(contactSyncSources).set({ disposition: "ignored", contactId: null, updatedAt: new Date() }).where(eq(contactSyncSources.id, source.id));
      } else if (body.action === "link" && body.contactId) {
        const contact = await getContactById(db, organizationId, body.contactId);
        if (!contact) return reply.code(404).send({ error: { code: "not_found", message: "Contact not found" } });
        await db.update(contactSyncSources).set({ disposition: "linked", contactId: contact.id, localOverrides: ["email", "phone", "firstName", "lastName"], updatedAt: new Date() }).where(eq(contactSyncSources.id, source.id));
      } else if (body.action === "create") {
        const data = source.normalizedData as { firstName?: string | null; lastName?: string | null; emails?: Array<{ value: string; primary?: boolean }>; phones?: Array<{ value: string; primary?: boolean }> };
        const email = data.emails?.find((item) => item.primary)?.value ?? data.emails?.[0]?.value ?? null;
        const phone = data.phones?.find((item) => item.primary)?.value ?? data.phones?.[0]?.value ?? null;
        const contact = await createContact(db, { organizationId, email, phone, firstName: data.firstName, lastName: data.lastName, change: { actorType: "user", actorId: actor.id, source: "contact-sync.resolve" } });
        await db.update(contactSyncSources).set({ disposition: "linked", contactId: contact.id, updatedAt: new Date() }).where(eq(contactSyncSources.id, source.id));
      } else {
        return reply.code(400).send({ error: { code: "invalid_resolution", message: "Choose link, create, or ignore" } });
      }
      return { data: { resolved: true } };
    } catch (error) { return sendError(reply, error); }
  });

  app.post("/api/v1/personal/contact-connections/:id/disconnect-preview", async (request, reply) => {
    try {
      const { actor, organizationId } = await personalOwner(request);
      const { id } = request.params as { id: string };
      const connection = await getContactSyncConnection(db, organizationId, actor.id, id);
      if (!connection) return reply.code(404).send({ error: { code: "not_found", message: "Connection not found" } });
      const sources = await db.select().from(contactSyncSources).where(and(
        eq(contactSyncSources.connectionId, id),
        eq(contactSyncSources.organizationId, organizationId)
      ));
      return { data: { generation: connection.generation, linked: sources.filter((row) => row.contactId).length, archiveEligible: 0, retained: sources.filter((row) => row.contactId).length } };
    } catch (error) { return sendError(reply, error); }
  });

  app.post("/api/v1/personal/contact-connections/:id/disconnect", async (request, reply) => {
    try {
      const { actor, organizationId } = await personalOwner(request);
      const { id } = request.params as { id: string };
      const input = disconnectContactSyncSchema.parse(request.body);
      const connection = await getContactSyncConnection(db, organizationId, actor.id, id);
      if (!connection) return reply.code(404).send({ error: { code: "not_found", message: "Connection not found" } });
      if (input.generation !== connection.generation) return reply.code(409).send({ error: { code: "stale_disconnect", message: "Refresh before disconnecting" } });
      await db.update(contactSyncConnections).set({
        generation: connection.generation + 1,
        status: "disconnected",
        secretCiphertext: null,
        nextRunAt: null,
        disconnectedAt: new Date(),
        updatedAt: new Date()
      }).where(and(
        eq(contactSyncConnections.id, id),
        eq(contactSyncConnections.generation, connection.generation)
      ));
      await db.update(contactSyncSources).set({ disposition: "removed", removedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(contactSyncSources.connectionId, id), eq(contactSyncSources.organizationId, organizationId)));
      await db.delete(contactSyncCursors).where(and(
        eq(contactSyncCursors.connectionId, id),
        eq(contactSyncCursors.organizationId, organizationId)
      ));
      await db.delete(contactSyncOauthTransactions).where(and(
        eq(contactSyncOauthTransactions.organizationId, organizationId),
        eq(contactSyncOauthTransactions.ownerUserId, actor.id)
      ));
      await audit(db, actor, "contact_sync.disconnect", "contact_sync_connection", id, { provider: connection.provider, mode: input.mode });
      return { data: { disconnected: true, archived: 0 } };
    } catch (error) { return sendError(reply, error); }
  });
}
