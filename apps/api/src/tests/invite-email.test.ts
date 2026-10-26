import test from "node:test";
import assert from "node:assert/strict";
import { envSchema } from "@twiniti/config";
import { encryptResendSecret } from "@twiniti/email";
import { buildInviteEmailContent, sendInviteEmail } from "../routes/organizations.js";

const encryptionKey = Buffer.alloc(32, 7).toString("base64");
const orgApiKey = "re_org_test_key";

function baseEnv(overrides: Record<string, string> = {}) {
  return envSchema.parse({
    WEB_ORIGIN: "https://loop.example.com",
    RESEND_CREDENTIAL_ENCRYPTION_KEY: encryptionKey,
    RESEND_API_KEY: "re_platform_test_key",
    PLATFORM_EMAIL_FROM: "Twiniti Loop <noreply@crm.twiniti.ai>",
    ...overrides
  });
}

const inviteInput = {
  to: "invitee@example.com",
  organizationId: "org_123",
  organizationName: "Acme Corp",
  role: "admin",
  token: "invite-token"
};

test("buildInviteEmailContent escapes organization name and role in HTML", () => {
  const maliciousName = `<script>alert(1)</script> & "Corp"`;
  const maliciousRole = `member"><img onerror=alert(1)>`;
  const content = buildInviteEmailContent({
    organizationName: maliciousName,
    role: maliciousRole,
    inviteUrl: "https://app.example.com/accept-invite?token=abc"
  });

  assert.equal(content.subject, "You're invited to scriptalert(1)/script  Corp on Twiniti Loop");
  assert.doesNotMatch(content.subject, /[<>&"]/);
  assert.match(content.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; &quot;Corp&quot;/);
  assert.match(content.html, /member&quot;&gt;&lt;img onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(content.html, /<script>/);
  assert.doesNotMatch(content.html, /<img[^>]*onerror/);
  assert.ok(content.text.includes(maliciousName));
});

test("sendInviteEmail uses the organization Resend sender when a verified default domain exists", async () => {
  const captured: { from?: string; to?: string | string[] } = {};
  const result = await sendInviteEmail(
    baseEnv(),
    {} as never,
    inviteInput,
    undefined,
    {
      getDefaultOrganizationResendDomain: async () => ({
        apiKeyCiphertext: encryptResendSecret(orgApiKey, encryptionKey),
        fromEmail: "team@acme.com",
        fromName: "Acme Team"
      }),
      sendEmailDeps: {
        send: async (payload) => {
          captured.from = String(payload.from);
          captured.to = payload.to as string;
          return { data: { id: "msg_org" } };
        }
      }
    }
  );

  assert.equal(result.sent, true);
  assert.match(result.inviteUrl, /invite-token/);
  assert.equal(captured.from, "Acme Team <team@acme.com>");
  assert.equal(captured.to, "invitee@example.com");
});

test("sendInviteEmail falls back to the platform sender when the org has no verified Resend domain", async () => {
  const captured: { apiKey?: string; from?: string } = {};
  await sendInviteEmail(
    baseEnv(),
    {} as never,
    inviteInput,
    undefined,
    {
      getDefaultOrganizationResendDomain: async () => null,
      sendEmailDeps: {
        send: async (payload) => {
          captured.from = String(payload.from);
          return { data: { id: "msg_platform" } };
        }
      }
    }
  );

  assert.equal(captured.from, "Twiniti Loop <noreply@crm.twiniti.ai>");
});

test("sendInviteEmail fails clearly when neither org nor platform email sender is configured", async () => {
  const warnings: Array<{ obj: unknown; msg?: string }> = [];
  await assert.rejects(
    () => sendInviteEmail(
      baseEnv({ RESEND_API_KEY: "", PLATFORM_EMAIL_FROM: "" }),
      {} as never,
      inviteInput,
      {
        warn: (obj, msg) => {
          warnings.push({ obj, msg });
        }
      },
      {
        getDefaultOrganizationResendDomain: async () => null
      }
    ),
    (error: unknown) => error instanceof Error
      && error.message.includes("platform email sender is not configured")
  );

  assert.equal(warnings.length, 1);
  assert.match(String(warnings[0]?.msg), /platform email sender is not configured/);
});
