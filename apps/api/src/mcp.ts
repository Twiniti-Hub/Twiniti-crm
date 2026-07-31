import type { FastifyInstance } from "fastify";
import { and, count, eq } from "drizzle-orm";
import { resolveRequestActor, assertScope, assertOrganization } from "@twiniti/auth";
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
  createContact,
  findContactByEmail,
  getContactById,
  getContactTimeline,
  getSegmentById,
  listSegments,
  listCampaigns,
  searchContacts,
  updateContact,
  contacts,
  compileFilterAst,
  parseFilterAst,
  type Db
} from "@twiniti/db";
import { sendError } from "./auth-hook.js";

type McpRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
};

const toolDefs = [
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

export async function registerMcpRoutes(app: FastifyInstance, db: Db, env: AppEnv) {
  app.post("/mcp", async (request, reply) => {
    try {
      const body = request.body as McpRequest;
      const id = body.id ?? null;
      const actor = await resolveRequestActor(db, request, env);
      if (!actor) {
        reply.code(401);
        return { jsonrpc: "2.0", id: null, error: { code: -32001, message: "Unauthorized" } };
      }
      if (
        actor.organizationId
        && !actor.isSuperAdmin
        && actor.billingStatus
        && !["active", "trialing"].includes(actor.billingStatus)
      ) {
        reply.code(402);
        return { jsonrpc: "2.0", id, error: { code: -32002, message: "Organization billing is required" } };
      }
      request.actor = actor;

      if (body.method === "initialize") {
        return {
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: "2024-11-05",
            serverInfo: { name: "twiniti-crm", version: "0.1.0" },
            capabilities: { tools: {}, resources: {}, prompts: {} }
          }
        };
      }

      if (body.method === "tools/list") {
        return {
          jsonrpc: "2.0",
          id,
          result: {
            tools: toolDefs.map((tool) => ({
              name: tool.name,
              description: tool.description,
              inputSchema: tool.inputSchema
            }))
          }
        };
      }

      if (body.method === "resources/list") {
        return {
          jsonrpc: "2.0",
          id,
          result: {
            resources: [
              { uri: "crm://schema", name: "CRM Schema", mimeType: "application/json" },
              { uri: "crm://consent-rules", name: "Consent Rules", mimeType: "text/plain" },
              { uri: "crm://error-codes", name: "Error Codes", mimeType: "application/json" }
            ]
          }
        };
      }

      if (body.method === "resources/read") {
        const uri = String((body.params as { uri?: string } | undefined)?.uri ?? "");
        if (!["crm://schema", "crm://consent-rules", "crm://error-codes"].includes(uri)) {
          return { jsonrpc: "2.0", id, error: { code: -32004, message: "Resource not found" } };
        }
        const content =
          uri === "crm://consent-rules"
            ? "Suppressed and unsubscribed contacts must never receive campaign email. Consent is authoritative in CRM."
            : uri === "crm://error-codes"
              ? JSON.stringify({ unauthorized: 401, forbidden: 403, conflict: 409, approval_required: 403 })
              : JSON.stringify({ objects: ["contacts", "companies", "campaigns", "segments", "forms"] });
        return {
          jsonrpc: "2.0",
          id,
            result: { contents: [{ uri, mimeType: uri === "crm://consent-rules" ? "text/plain" : "application/json", text: content }] }
        };
      }

      if (body.method === "prompts/list") {
        return {
          jsonrpc: "2.0",
          id,
          result: {
            prompts: [
              { name: "find_inactive_contacts", description: "Find inactive contacts" },
              { name: "create_reengagement_campaign", description: "Create a re-engagement campaign" },
              { name: "review_campaign_readiness", description: "Review campaign readiness" }
            ]
          }
        };
      }

      if (body.method === "tools/call") {
        const params = body.params as { name?: string; arguments?: Record<string, unknown> };
        const name = params?.name ?? "";
        const args = params?.arguments ?? {};
        const tool = toolDefs.find((item) => item.name === name);
        if (!tool) {
          return { jsonrpc: "2.0", id, error: { code: -32601, message: `Unknown tool: ${name}` } };
        }
        if (actor.type === "agent") assertScope(actor, tool.scope);

        let result: unknown;
        switch (tool.name) {
          case "search_contacts": {
            const query = contactSearchSchema.parse(args);
            result = await searchContacts(db, assertOrganization(actor), query);
            break;
          }
          case "get_contact": {
            result = await getContactById(db, assertOrganization(actor), String(args.id ?? ""));
            break;
          }
          case "list_segments": {
            const query = segmentSearchSchema.parse(args);
            result = await listSegments(db, assertOrganization(actor), query);
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
            const existing = await findContactByEmail(db, assertOrganization(actor), input.email);
            result = existing
              ? {
                  status: "conflict",
                  reason: "duplicate_email",
                  existing_contact_id: existing.id,
                  next_actions: ["update_existing", "create_anyway"]
                }
              : await createContact(db, {
                  organizationId: assertOrganization(actor),
                  ...input,
                  change: { actorType: actor.type, actorId: actor.id, source: "mcp.contact.create" }
                });
            break;
          }
          case "upsert_contact": {
            const input = upsertContactSchema.parse(args);
            const existing = await findContactByEmail(db, assertOrganization(actor), input.email);
            if (existing) {
              const updated = await updateContact(db, assertOrganization(actor), existing.id, {
                ...input,
                change: { actorType: actor.type, actorId: actor.id, source: "mcp.contact.upsert" }
              });
              result = updated && !updated.conflict ? updated.row : existing;
            } else {
              result = await createContact(db, {
                organizationId: assertOrganization(actor),
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
          default: {
            return { jsonrpc: "2.0", id, error: { code: -32601, message: "Unhandled tool" } };
          }
        }

        return {
          jsonrpc: "2.0",
          id,
          result: { content: [{ type: "text", text: JSON.stringify(result) }] }
        };
      }

      return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${body.method}` } };
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
