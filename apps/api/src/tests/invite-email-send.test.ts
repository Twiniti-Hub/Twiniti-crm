import assert from "node:assert/strict";
import { test } from "node:test";
import type { AppEnv } from "@twiniti/config";
import type { Db } from "@twiniti/db";
import { encryptResendSecret } from "@twiniti/email";
import { buildInviteEmailContent, sendInviteEmail } from "../routes/organizations.js";

const resendEncryptionKey = Buffer.alloc(32, 7).toString("base64");

test("sendInviteEmail sends escaped HTML from buildInviteEmailContent", async () => {
  const captured: { html?: string; subject?: string; text?: string } = {};
  const organizationName = `<script>alert(1)</script> & "Corp"`;
  const role = `member"><img onerror=alert(1)>`;
  const token = "invite-token-abc";
  const env = {
    WEB_ORIGIN: "https://app.example.com",
    RESEND_CREDENTIAL_ENCRYPTION_KEY: resendEncryptionKey
  } as AppEnv;

  const result = await sendInviteEmail(
    env,
    {} as Db,
    {
      to: "user@example.com",
      organizationId: "org-123",
      organizationName,
      role,
      token
    },
    undefined,
    {
      getDefaultOrganizationResendDomain: async () => ({
        apiKeyCiphertext: encryptResendSecret("test-resend-api-key", resendEncryptionKey),
        fromEmail: "invites@example.com",
        fromName: "Twiniti Loop"
      }),
      sendEmailDeps: {
        send: async (payload) => {
          captured.html = typeof payload.html === "string" ? payload.html : undefined;
          captured.subject = payload.subject;
          captured.text = typeof payload.text === "string" ? payload.text : undefined;
          return { data: { id: "email-sent" } };
        }
      }
    }
  );

  assert.equal(result.sent, true);
  assert.ok(captured.html);
  assert.ok(captured.subject);
  assert.ok(captured.text);

  const expected = buildInviteEmailContent({
    organizationName,
    role,
    inviteUrl: result.inviteUrl
  });
  assert.equal(captured.html, expected.html);
  assert.equal(captured.subject, expected.subject);
  assert.equal(captured.text, expected.text);
  assert.doesNotMatch(captured.html, /<script>/);
});
