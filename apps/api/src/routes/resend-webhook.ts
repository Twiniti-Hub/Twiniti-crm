import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { and, eq, inArray } from "drizzle-orm";
import type { AppEnv } from "@twiniti/config";
import {
  enqueueJob,
  organizationResendDomains,
  storeWebhookEvent,
  type Db
} from "@twiniti/db";
import {
  decryptResendSecret,
  extractResendWebhookDomains,
  verifyResendWebhookSignature
} from "@twiniti/email";
import { sendError } from "../auth-hook.js";

type RawBodyRequest = FastifyRequest & { rawBody?: string | Buffer };

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function readRawBody(request: FastifyRequest): string {
  const rawBody = (request as RawBodyRequest).rawBody;
  if (Buffer.isBuffer(rawBody)) return rawBody.toString("utf8");
  if (typeof rawBody === "string") return rawBody;
  if (typeof request.body === "string") return request.body;
  return JSON.stringify(request.body ?? {});
}

function hasResendSignatureHeaders(request: FastifyRequest): boolean {
  return Boolean(
    firstHeader(request.headers["svix-signature"])
    || firstHeader(request.headers["webhook-signature"])
    || firstHeader(request.headers["resend-signature"])
  );
}

function parsePayload(request: FastifyRequest, raw: string): Record<string, unknown> {
  if (typeof request.body === "object" && request.body && !Buffer.isBuffer(request.body)) {
    return request.body as Record<string, unknown>;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return { raw };
  }
  return { raw };
}

async function findRoutingDomains(db: Db, names: string[]) {
  const unique = [...new Set(names.map((name) => name.trim().toLowerCase()).filter(Boolean))];
  if (unique.length === 0) return [];
  return db.select().from(organizationResendDomains).where(and(
    inArray(organizationResendDomains.domain, unique),
    eq(organizationResendDomains.active, true),
    eq(organizationResendDomains.verificationStatus, "verified")
  ));
}

function tryDecryptSecret(ciphertext: string | null | undefined, key: string): string | null {
  if (!ciphertext) return null;
  try {
    return decryptResendSecret(ciphertext, key);
  } catch {
    return null;
  }
}

export function registerResendWebhookRoutes(app: FastifyInstance, db: Db, env: AppEnv) {
  const handler = async (request: FastifyRequest, reply: FastifyReply, options: { requireSignatureHeaders: boolean }) => {
    try {
      if (options.requireSignatureHeaders && !hasResendSignatureHeaders(request)) {
        const url = request.url.split("?")[0] ?? request.url;
        return reply.code(404).send({
          message: `Route ${request.method}:${url} not found`,
          error: "Not Found",
          statusCode: 404
        });
      }
      if (!env.RESEND_CREDENTIAL_ENCRYPTION_KEY) {
        return reply.code(400).send({ error: { code: "resend_domain_required", message: "A Resend domain is required for webhook routing" } });
      }
      const raw = readRawBody(request);
      const payload = parsePayload(request, raw);
      const queryDomain = ((request.query as { domain?: string }).domain ?? "").trim().toLowerCase();
      const routingNames = queryDomain ? [queryDomain] : extractResendWebhookDomains(payload);
      if (routingNames.length === 0) {
        return reply.code(400).send({ error: { code: "resend_domain_required", message: "A Resend domain is required for webhook routing" } });
      }
      const domains = await findRoutingDomains(db, routingNames);
      if (domains.length === 0) {
        return reply.code(404).send({ error: { code: "resend_domain_not_found", message: "Resend domain is not configured" } });
      }
      const signature = firstHeader(
        request.headers["svix-signature"]
        ?? request.headers["webhook-signature"]
        ?? request.headers["resend-signature"]
      );
      const signedHeaders = {
        id: firstHeader(request.headers["svix-id"] ?? request.headers["webhook-id"]),
        timestamp: firstHeader(request.headers["svix-timestamp"] ?? request.headers["webhook-timestamp"])
      };
      let matched: typeof domains[number] | null = null;
      let sawSecret = false;
      for (const domain of domains) {
        const secret = tryDecryptSecret(domain.webhookSecretCiphertext, env.RESEND_CREDENTIAL_ENCRYPTION_KEY);
        if (!secret) continue;
        sawSecret = true;
        if (verifyResendWebhookSignature(raw, signature, secret, signedHeaders)) {
          matched = domain;
          break;
        }
      }
      if (!matched) {
        if (!sawSecret) {
          return reply.code(503).send({
            error: { code: "resend_webhook_secret_missing", message: "Resend webhook secret is not configured for this domain" }
          });
        }
        return reply.code(401).send({
          error: { code: "unauthorized", message: "Invalid Resend webhook signature" }
        });
      }
      const event = await storeWebhookEvent(db, {
        organizationId: matched.organizationId,
        provider: "resend",
        eventType: typeof payload.type === "string" ? payload.type : "unknown",
        payload,
        signatureValid: true
      });
      await enqueueJob(db, {
        organizationId: matched.organizationId,
        kind: "webhook.resend.process",
        payload: {
          webhookEventId: event.id,
          organizationId: matched.organizationId,
          receivingDomain: matched.domain
        }
      });
      return { data: { accepted: true, signatureValid: true } };
    } catch (error) {
      return sendError(reply, error);
    }
  };

  app.post("/api/v1/webhooks/resend", { config: { rawBody: true } }, async (request, reply) => {
    return handler(request, reply, { requireSignatureHeaders: false });
  });

  app.post("/", { config: { rawBody: true } }, async (request, reply) => {
    return handler(request, reply, { requireSignatureHeaders: true });
  });
}
