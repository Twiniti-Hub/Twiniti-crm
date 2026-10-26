import type { AppEnv } from "@twiniti/config";
import {
  createInvitation,
  deleteOrganizationSignupRollback,
  type Db
} from "@twiniti/db";

export type OrganizationAdminInviteEmailInput = {
  to: string;
  organizationId: string;
  organizationName: string;
  role: string;
  token: string;
};

export type OrganizationAdminInviteEmailResult = {
  inviteUrl: string;
  sent: true;
};

export type OrganizationAdminInviteLogger = {
  error: (context: Record<string, unknown>, message: string) => void;
};

export type OrganizationAdminInviteDeps = {
  createInvitationFn?: typeof createInvitation;
  rollbackFn?: typeof deleteOrganizationSignupRollback;
};

export async function createAndSendOrganizationAdminInvite(
  db: Db,
  env: AppEnv,
  input: {
    organizationId: string;
    organizationName: string;
    email: string;
    invitedByUserId: string | null;
    rollbackOnSendFailure: boolean;
  },
  sendInviteEmailFn: (
    env: AppEnv,
    db: Db,
    invite: OrganizationAdminInviteEmailInput
  ) => Promise<OrganizationAdminInviteEmailResult>,
  log: OrganizationAdminInviteLogger,
  deps: OrganizationAdminInviteDeps = {}
) {
  const createInvitationImpl = deps.createInvitationFn ?? createInvitation;
  const rollbackImpl = deps.rollbackFn ?? deleteOrganizationSignupRollback;

  const invite = await createInvitationImpl(db, {
    organizationId: input.organizationId,
    email: input.email,
    role: "admin",
    invitedByUserId: input.invitedByUserId
  });

  try {
    const emailResult = await sendInviteEmailFn(env, db, {
      to: input.email,
      organizationId: input.organizationId,
      organizationName: input.organizationName,
      role: "admin",
      token: invite.token
    });
    return { invite, emailResult };
  } catch (error) {
    if (input.rollbackOnSendFailure) {
      await rollbackImpl(db, input.organizationId);
    }
    log.error(
      {
        organizationId: input.organizationId,
        error: error instanceof Error ? error.message : "Invite email send failed"
      },
      "Organization admin invite email failed during organization create"
    );
    throw error;
  }
}
