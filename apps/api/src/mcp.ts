import type { FastifyInstance } from "fastify";
import { and, count, eq } from "drizzle-orm";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import { assertOrganization, assertScope, resolveRequestActor, type AuthActor } from "@twiniti/auth";
import type { AppEnv } from "@twiniti/config";
import {
  contactSearchSchema,
  createCampaignSchema,
  createContactSchema,
  segmentIdSchema,
  segmentSearchSchema,
  updateContactSchema,
  upsertContactSchema
} from "@twiniti/contracts";
import {
  compileFilterAst,
  contacts,
  createContact,
  findContactByEmail,
  getContactById,
  getContactTimeline,
  getSegmentById,
  listCampaigns,
  listSegments,
  parseFilterAst,
  searchContacts,
  type Db,
  type DbPool,
  updateContact
} from "@twiniti/db";
import { beginOrganizationRlsTransaction, clearDbContext } from "@twiniti/db";

const MCP_SERVER_INFO = { name: "twiniti-crm", version: "0.1.0" } as const;

export const toolDefs = [
  { name: "search_contacts", description: "Search contacts in the authenticated organization", scope: "contacts:read", inputSchema: { type: "object", properties: { query: { type: "string" }, limit: { type: "integer", maximum: 100 }, page: { type: "integer", minimum: 1 } } } },
  { name: "get_contact", description: "Get a contact by id in the authenticated organization", scope: "contacts:read", inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string", format: "uuid" } } } },
  { name: "list_segments", description: "List saved segments in the authenticated organization", scope: "segments:read", inputSchema: { type: "object", properties: { query: { type: "string" }, limit: { type: "integer", maximum: 100 } } } },
  { name: "get_segment", description: "Get a saved segment in the authenticated organization", scope: "segments:read", inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string", format: "uuid" } } } },
  { name: "estimate_segment_size", description: "Count contacts matching a saved segment in the authenticated organization", scope: "segments:read", inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string", format: "uuid" } } } },
  { name: "create_contact", description: "Create a contact", scope: "contacts:create", inputSchema: { type: "object" } },
  { name: "upsert_contact", description: "Create or update a contact by email", scope: "contacts:update", inputSchema: { type: "object" } },
  { name: "update_contact", description: "Update a contact", scope: "contacts:update", inputSchema: { type: "object" } },
  { name: "get_contact_timeline", description: "Get contact timeline events", scope: "contacts:read", inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string", format: "uuid" } } } },
  { name: "create_campaign_draft", description: "Create a campaign draft", scope: "campaigns:create", inputSchema: { type: "object" } },
  { name: "get_campaign_status", description: "List campaigns / status", scope: "campaigns:preview", inputSchema: { type: "object" } }
] as const;

const MCP_RESOURCES = [
  { uri: "crm://schema", name: "CRM Schema", mimeType: "application/json" },
  { uri: "crm://consent-rules", name: "Consent Rules", mimeType: "text/plain" },
  { uri: "crm://error-codes", name: "Error Codes", mimeType: "application/json" }
] as const;

const MCP_PROMPTS = [
  { name: "find_inactive_contacts", description: "Find inactive contacts" },
  { name: "create_reengagement_campaign", description: "Create a re-engagement campaign" },
  { name: "review_campaign_readiness", description: "Review campaign readiness" }
] as const;

type ToolArguments = Record<string, unknown>;

function resourceContent(uri: string) {
  if (uri === "crm://consent-rules") {
    return {
      uri,
      mimeType: "text/plain",
      text: "Suppressed and unsubscribed contacts must never receive campaign email. Consent is authoritative in CRM."
    };
  }
  if (uri === "crm://error-codes") {
    return { uri, mimeType: "application/json", text: JSON.stringify({ unauthorized: 401, forbidden: 403, conflict: 409, approval_required: 403 }) };
  }
  return { uri, mimeType: "application/json", text: JSON.stringify({ objects: ["contacts", "companies", "campaigns", "segments", "forms"] }) };
}

export function createMcpServer(db: Db, actor: AuthActor) {
  const server = new Server(MCP_SERVER_INFO, {
    capabilities: { tools: {}, resources: {}, prompts: {} }
  });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: toolDefs.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
    }))
  }));

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: [...MCP_RESOURCES] }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params.uri;
    if (!MCP_RESOURCES.some((resource) => resource.uri === uri)) {
      throw new Error("Resource not found");
    }
    return { contents: [resourceContent(uri)] };
  });

  server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts: [...MCP_PROMPTS] }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;
    const args = (request.params.arguments ?? {}) as ToolArguments;
    const tool = toolDefs.find((item) => item.name === name);
    if (!tool) throw new Error(`Unknown tool: ${name}`);
    if (actor.type === "agent") assertScope(actor, tool.scope);

    let result: unknown;
    switch (tool.name) {
      case "search_contacts": {
        result = await searchContacts(db, assertOrganization(actor), contactSearchSchema.parse(args));
        break;
      }
      case "get_contact": {
        result = await getContactById(db, assertOrganization(actor), String(args.id ?? ""));
        break;
      }
      case "list_segments": {
        result = await listSegments(db, assertOrganization(actor), segmentSearchSchema.parse(args));
        break;
      }
      case "get_segment": {
        const input = segmentIdSchema.parse(args);
        result = await getSegmentById(db, assertOrganization(actor), input.id);
        break;
      }
      case "estimate_segment_size": {
        const input = segmentIdSchema.parse(args);
        const organizationId = assertOrganization(actor);
        const segment = await getSegmentById(db, organizationId, input.id);
        if (!segment) {
          result = null;
          break;
        }
        const filter = compileFilterAst(parseFilterAst(segment.filterAst));
        const rows = await db.select({ value: count() }).from(contacts).where(and(
          eq(contacts.organizationId, organizationId),
          filter
        ));
        result = { segmentId: segment.id, count: Number(rows[0]?.value ?? 0) };
        break;
      }
      case "create_contact": {
        const input = createContactSchema.parse(args);
        const organizationId = assertOrganization(actor);
        const existing = await findContactByEmail(db, organizationId, input.email);
        result = existing
          ? {
              status: "conflict",
              reason: "duplicate_email",
              existing_contact_id: existing.id,
              next_actions: ["update_existing", "create_anyway"]
            }
          : await createContact(db, {
              organizationId,
              ...input,
              change: { actorType: actor.type, actorId: actor.id, source: "mcp.contact.create" }
            });
        break;
      }
      case "upsert_contact": {
        const input = upsertContactSchema.parse(args);
        const organizationId = assertOrganization(actor);
        const existing = await findContactByEmail(db, organizationId, input.email);
        if (existing) {
          const updated = await updateContact(db, organizationId, existing.id, {
            ...input,
            change: { actorType: actor.type, actorId: actor.id, source: "mcp.contact.upsert" }
          });
          result = updated && !updated.conflict ? updated.row : existing;
        } else {
          result = await createContact(db, {
            organizationId,
            ...input,
            change: { actorType: actor.type, actorId: actor.id, source: "mcp.contact.upsert" }
          });
        }
        break;
      }
      case "update_contact": {
        const input = updateContactSchema.parse(args);
        const updated = await updateContact(db, assertOrganization(actor), String(args.id), {
          ...input,
          change: { actorType: actor.type, actorId: actor.id, source: "mcp.contact.update" }
        });
        result = updated && !updated.conflict ? updated.row : null;
        break;
      }
      case "get_contact_timeline": {
        result = await getContactTimeline(db, assertOrganization(actor), String(args.id));
        break;
      }
      case "create_campaign_draft": {
        result = { draft: createCampaignSchema.parse(args), status: "draft" };
        break;
      }
      case "get_campaign_status": {
        result = await listCampaigns(db, assertOrganization(actor));
        break;
      }
    }

    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  });

  return server;
}

