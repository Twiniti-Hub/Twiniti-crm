import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { requireRole, resolveRequestActor, type AuthActor } from "@twiniti/auth";
import type { AppEnv } from "@twiniti/config";
import type { Db } from "@twiniti/db";
import { writeAudit } from "@twiniti/db";

declare module "fastify" {
  interface FastifyRequest {
    actor?: AuthActor;
  }
}

export function registerAuthHook(app: FastifyInstance, db: Db, env: AppEnv) {
  app.addHook("preHandler", async (request, reply) => {
    const url = request.url.split("?")[0] ?? request.url;
    if (
      url === "/health"
      || url === "/docs"
      || url.startsWith("/documentation")
      || url === "/api/v1/webhooks/resend"
      || url.startsWith("/api/v1/public/")
      || url === "/mcp"
      || !url.startsWith("/api/")
    ) {
      return;
    }

    const actor = await resolveRequestActor(db, request, env);
    if (!actor) {
      await reply.code(401).send({ error: { code: "unauthorized", message: "Authentication required" } });
      return;
    }
    request.actor = actor;
  });
}

export function requireActor(request: FastifyRequest): AuthActor {
  if (!request.actor) {
    const error = new Error("Authentication required") as Error & { statusCode: number };
    error.statusCode = 401;
    throw error;
  }
  return request.actor;
}

export function requireUserRole(actor: AuthActor, role: "viewer" | "analyst" | "marketer" | "admin" | "owner") {
  if (actor.type === "agent") {
    return;
  }
  if (!requireRole(actor, role)) {
    const error = new Error(`Requires role ${role}`) as Error & { statusCode: number };
    error.statusCode = 403;
    throw error;
  }
}

export async function audit(
  db: Db,
  actor: AuthActor,
  action: string,
  entityType: string,
  entityId?: string,
  metadata?: Record<string, unknown>
) {
  await writeAudit(db, {
    organizationId: actor.organizationId,
    actorType: actor.type,
    actorId: actor.id,
    action,
    entityType,
    entityId,
    metadata
  });
}

export function sendError(reply: FastifyReply, error: unknown) {
  const statusCode = typeof error === "object" && error && "statusCode" in error
    ? Number((error as { statusCode: number }).statusCode)
    : 400;
  const message = error instanceof Error ? error.message : "Request failed";
  return reply.code(statusCode >= 400 ? statusCode : 400).send({
    error: { code: statusCode === 403 ? "forbidden" : statusCode === 401 ? "unauthorized" : "bad_request", message }
  });
}
