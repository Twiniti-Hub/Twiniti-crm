import test from "node:test";
import assert from "node:assert/strict";
import { buildWebsiteContactNotification } from "../routes/website-contact.js";

test("buildWebsiteContactNotification includes submitter fields and source", () => {
  const content = buildWebsiteContactNotification({
    email: "visitor@example.com",
    firstName: "Ada",
    lastName: "Lovelace",
    phone: "+1 555 0100",
    message: "Hello <team>",
    source: "get-in-touch-with-us",
    deploymentEnv: "development"
  });

  assert.match(content.subject, /get-in-touch-with-us/);
  assert.match(content.subject, /development/);
  assert.match(content.text, /visitor@example.com/);
  assert.match(content.text, /Ada/);
  assert.match(content.text, /Hello <team>/);
  assert.match(content.html, /Hello &lt;team&gt;/);
  assert.doesNotMatch(content.html, /Hello <team>/);
});
