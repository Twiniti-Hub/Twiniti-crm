import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultLanes, formatUpdatedAt } from "./board.js";

describe("web board helpers", () => {
  it("returns default lanes for contacts and companies", () => {
    assert.equal(defaultLanes("contact").some((lane) => lane.id === "marketingqualifiedlead"), true);
    assert.equal(defaultLanes("company").some((lane) => lane.id === "prospect"), true);
  });

  it("formats updated timestamps", () => {
    const formatted = formatUpdatedAt("2026-08-13T12:00:00.000Z");
    assert.notEqual(formatted, "2026-08-13T12:00:00.000Z");
    assert.ok(formatted.length > 0);
  });
});
