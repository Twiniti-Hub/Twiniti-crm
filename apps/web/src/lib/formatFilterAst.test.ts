import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatFilterAst } from "./formatFilterAst.js";

describe("formatFilterAst", () => {
  it("formats a simple equals filter", () => {
    const text = formatFilterAst({
      op: "and",
      children: [{ op: "eq", field: "lifecycle_stage", value: "lead" }]
    });
    assert.equal(text, "Lifecycle stage equals lead");
  });

  it("formats property-backed filters with labels", () => {
    const text = formatFilterAst(
      { op: "and", children: [{ op: "contains", field: "properties.jobtitle", value: "Analyst" }] },
      { jobtitle: "Job title" }
    );
    assert.equal(text, "Job title contains Analyst");
  });
});
