import type { FastifyInstance } from "fastify";
import { and, desc, eq } from "drizzle-orm";
import { actionProposals, approvals, digitalWorkers, workerEvaluations, workerMissions, workerRuns, type Db } from "@twiniti/db";
import { requireActor, requireOrgId } from "../auth-hook.js";

export async function registerDigitalWorkerRoutes(app: FastifyInstance, db: Db) {
  app.get("/api/v1/digital-workers", async (request) => {
    const organizationId = requireOrgId(requireActor(request));
    const workers = await db.select().from(digitalWorkers)
      .where(eq(digitalWorkers.organizationId, organizationId))
      .orderBy(desc(digitalWorkers.updatedAt));
    return { data: workers };
  });

  app.get("/api/v1/digital-workers/:id/missions", async (request, reply) => {
    const organizationId = requireOrgId(requireActor(request));
    const { id } = request.params as { id: string };
    const rows = await db.select().from(workerMissions).where(and(
      eq(workerMissions.organizationId, organizationId),
      eq(workerMissions.workerId, id)
    )).orderBy(desc(workerMissions.updatedAt));
    return reply.send({ data: rows });
  });

  app.get("/api/v1/worker-runs", async (request) => {
    const organizationId = requireOrgId(requireActor(request));
    const runs = await db.select().from(workerRuns)
      .where(eq(workerRuns.organizationId, organizationId))
      .orderBy(desc(workerRuns.createdAt)).limit(100);
    return { data: runs };
  });

  app.get("/api/v1/action-proposals", async (request) => {
    const organizationId = requireOrgId(requireActor(request));
    const proposals = await db.select().from(actionProposals)
      .where(eq(actionProposals.organizationId, organizationId))
      .orderBy(desc(actionProposals.createdAt)).limit(100);
    return { data: proposals };
  });

  app.get("/api/v1/worker-evaluations", async (request) => {
    const organizationId = requireOrgId(requireActor(request));
    const evaluations = await db.select().from(workerEvaluations)
      .where(eq(workerEvaluations.organizationId, organizationId))
      .orderBy(desc(workerEvaluations.createdAt)).limit(100);
    return { data: evaluations };
  });

  app.get("/api/v1/action-proposals/:id/approval", async (request) => {
    const organizationId = requireOrgId(requireActor(request));
    const { id } = request.params as { id: string };
    const [approval] = await db.select().from(approvals).where(and(
      eq(approvals.organizationId, organizationId),
      eq(approvals.proposalId, id)
    )).limit(1);
    return { data: approval ?? null };
  });
}
