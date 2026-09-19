import assert from "node:assert/strict";
import test from "node:test";
import { hasHexclaveSessionCookie, resolveWebSurface } from "./surface";

const sessionCookie =
  "__Host-hexclave-refresh-proj_test--default=%7B%22refresh_token%22%3A%22rt%22%2C%22updated_at_millis%22%3A1%7D";

test("anonymous / stays on the marketing landing surface", () => {
  assert.equal(resolveWebSurface("/", null), "landing");
  assert.equal(resolveWebSurface("/", "twiniti_surface=app"), "landing");
});

test("signed-in / serves the CRM app so post-login does not re-prompt", () => {
  assert.equal(resolveWebSurface("/", sessionCookie), "app");
  assert.equal(
    resolveWebSurface("/", `twiniti_surface=landing; ${sessionCookie}`),
    "app"
  );
});

test("auth and CRM paths always use the app origin", () => {
  assert.equal(resolveWebSurface("/sign-in", null), "app");
  assert.equal(resolveWebSurface("/overview", null), "app");
  assert.equal(resolveWebSurface("/contacts", sessionCookie), "app");
});

test("robots and sitemap stay on the landing origin", () => {
  assert.equal(resolveWebSurface("/robots.txt", sessionCookie), "landing");
  assert.equal(resolveWebSurface("/sitemap.xml", null), "landing");
});

test("branding and assets preserve app surface instead of flipping to landing", () => {
  assert.equal(resolveWebSurface("/branding/loop-logo-light.png", "twiniti_surface=app"), "app");
  assert.equal(resolveWebSurface("/assets/index.js", "twiniti_surface=app"), "app");
  assert.equal(resolveWebSurface("/branding/loop-logo-light.png", sessionCookie), "app");
  assert.equal(resolveWebSurface("/branding/loop-logo-light.png", null), "landing");
  assert.equal(resolveWebSurface("/assets/index.js", null), "landing");
});

test("detects Hexclave and legacy Stack refresh cookies", () => {
  assert.equal(hasHexclaveSessionCookie(sessionCookie), true);
  assert.equal(hasHexclaveSessionCookie("hexclave-refresh-abc--default=x"), true);
  assert.equal(hasHexclaveSessionCookie("stack-refresh-abc=legacy"), true);
  assert.equal(hasHexclaveSessionCookie("twiniti_surface=app"), false);
  assert.equal(hasHexclaveSessionCookie(null), false);
});

test("signed-in /overview stays on the CRM app for post-login redirects", () => {
  assert.equal(resolveWebSurface("/overview", null), "app");
  assert.equal(resolveWebSurface("/overview", sessionCookie), "app");
});
