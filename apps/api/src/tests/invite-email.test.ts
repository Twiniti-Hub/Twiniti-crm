import test from "node:test";
import assert from "node:assert/strict";
import { buildInviteEmailContent } from "../routes/organizations.js";

test("buildInviteEmailContent escapes organization name and role in HTML", () => {
  const maliciousName = `<script>alert(1)</script> & "Corp"`;
  const maliciousRole = `member"><img onerror=alert(1)>`;
  const content = buildInviteEmailContent({
    organizationName: maliciousName,
    role: maliciousRole,
    inviteUrl: "https://app.example.com/accept-invite?token=abc"
  });

  assert.match(content.subject, /<script>/);
  assert.match(content.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; &quot;Corp&quot;/);
  assert.match(content.html, /member&quot;&gt;&lt;img onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(content.html, /<script>/);
  assert.doesNotMatch(content.html, /<img[^>]*onerror/);
  assert.ok(content.text.includes(maliciousName));
});
