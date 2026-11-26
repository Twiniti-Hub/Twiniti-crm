import assert from "node:assert/strict";
import test from "node:test";
import { shouldMountHexclaveAuthShell } from "./hexclaveShellMount.js";

const anonymousFunnelPaths = ["/", "/pricing", "/sign-up"];

test("shouldMountHexclaveAuthShell is true for public funnel paths when auth is on", () => {
  for (const pathname of anonymousFunnelPaths) {
    assert.equal(
      shouldMountHexclaveAuthShell(true, true),
      true,
      `expected Hexclave shell for ${pathname}`
    );
  }
});

test("shouldMountHexclaveAuthShell is false without a configured Hexclave app", () => {
  assert.equal(shouldMountHexclaveAuthShell(true, false), false);
  assert.equal(shouldMountHexclaveAuthShell(false, true), false);
});