import assert from "node:assert/strict";
import { mock, test } from "node:test";
import type { AppEnv } from "@twiniti/config";
import type { Db } from "@twiniti/db";
import { getDefaultOrganizationResendDomain } from "@twiniti/db";
import type { SendEmailInput } from "@twiniti/email";
import { buildInviteEmailContent, sendInviteEmail } from "../routes/organizations.js";

const resendEncryptionKey = Buffer.alloc(32, 7).toString("base64");

test("sendInviteEmail sends escaped HTML from buildInviteEmailContent", async () => {
  const sendEmailMock = mock.fn(async (_input: SendEmailInput) => ({ data: { id: "email-sent" } }));
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
    {
      sendEmail: sendEmailMock,
      getDefaultOrganizationResendDomain: (async () => ({
        apiKeyCiphertext: "test-ciphertext",
        fromEmail: "invites@example.com",
        fromName: "Twiniti Loop"
      })) as unknown as typeof getDefaultOrganizationResendDomain,
      decryptResendSecret: () => "test-resend-api-key"
    }
  );

  assert.equal(result.sent, true);
  assert.equal(sendEmailMock.mock.calls.length, 1);
  const payload = sendEmailMock.mock.calls[0]?.arguments[0];
  assert.ok(payload);
  assert.equal(typeof payload.html, "string");
  assert.equal(typeof payload.subject, "string");
  assert.equal(typeof payload.text, "string");

  const expected = buildInviteEmailContent({
    organizationName,
    role,
    inviteUrl: result.inviteUrl
  });
  assert.equal(payload.html, expected.html);
  assert.equal(payload.subject, expected.subject);
  assert.equal(payload.text, expected.text);
  assert.doesNotMatch(payload.html, /<script>/);
});
