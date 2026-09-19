import assert from "node:assert/strict";
import test from "node:test";
import {
  hasHexclaveSessionCookie,
  POST_AUTH_APP_PATH,
  safeAfterSignInPath
} from "./postAuthNavigation";

test("detects Hexclave refresh cookies in a document.cookie string", () => {
  assert.equal(
    hasHexclaveSessionCookie("__Host-hexclave-refresh-proj--default=%7B%7D"),
    true
  );
  assert.equal(hasHexclaveSessionCookie("hexclave-refresh-proj--default=x"), true);
  assert.equal(hasHexclaveSessionCookie("stack-refresh-proj=legacy"), true);
  assert.equal(hasHexclaveSessionCookie("twiniti_surface=app"), false);
});

test("safeAfterSignInPath rejects open redirects and maps / to the app surface", () => {
  assert.equal(safeAfterSignInPath(null), POST_AUTH_APP_PATH);
  assert.equal(safeAfterSignInPath(""), POST_AUTH_APP_PATH);
  assert.equal(safeAfterSignInPath("/"), POST_AUTH_APP_PATH);
  assert.equal(safeAfterSignInPath("//evil.example"), POST_AUTH_APP_PATH);
  assert.equal(safeAfterSignInPath("/contacts"), "/contacts");
});
