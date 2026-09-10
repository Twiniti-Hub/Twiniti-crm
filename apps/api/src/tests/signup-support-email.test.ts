import test from "node:test";
import assert from "node:assert/strict";
import { buildSignupSupportNotification } from "../routes/organizations.js";

test("buildSignupSupportNotification includes org and admin details", () => {
  const content = buildSignupSupportNotification({
    organizationId: "org_123",
    organizationName: "Acme <Corp>",
    adminEmail: "jane@example.com",
    adminDisplayName: "Jane Doe",
    countryCode: "US",
    regionCode: "us",
    deploymentEnv: "development"
  });

  assert.match(content.subject, /Acme <Corp>/);
  assert.match(content.subject, /development/);
  assert.match(content.text, /Organization ID: org_123/);
  assert.match(content.text, /Admin email: jane@example.com/);
  assert.match(content.html, /Acme &lt;Corp&gt;/);
  assert.doesNotMatch(content.html, /Acme <Corp>/);
});