function normalizedOrigins(env: AppEnv): string[] {
  return env.WEB_ORIGIN
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

/**
 * MCP is a remote, bearer-authenticated surface. Keep browser requests
 * limited to the configured application origin while allowing non-browser
 * agent clients that do not send an Origin header.
 */
export function isAllowedMcpOrigin(origin: string | undefined, requestOrigin: string, env: AppEnv): boolean {
  if (!origin) return true;
  const allowedOrigins = new Set([...normalizedOrigins(env), requestOrigin]);
  return allowedOrigins.has(origin.replace(/\/$/, ""));
}

function writeTransportError(reply: { raw: { headersSent: boolean; writeHead: (statusCode: number, headers: Record<string, string>) => void; end: (body: string) => void } }, error: unknown) {
  if (reply.raw.headersSent) return;
  reply.raw.writeHead(500, { "content-type": "application/json" });
  reply.raw.end(JSON.stringify({
    jsonrpc: "2.0",
    id: null,
    error: { code: -32603, message: error instanceof Error ? error.message : "Internal server error" }
  }));
}

export async function registerMcpRoutes(app: FastifyInstance, db: Db, env: AppEnv, pool: DbPool) {
  app.route({
    method: ["GET", "POST", "DELETE"],
    url: "/mcp",
    handler: async (request, reply) => {
      const protocol = String(request.headers["x-forwarded-proto"] ?? "http").split(",")[0];
      const host = String(request.headers["x-forwarded-host"] ?? request.headers.host ?? "").split(",")[0];
      const requestOrigin = `${protocol}://${host}`;
      const origin = typeof request.headers.origin === "string" ? request.headers.origin : undefined;
      if (!isAllowedMcpOrigin(origin, requestOrigin, env)) {
        return reply.code(403).send({ error: { code: "forbidden", message: "Invalid Origin header" } });
      }

      const actor = await resolveRequestActor(db, request, env);
      if (!actor) {
        return reply.code(401).send({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "Unauthorized" } });
      }
      if (
        actor.organizationId
        && !actor.isSuperAdmin
        && actor.billingStatus
        && !["active", "trialing"].includes(actor.billingStatus)
      ) {
        return reply.code(402).send({ jsonrpc: "2.0", id: null, error: { code: -32002, message: "Organization billing is required" } });
      }
      request.actor = actor;
      const tenantTransaction = actor.organizationId && actor.hexclaveSubject
        ? await beginOrganizationRlsTransaction(pool, {
            organizationId: actor.organizationId,
            hexclaveSubject: actor.hexclaveSubject
          })
        : null;
      tenantTransaction?.enter();
      reply.hijack();

      const server = createMcpServer(db, actor);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true
      });
      transport.onerror = (error) => request.log.error(error, "MCP transport error");
      reply.raw.once("close", () => {
        void transport.close();
        void server.close();
      });

      let failed = false;
      try {
        await server.connect(transport);
        await transport.handleRequest(request.raw, reply.raw, request.body);
      } catch (error) {
        failed = true;
        request.log.error(error, "MCP request failed");
        writeTransportError(reply, error);
        if (tenantTransaction) await tenantTransaction.rollback();
      } finally {
        if (tenantTransaction) {
          if (failed) await tenantTransaction.rollback();
          else await tenantTransaction.commit();
          clearDbContext();
          tenantTransaction.release();
        }
      }
    }
  });
}
