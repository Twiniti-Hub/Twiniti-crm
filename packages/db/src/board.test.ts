import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CONTACT_LIFECYCLE_LANES,
  COMPANY_LIFECYCLE_LANES,
  decodeBoardCursor,
  encodeBoardCursor,
  laneValueForWrite,
  normalizeStageSlug,
  resolveLaneId
} from "./board.js";

describe("board lane mapping", () => {
  it("maps blank and null to Unassigned", () => {
    assert.equal(resolveLaneId(CONTACT_LIFECYCLE_LANES, null), "unassigned");
    assert.equal(resolveLaneId(CONTACT_LIFECYCLE_LANES, ""), "unassigned");
    assert.equal(resolveLaneId(CONTACT_LIFECYCLE_LANES, "   "), "unassigned");
  });

  it("matches HubSpot slugs case-insensitively", () => {
    assert.equal(resolveLaneId(CONTACT_LIFECYCLE_LANES, "customer"), "customer");
    assert.equal(resolveLaneId(CONTACT_LIFECYCLE_LANES, "Customer"), "customer");
    assert.equal(resolveLaneId(CONTACT_LIFECYCLE_LANES, "marketingqualifiedlead"), "marketingqualifiedlead");
    assert.equal(resolveLaneId(COMPANY_LIFECYCLE_LANES, "former_customer"), "former_customer");
  });

  it("sends unknown values to Other", () => {
    assert.equal(resolveLaneId(CONTACT_LIFECYCLE_LANES, "Custom Stage"), "other");
    assert.equal(resolveLaneId(COMPANY_LIFECYCLE_LANES, "vendor"), "other");
  });

  it("writes concrete lane values and rejects Other", () => {
    assert.deepEqual(laneValueForWrite(CONTACT_LIFECYCLE_LANES, "lead"), { ok: true, value: "lead" });
    assert.deepEqual(laneValueForWrite(CONTACT_LIFECYCLE_LANES, "unassigned"), { ok: true, value: null });
    assert.equal(laneValueForWrite(CONTACT_LIFECYCLE_LANES, "other").ok, false);
  });

  it("normalizes stage slugs", () => {
    assert.equal(normalizeStageSlug(" Lead "), "lead");
    assert.equal(normalizeStageSlug(null), null);
  });

  it("round-trips board cursors", () => {
    const updatedAt = new Date("2026-08-13T12:00:00.000Z");
    const encoded = encodeBoardCursor(updatedAt, "11111111-1111-1111-1111-111111111111");
    const decoded = decodeBoardCursor(encoded);
    assert.ok(decoded);
    assert.equal(decoded.id, "11111111-1111-1111-1111-111111111111");
    assert.equal(decoded.updatedAt.toISOString(), updatedAt.toISOString());
  });
});
