import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ZodError } from "zod";
import { createContactNoteSchema } from "@twiniti/contracts";

describe("createContactNoteSchema", () => {
  it("accepts a trimmed note body", () => {
    const parsed = createContactNoteSchema.parse({ body: "  Called back; interested in trial.  " });
    assert.equal(parsed.body, "Called back; interested in trial.");
  });

  it("rejects an empty body", () => {
    assert.throws(
      () => createContactNoteSchema.parse({ body: "   " }),
      (error: unknown) => error instanceof ZodError
    );
  });

  it("rejects a body longer than 8000 characters", () => {
    assert.throws(
      () => createContactNoteSchema.parse({ body: "x".repeat(8001) }),
      (error: unknown) => error instanceof ZodError
    );
  });
});
