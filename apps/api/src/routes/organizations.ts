import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { regionalDatabaseUrl } from "@twiniti/config";
import type { AppEnv } from "@twiniti/config";
import {
  acceptInvitationSchema,
  createOrganizationSchema,
  inviteMemberSchema,
  updateMemberSchema
} from "@twiniti/contracts";
import {
  acceptInvitation,
  createInvitation,
  createOrganization,
  ensureOrganizationBilling,
  findInvitationByToken,
  getOrganizationById,
  listOrganizations,
  listOrgMembers,
  listPendingInvitations,
  getSuperAdminDashboard,
  withServiceRls,
  updateMemberRole,
  writeAudit,
  organizationResendDomains,
  listOrganizationResendDomains,
  getOrganizationResendDomain,
  getDefaultOrganizationResendDomain,
  type Db
} from "@twiniti/db";
import { getDb } from "@twiniti/db";
import { regionForCountry, type RegionCode } from "@twiniti/contracts";
import { decryptResendSecret, encryptResendSecret, sendEmail, validateResendApiKey } from "@twiniti/email";
import {
  audit,
  requireActor,
  requireOrgId,
  requireSuperAdmin,
  requireUserRole,
  sendError
} from "../auth-hook.js";
import { createOrganizationCheckoutSession } from "./billing.js";
import { enqueueLicenseProvisioning } from "../license-jobs.js";

async function sendInviteEmail(
  env: AppEnv,
  db: Db,
  input: { to: string; organizationId: string; organizationName: string; role: string; token: string }
) {
  const inviteUrl = `${env.WEB_ORIGIN.replace(/\/$/, "")}/accept-invite?token=${encodeURIComponent(input.token)}`;
  if (!env.RESEND_CREDENTIAL_ENCRYPTION_KEY) throw new Error("Resend credential encryption is not configured");
  const config = await getDefaultOrganizationResendDomain(db, input.organizationId);
  if (!config) throw new Error("Organization Resend configuration is required before sending invitations");
  await sendEmail({
    apiKey: decryptResendSecret(config.apiKeyCiphertext, env.RESEND_CREDENTIAL_ENCRYPTION_KEY),
    from: config.fromName ? `${config.fromName} <${config.fromEmail}>` : config.fromEmail,
    to: input.to,
    subject: `You're invited to ${input.organizationName} on Twiniti Loop`,
    html: `<p>You've been invited to join <strong>${input.organizationName}</strong> as a <strong>${input.role}</strong>.</p>
<p><a href="${inviteUrl}">Accept invitation</a></p>
<p>Or open this link: ${inviteUrl}</p>`,
    text: `You've been invited to join ${input.organizationName} as a ${input.role}.\n\nAccept: ${inviteUrl}`
  });
  return { inviteUrl, sent: true as const };
}

function mapMember(row: {
  id: string;
  email: string | null;
  displayName: string | null;
  role: string;
  active: boolean;
  createdAt: Date;
}) {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    role: row.role,
    active: row.active,
    createdAt: row.createdAt.toISOString()
  };
}

function mapInvitation(row: {
  id: string;
  email: string;
  role: string;
  expiresAt: Date;
  createdAt: Date;
  acceptedAt: Date | null;
}) {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    acceptedAt: row.acceptedAt?.toISOString() ?? null
  };
}

