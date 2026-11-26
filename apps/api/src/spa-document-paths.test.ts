import assert from "node:assert/strict";
import test from "node:test";
import { isGuestSpaDocumentPath, isHandlerDocumentPath, normalizeDocumentPath } from "./spa-document-paths.js";

test("normalizeDocumentPath trims trailing slashes", () => {
  assert.equal(normalizeDocumentPath("/pricing/"), "/pricing");
  assert.equal(normalizeDocumentPath("/"), "/");
});

test("isGuestSpaDocumentPath allowlists public funnel paths only", () => {
  assert.equal(isGuestSpaDocumentPath("/sign-up"), true);
  assert.equal(isGuestSpaDocumentPath("/pricing"), true);
  assert.equal(isGuestSpaDocumentPath("/this-does-not-exist-123"), false);
  assert.equal(isGuestSpaDocumentPath("/contacts"), false);
});

test("isHandlerDocumentPath matches Hexclave auth callbacks", () => {
  assert.equal(isHandlerDocumentPath("/handler/email-verification"), true);
  assert.equal(isHandlerDocumentPath("/overview"), false);
});