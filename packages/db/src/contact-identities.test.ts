import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeEmail, normalizePhone } from "./repositories.js";

describe("contact identity normalization", () => {
  it("normalizes email and phone values for matching", () => {
    assert.equal(normalizeEmail(" Ada@Example.com "), "ada@example.com");
    assert.equal(normalizePhone("+1 (555) 123-4567"), "+15551234567");
    assert.equal(normalizePhone("555.123.4567"), "5551234567");
  });
});
