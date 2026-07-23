import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import swagger from "@fastify/swagger";
import { loadEnv } from "@twiniti/config";
import { ensureBootstrapOrg, getDb } from "@twiniti/db";
import { registerAuthHook } from "./auth-hook.js";
import { registerMcpRoutes } from "./mcp.js";
import { registerCrmRoutes } from "./routes/crm.js";
import { registerMarketingRoutes } from "./routes/marketing.js";

const env = loadEnv({
  ...process.env,
  AUTH_DISABLED: process.env.AUTH_DISABLED ?? (process.env.HEXCLAVE_SECRET_SERVER_KEY ? "false" : "true"),
  DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://user:password@localhost:5432/twiniti_crm"
});

const app = Fastify({ logger: true });
const db = getDb(env.DATABASE_URL);

await app.register(cors, {
  origin: env.WEB_ORIGIN,
  credentials: true
});

await app.register(swagger, {
  openapi: {
    info: { title: "Twiniti CRM API", version: "0.1.0" },
    servers: [{ url: `http://localhost:${env.PORT}` }]
  }
});

registerAuthHook(app, db, env);

app.get("/health", async () => ({
  status: "ok",
  service: "twiniti-crm-api",
  authMode: env.AUTH_DISABLED || !env.HEXCLAVE_SECRET_SERVER_KEY ? "bootstrap" : "hexclave"
}));

app.get("/api/v1/bootstrap", async () => {
  const org = await ensureBootstrapOrg(db, {
    orgName: env.BOOTSTRAP_ORG_NAME,
    ownerSubject: env.BOOTSTRAP_OWNER_SUBJECT || "dev-owner"
  });
  return { data: { organizationId: org.id, name: org.name } };
});

await registerCrmRoutes(app, db);
await registerMarketingRoutes(app, db, env);
await registerMcpRoutes(app, db);

app.get("/docs", async (_, reply) => reply.redirect("/documentation"));

const webDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web/dist");
await app.register(fastifyStatic, { root: webDist, prefix: "/", decorateReply: false });

const port = env.PORT;
await app.listen({ port, host: "0.0.0.0" });
