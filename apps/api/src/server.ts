import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import { contactSearchSchema, createContactSchema, updateContactSchema } from "@twiniti/contracts";

const app = Fastify({ logger: true });

await app.register(cors, { origin: process.env.WEB_ORIGIN ?? "http://localhost:5173" });
await app.register(swagger, {
  openapi: {
    info: { title: "Twiniti CRM API", version: "0.1.0" },
    servers: [{ url: "http://localhost:4000" }]
  }
});

app.get("/health", async () => ({ status: "ok", service: "twiniti-crm-api" }));

app.get("/api/v1/contacts", async (request) => {
  const query = contactSearchSchema.parse(request.query);
  return { data: [], meta: { limit: query.limit, cursor: query.cursor ?? null, query: query.query ?? null } };
});

app.post("/api/v1/contacts", async (request, reply) => {
  const input = createContactSchema.parse(request.body);
  reply.code(201);
  return { data: { id: "pending-db-integration", ...input }, meta: { mode: "scaffold" } };
});

app.patch("/api/v1/contacts/:id", async (request) => {
  const input = updateContactSchema.parse(request.body);
  return { data: { id: (request.params as { id: string }).id, ...input }, meta: { mode: "scaffold" } };
});

app.get("/api/v1/agents/tools", async () => ({
  tools: [
    { name: "search_contacts", scope: "contacts:read" },
    { name: "create_contact", scope: "contacts:create" },
    { name: "update_contact", scope: "contacts:update" },
    { name: "create_campaign_draft", scope: "campaigns:create" },
    { name: "preview_campaign", scope: "campaigns:preview" },
    { name: "request_campaign_approval", scope: "campaigns:request_approval" },
    { name: "send_approved_campaign", scope: "campaigns:send" }
  ]
}));

app.get("/docs", async (_, reply) => reply.redirect("/documentation"));

const port = Number(process.env.PORT ?? 4000);
await app.listen({ port, host: "0.0.0.0" });
