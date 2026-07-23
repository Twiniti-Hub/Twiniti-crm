import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyImportFields, mapImportRowsToPropertyDefinitions, parseCsv } from "./csv.js";

describe("contact CSV import", () => {
  it("parses quoted commas, escaped quotes, and CRLF rows", () => {
    const parsed = parseCsv('Email,First Name,Notes\r\nada@example.com,Ada,"Uses, quotes"\r\n');
    assert.deepEqual(parsed.headers, ["Email", "First Name", "Notes"]);
    assert.deepEqual(parsed.rows, [{ Email: "ada@example.com", "First Name": "Ada", Notes: "Uses, quotes" }]);
  });

  it("separates contact columns from defined and undefined properties", () => {
    const fields = classifyImportFields(["Email", "First Name", "Job Title", "Unknown"], ["job_title", "Job Title"]);
    assert.deepEqual(fields.contactFields, ["Email", "First Name"]);
    assert.deepEqual(fields.propertyFields, ["Job Title", "Unknown"]);
    assert.deepEqual(fields.undefinedPropertyFields, ["Unknown"]);
  });

  it("maps a property label to its internal name before import", () => {
    const rows = mapImportRowsToPropertyDefinitions(
      [{ "Email Address": "ada@example.com", "Job Title": "Analyst" }],
      [{ internalName: "jobtitle", label: "Job Title" }]
    );
    assert.deepEqual(rows, [{ "Email Address": "ada@example.com", jobtitle: "Analyst" }]);
  });
});
