import type { FastifyInstance } from "fastify";
import { and, desc, eq, inArray } from "drizzle-orm";
import { relationshipFacts, relationshipProfiles, relationshipSignals, type Db } from "@twiniti/db";
import { requireActor, requireOrgId } from "../auth-hook.js";

async function loadQueue(db: Db, organizationId: string) {
  const profiles = await db.select().from(relationshipProfiles)
    .where(eq(relationshipProfiles.organizationId, organizationId))
    .orderBy(desc(relationshipProfiles.updatedAt)).limit(100);
  if (!profiles.length) return [];
  const profileIds = profiles.map((profile) => profile.id);
  const signals = await db.select().from(relationshipSignals).where(and(
    eq(relationshipSignals.organizationId, organizationId),
    inArray(relationshipSignals.profileId, profileIds),
    eq(relationshipSignals.status, "open")
  )).orderBy(desc(relationshipSignals.detectedAt));
  const signalsByProfile = new Map<string, typeof signals>();
  for (const signal of signals) {
    const existing = signalsByProfile.get(signal.profileId) ?? [];
    existing.push(signal);
    signalsByProfile.set(signal.profileId, existing);
  }
  return profiles.map((profile) => ({ profile, signals: signalsByProfile.get(profile.id) ?? [] }));
}

export async function registerRelationshipStewardRoutes(app: FastifyInstance, db: Db) {
  app.get("/api/v1/relationship-steward/queue", async (request) => {
    const organizationId = requireOrgId(requireActor(request));
    return { data: await loadQueue(db, organizationId) };
  });

  app.get("/api/v1/relationship-steward/contacts/:id", async (request, reply) => {
    const organizationId = requireOrgId(requireActor(request));
    const { id } = request.params as { id: string };
    const [profile] = await db.select().from(relationshipProfiles).where(and(eq(relationshipProfiles.organizationId, organizationId), eq(relationshipProfiles.contactId, id))).limit(1);
    if (!profile) return reply.code(404).send({ error: "Relationship profile not found" });
    const [facts, signals] = await Promise.all([
      db.select().from(relationshipFacts).where(and(eq(relationshipFacts.organizationId, organizationId), eq(relationshipFacts.profileId, profile.id))).orderBy(desc(relationshipFacts.createdAt)),
      db.select().from(relationshipSignals).where(and(eq(relationshipSignals.organizationId, organizationId), eq(relationshipSignals.profileId, profile.id))).orderBy(desc(relationshipSignals.detectedAt))
    ]);
    return { data: { profile, facts, signals } };
  });

  app.get("/api/v1/relationship-steward/companies/:id", async (request, reply) => {
    const organizationId = requireOrgId(requireActor(request));
    const { id } = request.params as { id: string };
    const [profile] = await db.select().from(relationshipProfiles).where(and(eq(relationshipProfiles.organizationId, organizationId), eq(relationshipProfiles.companyId, id))).limit(1);
    if (!profile) return reply.code(404).send({ error: "Relationship profile not found" });
    const [facts, signals] = await Promise.all([
      db.select().from(relationshipFacts).where(and(eq(relationshipFacts.organizationId, organizationId), eq(relationshipFacts.profileId, profile.id))).orderBy(desc(relationshipFacts.createdAt)),
      db.select().from(relationshipSignals).where(and(eq(relationshipSignals.organizationId, organizationId), eq(relationshipSignals.profileId, profile.id))).orderBy(desc(relationshipSignals.detectedAt))
    ]);
    return { data: { profile, facts, signals } };
  });
}
