import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { digitalWorkers, workerMissions, workerRunCredentials, workerRuns, type Db } from "@twiniti/db";
import { requireActor, requireOrgId, requireUserRole } from "../auth-hook.js";
import { mintRunCredential } from "../ai/runCredentials.js";

export async function registerRunCredentialRoutes(app: FastifyInstance, db: Db) {
  app.post("/api/v1/worker-runs/:id/credential", async (request, reply) => {
    const actor = requireActor(request);
    requireUserRole(actor, "admin");
    const organizationId = requireOrgId(actor);
    const { id } = request.params as { id: string };
    const [run] = await db.select({ run: workerRuns, mission: workerMissions, worker: digitalWorkers }).from(workerRuns)
      .innerJoin(workerMissions, eq(workerMissions.id, workerRuns.missionId))
      .innerJoin(digitalWorkers, eq(digitalWorkers.id, workerMissions.workerId))
      .where(and(eq(workerRuns.id, id), eq(workerRuns.organizationId, organizationId))).limit(1);
    if (!run) return reply.code(404).send({ error: "Worker run not found" });
    const body = (request.body ?? {}) as { audience?: string; scopes?: string[]; allowedTools?: string[]; ttlSeconds?: number };
    const credential = mintRunCredential({
      audience: body.audience ?? "twiniti-worker-tool",
      scopes: body.scopes ?? [],
      allowedTools: body.allowedTools ?? [],
      ttlSeconds: body.ttlSeconds
    });
    const [row] = await db.insert(workerRunCredentials).values({
      organizationId, runId: run.run.id, workerId: run.worker.id, tokenHash: credential.tokenHash,
      audience: credential.audience, scopes: credential.scopes, allowedTools: credential.allowedTools,
      issuedAt: credential.issuedAt, expiresAt: credential.expiresAt
    }).returning();
    const { tokenHash: _tokenHash, ...publicCredential } = row;
    return reply.code(201).send({ data: { credential: { ...publicCredential, token: credential.token } } });
  });

  app.delete("/api/v1/worker-runs/:runId/credential/:id", async (request, reply) => {
    const actor = requireActor(request);
    requireUserRole(actor, "admin");
    const organizationId = requireOrgId(actor);
    const { runId, id } = request.params as { runId: string; id: string };
    const [row] = await db.update(workerRunCredentials).set({ revokedAt: new Date() }).where(and(
      eq(workerRunCredentials.id, id), eq(workerRunCredentials.runId, runId), eq(workerRunCredentials.organizationId, organizationId)
    )).returning({ id: workerRunCredentials.id });
    if (!row) return reply.code(404).send({ error: "Run credential not found" });
    return { data: { id: row.id, revoked: true } };
  });
}