export async function registerOrganizationRoutes(app: FastifyInstance, db: Db, env: AppEnv) {
  app.get("/api/v1/me", async (request) => {
    const actor = requireActor(request);
    return {
      data: {
        type: actor.type,
        id: actor.id,
        organizationId: actor.organizationId,
        organizationName: actor.organizationName ?? null,
        regionCode: actor.regionCode ?? null,
        countryCode: actor.countryCode ?? null,
        role: actor.role ?? null,
        email: actor.email ?? null,
        displayName: actor.displayName ?? null,
        needsSetup: Boolean(actor.needsSetup),
        isSuperAdmin: Boolean(actor.isSuperAdmin),
        billingStatus: actor.billingStatus ?? "pending",
        licenseDecision: actor.licenseDecision ?? null,
        licenseReasonCode: actor.licenseReasonCode ?? null,
        licenseStatus: actor.licenseStatus ?? null
      }
    };
  });

  app.get("/api/v1/organization/integrations/resend/domains", async (request, reply) => {
    try {
      const actor = requireActor(request); requireUserRole(actor, "admin");
      if (!actor.organizationId) return reply.code(409).send({ error: { code: "organization_required", message: "Organization required" } });
      return { data: await listOrganizationResendDomains(db, actor.organizationId) };
    } catch (error) { return sendError(reply, error); }
  });

  app.post("/api/v1/organization/integrations/resend/domains", async (request, reply) => {
    try {
      const actor = requireActor(request); requireUserRole(actor, "admin");
      if (!actor.organizationId || !env.RESEND_CREDENTIAL_ENCRYPTION_KEY) throw new Error("Resend credential encryption is not configured");
      const body = request.body as { domain?: string; apiKey?: string; webhookSecret?: string; fromEmail?: string; fromName?: string; isDefault?: boolean };
      const domain = body.domain?.trim().toLowerCase(); const apiKey = body.apiKey?.trim(); const fromEmail = body.fromEmail?.trim().toLowerCase();
      if (!domain || !apiKey || !fromEmail || !fromEmail.endsWith(`@${domain}`)) return reply.code(400).send({ error: { code: "invalid_resend_domain", message: "Domain, API key, and a sender address on that domain are required" } });
      const validation = await validateResendApiKey(apiKey, domain);
      if (!validation.valid || !validation.verified) return reply.code(422).send({ error: { code: "resend_domain_unverified", message: "Resend credentials are invalid or the domain is not verified" } });
      if (body.isDefault) await db.update(organizationResendDomains).set({ isDefault: false, updatedAt: new Date() }).where(eq(organizationResendDomains.organizationId, actor.organizationId));
      const [created] = await db.insert(organizationResendDomains).values({ organizationId: actor.organizationId, domain, apiKeyCiphertext: encryptResendSecret(apiKey, env.RESEND_CREDENTIAL_ENCRYPTION_KEY), webhookSecretCiphertext: body.webhookSecret ? encryptResendSecret(body.webhookSecret, env.RESEND_CREDENTIAL_ENCRYPTION_KEY) : null, resendDomainId: validation.domainId ?? null, fromEmail, fromName: body.fromName?.trim() || null, verificationStatus: "verified", verifiedAt: new Date(), isDefault: Boolean(body.isDefault) }).returning({ id: organizationResendDomains.id });
      await writeAudit(db, { organizationId: actor.organizationId, actorType: actor.type, actorId: actor.id, action: "resend.domain.create", entityType: "resend_domain", entityId: created.id, metadata: { domain, fromEmail } });
      return reply.code(201).send({ data: { id: created.id, domain, fromEmail, fromName: body.fromName?.trim() || null, verificationStatus: "verified", isDefault: Boolean(body.isDefault), active: true } });
    } catch (error) { return sendError(reply, error); }
  });

  app.post("/api/v1/organization/integrations/resend/domains/:id/default", async (request, reply) => {
    try { const actor = requireActor(request); requireUserRole(actor, "admin"); if (!actor.organizationId) throw new Error("Organization required"); const domain = await getOrganizationResendDomain(db, actor.organizationId, (request.params as { id: string }).id); if (!domain || !domain.active || domain.verificationStatus !== "verified") return reply.code(409).send({ error: { code: "invalid_default_domain", message: "Only active verified domains can be default" } }); await db.update(organizationResendDomains).set({ isDefault: false, updatedAt: new Date() }).where(eq(organizationResendDomains.organizationId, actor.organizationId)); await db.update(organizationResendDomains).set({ isDefault: true, updatedAt: new Date() }).where(and(eq(organizationResendDomains.id, domain.id), eq(organizationResendDomains.organizationId, actor.organizationId))); await writeAudit(db, { organizationId: actor.organizationId, actorType: actor.type, actorId: actor.id, action: "resend.domain.default", entityType: "resend_domain", entityId: domain.id, metadata: { domain: domain.domain } }); return { data: { id: domain.id, isDefault: true } }; } catch (error) { return sendError(reply, error); }
  });

  app.patch("/api/v1/organization/integrations/resend/domains/:id", async (request, reply) => {
    try {
      const actor = requireActor(request);
      requireUserRole(actor, "admin");
      if (!actor.organizationId || !env.RESEND_CREDENTIAL_ENCRYPTION_KEY) throw new Error("Resend credential encryption is not configured");
      const id = (request.params as { id: string }).id;
      const current = await getOrganizationResendDomain(db, actor.organizationId, id);
      if (!current || !current.active) return reply.code(404).send({ error: { code: "not_found", message: "Resend domain not found" } });
      const body = request.body as { fromEmail?: string; fromName?: string | null; apiKey?: string; webhookSecret?: string };
      const fromEmail = body.fromEmail?.trim().toLowerCase();
      const fromName = body.fromName === undefined ? undefined : (body.fromName?.trim() || null);
      const apiKey = body.apiKey?.trim();
      const webhookSecret = body.webhookSecret?.trim();
      if (fromEmail && !fromEmail.endsWith(`@${current.domain}`)) {
        return reply.code(400).send({ error: { code: "invalid_resend_domain", message: "Sender address must use the connected domain" } });
      }
      if (!fromEmail && fromName === undefined && !apiKey && !webhookSecret) {
        return reply.code(400).send({ error: { code: "invalid_resend_domain", message: "No updates were provided" } });
      }
      const updates: {
        fromEmail?: string;
        fromName?: string | null;
        apiKeyCiphertext?: string;
        webhookSecretCiphertext?: string | null;
        resendDomainId?: string | null;
        verificationStatus?: string;
        verifiedAt?: Date;
        lastValidatedAt?: Date;
        rotatedAt?: Date;
        updatedAt: Date;
      } = { updatedAt: new Date() };
      if (fromEmail) updates.fromEmail = fromEmail;
      if (fromName !== undefined) updates.fromName = fromName;
      if (apiKey) {
        const validation = await validateResendApiKey(apiKey, current.domain);
        if (!validation.valid || !validation.verified) {
          return reply.code(422).send({ error: { code: "resend_domain_unverified", message: "Resend credentials are invalid or the domain is not verified" } });
        }
        updates.apiKeyCiphertext = encryptResendSecret(apiKey, env.RESEND_CREDENTIAL_ENCRYPTION_KEY);
        updates.resendDomainId = validation.domainId ?? current.resendDomainId;
        updates.verificationStatus = "verified";
        updates.verifiedAt = new Date();
        updates.lastValidatedAt = new Date();
        updates.rotatedAt = new Date();
      }
      if (webhookSecret) {
        updates.webhookSecretCiphertext = encryptResendSecret(webhookSecret, env.RESEND_CREDENTIAL_ENCRYPTION_KEY);
      }
      await db.update(organizationResendDomains).set(updates).where(and(eq(organizationResendDomains.id, id), eq(organizationResendDomains.organizationId, actor.organizationId)));
      await writeAudit(db, {
        organizationId: actor.organizationId,
        actorType: actor.type,
        actorId: actor.id,
        action: "resend.domain.update",
        entityType: "resend_domain",
        entityId: id,
        metadata: {
          domain: current.domain,
          fromEmail: fromEmail ?? current.fromEmail,
          rotatedApiKey: Boolean(apiKey),
          updatedWebhookSecret: Boolean(webhookSecret)
        }
      });
      return {
        data: {
          id,
          domain: current.domain,
          fromEmail: fromEmail ?? current.fromEmail,
          fromName: fromName !== undefined ? fromName : current.fromName,
          verificationStatus: updates.verificationStatus ?? current.verificationStatus,
          isDefault: current.isDefault,
          active: current.active
        }
      };
    } catch (error) { return sendError(reply, error); }
  });

  app.post("/api/v1/organization/integrations/resend/domains/:id/rotate", async (request, reply) => {
    try {
      const actor = requireActor(request); requireUserRole(actor, "admin");
      if (!actor.organizationId || !env.RESEND_CREDENTIAL_ENCRYPTION_KEY) throw new Error("Resend credential encryption is not configured");
      const id = (request.params as { id: string }).id; const current = await getOrganizationResendDomain(db, actor.organizationId, id); const body = request.body as { apiKey?: string };
      if (!current || !body.apiKey?.trim()) return reply.code(404).send({ error: { code: "not_found", message: "Resend domain not found" } });
      const validation = await validateResendApiKey(body.apiKey.trim(), current.domain); if (!validation.valid || !validation.verified) return reply.code(422).send({ error: { code: "resend_domain_unverified", message: "Resend credentials are invalid or the domain is not verified" } });
      await db.update(organizationResendDomains).set({ apiKeyCiphertext: encryptResendSecret(body.apiKey.trim(), env.RESEND_CREDENTIAL_ENCRYPTION_KEY), resendDomainId: validation.domainId ?? current.resendDomainId, verificationStatus: "verified", verifiedAt: new Date(), lastValidatedAt: new Date(), rotatedAt: new Date(), updatedAt: new Date() }).where(and(eq(organizationResendDomains.id, id), eq(organizationResendDomains.organizationId, actor.organizationId)));
      return { data: { id, rotated: true, verificationStatus: "verified" } };
    } catch (error) { return sendError(reply, error); }
  });

  app.delete("/api/v1/organization/integrations/resend/domains/:id", async (request, reply) => {
    try {
      const actor = requireActor(request); requireUserRole(actor, "admin"); if (!actor.organizationId) throw new Error("Organization required");
      const id = (request.params as { id: string }).id; const current = await getOrganizationResendDomain(db, actor.organizationId, id);
      if (!current) return reply.code(404).send({ error: { code: "not_found", message: "Resend domain not found" } });
      if (current.isDefault && current.active) return reply.code(409).send({ error: { code: "default_domain_required", message: "Select another default domain before removing this domain" } });
      await db.delete(organizationResendDomains).where(and(eq(organizationResendDomains.id, id), eq(organizationResendDomains.organizationId, actor.organizationId)));
      await writeAudit(db, { organizationId: actor.organizationId, actorType: actor.type, actorId: actor.id, action: "resend.domain.delete", entityType: "resend_domain", entityId: id, metadata: { domain: current.domain } });
      return { data: { id, deleted: true } };
    } catch (error) { return sendError(reply, error); }
  });

  app.post("/api/v1/organizations", async (request, reply) => {
    try {
      const actor = requireActor(request);
      if (actor.type !== "user") {
        return reply.code(403).send({ error: { code: "forbidden", message: "Users only" } });
      }
      const input = createOrganizationSchema.parse(request.body);

      if (!actor.needsSetup && !actor.isSuperAdmin) {
        if (!actor.organizationId || actor.role !== "admin") {
          return reply.code(409).send({
            error: { code: "conflict", message: "You already belong to a company" }
          });
        }
      }

      const joinAsAdmin = actor.isSuperAdmin
        ? input.joinAsAdmin === true
        : Boolean(actor.needsSetup);

      if (!joinAsAdmin && !actor.isSuperAdmin) {
        return reply.code(403).send({ error: { code: "forbidden", message: "Super admin required" } });
      }

      const subject = actor.hexclaveSubject ?? actor.id;
      const created = await createOrganization(db, {
        name: input.name,
        countryCode: input.countryCode,
        ...(joinAsAdmin
          ? {
              adminSubject: subject,
              email: actor.email,
              displayName: actor.displayName
            }
        : {})
      });
      if (!created.created && joinAsAdmin && created.organization.residencyRegion !== regionForCountry(input.countryCode)) {
        return reply.code(409).send({
          error: {
            code: "region_locked",
            message: "This account already has a residency region and it cannot be changed"
          }
        });
      }
      const billing = await ensureOrganizationBilling(db, created.organization.id);

      if (actor.organizationId === created.organization.id || joinAsAdmin) {
        await enqueueLicenseProvisioning(db, env, {
          externalOrganizationId: created.organization.id,
          organizationName: created.organization.name,
          billingEmail: actor.email,
          externalUserId: created.admin?.id ?? actor.id,
          userSubject: created.admin?.hexclaveSubject ?? subject,
          userEmail: created.admin?.email ?? actor.email,
          userDisplayName: created.admin?.displayName ?? actor.displayName,
          productCode: env.LICENSE_API_PRODUCT_CODE,
          planCode: env.LICENSE_API_PLAN_CODE,
          source: "twiniti-crm"
        });
      }

      let checkoutUrl: string | null = null;
      let checkoutSessionId: string | null = null;
      if (joinAsAdmin) {
        const checkout = await createOrganizationCheckoutSession(db, env, {
          organizationId: created.organization.id,
          customerEmail: actor.email
        });
        checkoutUrl = checkout?.url ?? null;
        checkoutSessionId = checkout?.id ?? null;
      }

      let invitation = null;
      if (input.inviteAdminEmail) {
        const invite = await createInvitation(db, {
          organizationId: created.organization.id,
          email: input.inviteAdminEmail,
          role: "admin",
          invitedByUserId: joinAsAdmin ? created.admin?.id ?? null : actor.organizationId ? actor.id : null
        });
        const emailResult = await sendInviteEmail(env, db, {
          to: input.inviteAdminEmail,
          organizationId: created.organization.id,
          organizationName: created.organization.name,
          role: "admin",
          token: invite.token
        });
        invitation = { ...mapInvitation(invite), ...emailResult };
      }

      await writeAudit(db, {
        organizationId: created.organization.id,
        actorType: actor.type,
        actorId: actor.id,
        action: "organization.create",
        entityType: "organization",
        entityId: created.organization.id,
        metadata: { name: created.organization.name, joinedAsAdmin: joinAsAdmin }
      });

      return {
        data: {
          id: created.organization.id,
          name: created.organization.name,
          regionCode: created.organization.residencyRegion,
          countryCode: input.countryCode,
          createdAt: created.organization.createdAt.toISOString(),
          joinedAsAdmin: joinAsAdmin,
          billingStatus: billing.status,
          licenseProvisioningStatus: billing.licenseProvisioningStatus,
          checkoutUrl,
          checkoutSessionId,
          invitation
        }
      };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/api/v1/organizations", async (request, reply) => {
    try {
      const actor = requireActor(request);
      requireSuperAdmin(actor);
      const rows = await listOrganizations(db);
      return {
        data: rows.map((row) => ({
          id: row.id,
          name: row.name,
          createdAt: row.createdAt.toISOString(),
          memberCount: Number(row.memberCount ?? 0),
          regionCode: row.residencyRegion
        }))
      };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/api/v1/super-admin/dashboard", async (request, reply) => {
    try {
      const actor = requireActor(request);
      requireSuperAdmin(actor);
      const regions: RegionCode[] = ["us", "eu", "uk"];
      const regionalDbs = regions.map((region) => ({ region, db: getDb(regionalDatabaseUrl(env, region)) }));
      const regionalRows = await Promise.all(
        regionalDbs.map(({ region, db: regionalDb }) => withServiceRls(regionalDb, null, (serviceDb) => getSuperAdminDashboard(serviceDb, region)))
      );
      const organizations = regionalRows.flat();
      const now = Date.now();
      const totals = organizations.reduce(
        (summary, row) => {
          summary.organizations += 1;
          summary.users += row.activeUserCount;
          summary.agents += row.agentCount;
          summary.companies += row.companyCount;
          summary.contacts += row.contactCount;
          const billing = row.billingStatus ?? "pending";
          if (billing === "trialing") summary.trialing += 1;
          else if (billing === "active") summary.paid += 1;
          else summary.attention += 1;
          if (row.trialEnd && new Date(row.trialEnd).getTime() > now) summary.trialsEnding += 1;
          return summary;
        },
        { organizations: 0, users: 0, agents: 0, companies: 0, contacts: 0, trialing: 0, paid: 0, attention: 0, trialsEnding: 0 }
      );
      return {
        data: {
          generatedAt: new Date().toISOString(),
          totals,
          organizations: organizations.map((row) => ({
            ...row,
            createdAt: row.createdAt.toISOString(),
            trialEnd: row.trialEnd?.toISOString() ?? null,
            trialConvertedAt: row.trialConvertedAt?.toISOString() ?? null,
            lastStripeEventCreatedAt: row.lastStripeEventCreatedAt?.toISOString() ?? null,
            lastLicenseSyncAt: row.lastLicenseSyncAt?.toISOString() ?? null
          }))
        }
      };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/api/v1/organizations/:id/members", async (request, reply) => {
    try {
      const actor = requireActor(request);
      requireSuperAdmin(actor);
      const { id } = request.params as { id: string };
      const org = await getOrganizationById(db, id);
      if (!org) {
        return reply.code(404).send({ error: { code: "not_found", message: "Company not found" } });
      }
      const members = await listOrgMembers(db, id);
      return { data: members.map(mapMember) };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/api/v1/organizations/:id/invitations", async (request, reply) => {
    try {
      const actor = requireActor(request);
      requireSuperAdmin(actor);
      const { id } = request.params as { id: string };
      const org = await getOrganizationById(db, id);
      if (!org) {
        return reply.code(404).send({ error: { code: "not_found", message: "Company not found" } });
      }
      const invitations = await listPendingInvitations(db, id);
      return { data: invitations.map(mapInvitation) };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/api/v1/organizations/:id/invitations", async (request, reply) => {
    try {
      const actor = requireActor(request);
      requireSuperAdmin(actor);
      const { id } = request.params as { id: string };
      const input = inviteMemberSchema.parse(request.body);
      const org = await getOrganizationById(db, id);
      if (!org) {
        return reply.code(404).send({ error: { code: "not_found", message: "Company not found" } });
      }
      const invite = await createInvitation(db, {
        organizationId: id,
        email: input.email,
        role: input.role,
        invitedByUserId: actor.organizationId ? actor.id : null
      });
      const emailResult = await sendInviteEmail(env, db, {
        to: input.email,
        organizationId: id,
        organizationName: org.name,
        role: input.role,
        token: invite.token
      });
      await writeAudit(db, {
        organizationId: id,
        actorType: actor.type,
        actorId: actor.id,
        action: "organization.invite",
        entityType: "organization_invitation",
        entityId: invite.id,
        metadata: { email: input.email, role: input.role }
      });
      return { data: { ...mapInvitation(invite), ...emailResult } };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/api/v1/organization/members", async (request, reply) => {
    try {
      const actor = requireActor(request);
      requireUserRole(actor, "member");
      const organizationId = requireOrgId(actor);
      const members = await listOrgMembers(db, organizationId);
      return { data: members.map(mapMember) };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.patch("/api/v1/organization/members/:id", async (request, reply) => {
    try {
      const actor = requireActor(request);
      requireUserRole(actor, "admin");
      const organizationId = requireOrgId(actor);
      const { id } = request.params as { id: string };
      const input = updateMemberSchema.parse(request.body);
      const updated = await updateMemberRole(db, organizationId, id, input);
      if (!updated) {
        return reply.code(404).send({ error: { code: "not_found", message: "Member not found" } });
      }
      await audit(db, actor, "organization.member.update", "crm_user", id, input);
      return { data: mapMember(updated) };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/api/v1/organization/invitations", async (request, reply) => {
    try {
      const actor = requireActor(request);
      requireUserRole(actor, "admin");
      const organizationId = requireOrgId(actor);
      const invitations = await listPendingInvitations(db, organizationId);
      return { data: invitations.map(mapInvitation) };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/api/v1/organization/invitations", async (request, reply) => {
    try {
      const actor = requireActor(request);
      requireUserRole(actor, "admin");
      const organizationId = requireOrgId(actor);
      const input = inviteMemberSchema.parse(request.body);
      const org = await getOrganizationById(db, organizationId);
      if (!org) {
        return reply.code(404).send({ error: { code: "not_found", message: "Company not found" } });
      }
      const invite = await createInvitation(db, {
        organizationId,
        email: input.email,
        role: input.role,
        invitedByUserId: actor.id
      });
      const emailResult = await sendInviteEmail(env, db, {
        to: input.email,
        organizationId,
        organizationName: org.name,
        role: input.role,
        token: invite.token
      });
      await audit(db, actor, "organization.invite", "organization_invitation", invite.id, {
        email: input.email,
        role: input.role
      });
      return { data: { ...mapInvitation(invite), ...emailResult } };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/api/v1/invitations/accept", async (request, reply) => {
    try {
      const actor = requireActor(request);
      if (actor.type !== "user") {
        return reply.code(403).send({ error: { code: "forbidden", message: "Users only" } });
      }
      if (!actor.needsSetup) {
        return reply.code(409).send({
          error: { code: "conflict", message: "You already belong to a company" }
        });
      }
      const input = acceptInvitationSchema.parse(request.body);
      const subject = actor.hexclaveSubject ?? actor.id;
      const result = await acceptInvitation(db, {
        token: input.token,
        subject,
        email: actor.email,
        displayName: actor.displayName
      });
      await writeAudit(db, {
        organizationId: result.organizationId,
        actorType: actor.type,
        actorId: result.user.id,
        action: "organization.invite.accept",
        entityType: "crm_user",
        entityId: result.user.id
      });
      return {
        data: {
          organizationId: result.organizationId,
          organizationName: result.organizationName,
          role: result.user.role,
          userId: result.user.id
        }
      };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/api/v1/invitations/:token", async (request, reply) => {
    try {
      requireActor(request);
      const { token } = request.params as { token: string };
      const found = await findInvitationByToken(db, token);
      if (!found || found.invitation.acceptedAt) {
        return reply.code(404).send({ error: { code: "not_found", message: "Invitation not found" } });
      }
      if (found.invitation.expiresAt.getTime() < Date.now()) {
        return reply.code(410).send({ error: { code: "gone", message: "Invitation expired" } });
      }
      return {
        data: {
          email: found.invitation.email,
          role: found.invitation.role,
          organizationName: found.organizationName,
          expiresAt: found.invitation.expiresAt.toISOString()
        }
      };
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
