import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { assertOrganization, requireRole, resolveRequestActor, type AuthActor, type CrmRole } from "@twiniti/auth";
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
      || url === "/api/v1/webhooks/stripe"
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
    const billingRoute = url === "/api/v1/me" || url.startsWith("/api/v1/billing");
    if (
      actor.organizationId
      && !actor.isSuperAdmin
      && actor.billingStatus
      && !["active", "trialing"].includes(actor.billingStatus)
      && !billingRoute
    ) {
      await reply.code(402).send({
        error: {
          code: "billing_required",
          message: "Complete organization billing before accessing the workspace"
        }
      });
      return;
    }
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

export function requireUserRole(actor: AuthActor, role: CrmRole | "viewer" | "analyst" | "marketer" | "owner" | "admin" | "member") {
  if (actor.type === "agent") {
    const error = new Error(`Agent credentials cannot satisfy user role ${role}; use scoped agent endpoints`) as Error & {
      statusCode: number;
    };
    error.statusCode = 403;
    throw error;
  }
  if (actor.needsSetup || !actor.organizationId) {
    const error = new Error("Company setup required") as Error & { statusCode: number };
    error.statusCode = 403;
    throw error;
  }
  if (!requireRole(actor, role)) {
    const error = new Error(`Requires role ${role}`) as Error & { statusCode: number };
    error.statusCode = 403;
    throw error;
  }
}

export function requireSuperAdmin(actor: AuthActor) {
  if (actor.type !== "user" || !actor.isSuperAdmin) {
    const error = new Error("Super admin access required") as Error & { statusCode: number };
    error.statusCode = 403;
    throw error;
  }
}

export function requireOrgId(actor: AuthActor): string {
  return assertOrganization(actor);
}

export async function audit(
  db: Db,
  actor: AuthActor,
  action: string,
  entityType: string,
  entityId?: string,
  metadata?: Record<string, unknown>
) {
  const organizationId = actor.organizationId;
  if (!organizationId) return;
  await writeAudit(db, {
    organizationId,
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
