import type { FastifyInstance } from "fastify";
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
  updateMemberRole,
  writeAudit,
  type Db
} from "@twiniti/db";
import { regionForCountry } from "@twiniti/contracts";
import { sendEmail } from "@twiniti/email";
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
  input: { to: string; organizationName: string; role: string; token: string }
) {
  const inviteUrl = `${env.WEB_ORIGIN.replace(/\/$/, "")}/accept-invite?token=${encodeURIComponent(input.token)}`;
  if (!env.RESEND_API_KEY) {
    console.info(`[invite] Resend not configured. Invite URL for ${input.to}: ${inviteUrl}`);
    return { inviteUrl, sent: false as const };
  }
  await sendEmail({
    apiKey: env.RESEND_API_KEY,
    from: env.RESEND_FROM_EMAIL,
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
        const emailResult = await sendInviteEmail(env, {
          to: input.inviteAdminEmail,
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
      const emailResult = await sendInviteEmail(env, {
        to: input.email,
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
      const emailResult = await sendInviteEmail(env, {
        to: input.email,
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
