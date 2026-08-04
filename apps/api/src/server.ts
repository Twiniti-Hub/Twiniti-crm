import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import rawBody from "fastify-raw-body";
import swagger from "@fastify/swagger";
import { assertProductionApiConfiguration, hasHexclaveServerConfiguration, loadEnv, regionalDatabaseUrl } from "@twiniti/config";
import { ensureBootstrapOrg, getDb } from "@twiniti/db";
import { registerAuthHook, requireActor, requireSuperAdmin } from "./auth-hook.js";
import { registerMcpRoutes } from "./mcp.js";
import { registerBillingRoutes } from "./routes/billing.js";
import { registerCrmRoutes } from "./routes/crm.js";
import { registerMarketingRoutes } from "./routes/marketing.js";
import { registerOrganizationRoutes } from "./routes/organizations.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
loadDotenv({ path: path.join(rootDir, ".env") });

const env = loadEnv({
  ...process.env,
  AUTH_DISABLED: process.env.AUTH_DISABLED ?? (process.env.HEXCLAVE_SECRET_SERVER_KEY ? "false" : "true"),
  DEPLOYMENT_ENV: process.env.DEPLOYMENT_ENV ?? (process.env.NODE_ENV === "production" ? "production" : "development"),
  DATABASE_URL: process.env.DATABASE_URL ?? ""
});

const app = Fastify({ logger: true });
const db = getDb(regionalDatabaseUrl(env, env.REGION_CODE));

await app.register(cors, {
  origin: env.WEB_ORIGIN,
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization", "X-Twiniti-Workspace-Id"]
});

await app.register(swagger, {
  openapi: {
    info: { title: "Twiniti Loop API", version: "0.1.0" },
    servers: [{ url: `http://localhost:${env.PORT}` }]
  }
});
assertProductionApiConfiguration(env);

await app.register(rawBody, {
  field: "rawBody",
  global: false,
  encoding: false,
  runFirst: true
});

registerAuthHook(app, db, env);

app.get("/health", async () => ({
  status: "ok",
  service: "twiniti-crm-api",
  regionCode: env.REGION_CODE,
  authMode: hasHexclaveServerConfiguration(env) ? "hexclave" : "bootstrap"
}));

app.get("/api/v1/bootstrap", async (request, reply) => {
  if (env.NODE_ENV === "production") return reply.code(404).send({ error: { code: "not_found", message: "Not found" } });
  const actor = requireActor(request);
  requireSuperAdmin(actor);
  const org = await ensureBootstrapOrg(db, {
    orgName: env.BOOTSTRAP_ORG_NAME,
    ownerSubject: env.BOOTSTRAP_OWNER_SUBJECT || "dev-owner"
  });
  return { data: { organizationId: org.id, name: org.name } };
});

await registerOrganizationRoutes(app, db, env);
await registerBillingRoutes(app, db, env);
await registerCrmRoutes(app, db);
await registerMarketingRoutes(app, db, env);
await registerMcpRoutes(app, db, env);

app.get("/docs", async (_, reply) => reply.redirect("/documentation"));

const webDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web/dist");
await app.register(fastifyStatic, {
  root: webDist,
  prefix: "/",
  decorateReply: true,
  wildcard: false
});

app.setNotFoundHandler((request, reply) => {
  const url = request.url.split("?")[0] ?? request.url;
  if (request.method === "GET" && !url.startsWith("/api/") && !url.startsWith("/documentation") && url !== "/mcp") {
    return reply.sendFile("index.html");
  }
  return reply.code(404).send({
    message: `Route ${request.method}:${url} not found`,
    error: "Not Found",
    statusCode: 404
  });
});

const port = env.PORT;
await app.listen({ port, host: "0.0.0.0" });
