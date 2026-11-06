import assert from "node:assert/strict";
import test from "node:test";
import type { AppEnv } from "@twiniti/config";
import type { Db } from "@twiniti/db";
import {
  createAndSendOrganizationAdminInvite,
  type OrganizationAdminInviteLogger
} from "../organization-admin-invite.js";

const env = {} as AppEnv;
const db = {} as Db;

function mockInvite(overrides: Partial<{ id: string; token: string }> = {}) {
  return {
    id: overrides.id ?? "inv_1",
    email: "admin@example.com",
    emailNormalized: "admin@example.com",
    role: "admin",
    token: overrides.token ?? "invite-token-secret",
    organizationId: "org_1",
    invitedByUserId: null,
    expiresAt: new Date("2026-11-01T00:00:00.000Z"),
    acceptedAt: null,
    createdAt: new Date("2026-10-26T00:00:00.000Z")
  };
}

test("createAndSendOrganizationAdminInvite rolls back and logs when send fails for a new org", async () => {
  let rolledBackOrgId: string | null = null;
  const logEntries: Array<{ context: Record<string, unknown>; message: string }> = [];
  const log: OrganizationAdminInviteLogger = {
    error(context, message) {
      logEntries.push({ context, message });
    }
  };

  await assert.rejects(
    () => createAndSendOrganizationAdminInvite(
      db,
      env,
      {
        organizationId: "org_rollback",
        organizationName: "Rollback Co",
        email: "admin@example.com",
        invitedByUserId: null,
        rollbackOnSendFailure: true
      },
      async () => {
        throw new Error("Organization Resend configuration is required before sending invitations");
      },
      log,
      {
        createInvitationFn: async () => mockInvite(),
        rollbackFn: async (_db, organizationId) => {
          rolledBackOrgId = organizationId;
        }
      }
    ),
    (error: unknown) => error instanceof Error
      && error.message.includes("Resend configuration is required")
  );

  assert.equal(rolledBackOrgId, "org_rollback");
  assert.equal(logEntries.length, 1);
  assert.equal(logEntries[0]?.context.organizationId, "org_rollback");
  assert.match(String(logEntries[0]?.context.error), /Resend configuration is required/);
  assert.doesNotMatch(JSON.stringify(logEntries[0]?.context), /invite-token-secret/);
});

test("createAndSendOrganizationAdminInvite persists invite when send succeeds", async () => {
  let rolledBack = false;
  let persistedInviteId: string | null = null;
  const log: OrganizationAdminInviteLogger = { error() {} };

  const result = await createAndSendOrganizationAdminInvite(
    db,
    env,
    {
      organizationId: "org_ok",
      organizationName: "Acme",
      email: "admin@example.com",
      invitedByUserId: "user_1",
      rollbackOnSendFailure: true
    },
    async (_env, _db, input) => {
      assert.equal(input.to, "admin@example.com");
      assert.equal(input.organizationId, "org_ok");
      return { inviteUrl: "https://loop.example/accept-invite?token=abc", sent: true as const };
    },
    log,
    {
      createInvitationFn: async () => {
        const invite = mockInvite({ id: "inv_persisted", token: "token_abc" });
        persistedInviteId = invite.id;
        return invite;
      },
      rollbackFn: async () => {
        rolledBack = true;
      }
    }
  );

  assert.equal(persistedInviteId, "inv_persisted");
  assert.equal(result.invite.id, "inv_persisted");
  assert.equal(result.emailResult.sent, true);
  assert.equal(rolledBack, false);
});
