import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mapHubspotContactRow,
  mapHubspotPropertyType,
  normalizeHubspotInternalName
} from "../src/hubspot.js";
import { compileFilterAst, parseFilterAst } from "../src/filters.js";

describe("hubspot property type mapping", () => {
  it("maps enumeration select to enum", () => {
    assert.equal(mapHubspotPropertyType("enumeration", "select"), "enum");
  });
  it("maps bool to boolean", () => {
    assert.equal(mapHubspotPropertyType("bool", "booleancheckbox"), "boolean");
  });
});

describe("hubspot contact row mapping", () => {
  it("maps core fields and defined customs; reports unmapped", () => {
    const defined = new Set(["email", "firstname", "lastname", "lifecyclestage", "jobtitle", "phone"]);
    const mapped = mapHubspotContactRow(
      {
        id: "hs-1",
        email: "ada@example.com",
        firstname: "Ada",
        lastname: "Lovelace",
        lifecyclestage: "customer",
        jobtitle: "Analyst",
        phone: "123",
        mystery: "drop-me"
      },
      defined
    );
    assert.ok(!("error" in mapped));
    if ("error" in mapped) return;
    assert.equal(mapped.email, "ada@example.com");
    assert.equal(mapped.phone, "123");
    assert.equal(mapped.firstName, "Ada");
    assert.equal(mapped.properties.jobtitle, "Analyst");
    assert.ok(!("phone" in mapped.properties));
    assert.ok(!("mystery" in mapped.properties));
    assert.deepEqual(mapped.unmappedKeys, ["mystery"]);
    assert.equal(mapped.externalId, "hs-1");
  });

  it("normalizes internal names", () => {
    assert.equal(normalizeHubspotInternalName("HS Lead Status"), "hs_lead_status");
  });

  it("does not report common CSV contact aliases as unmapped properties", () => {
    const mapped = mapHubspotContactRow(
      {
        "Email Address": "ada@example.com",
        "First Name": "Ada",
        "Last Name": "Lovelace",
        "Lifecycle Stage": "customer",
        "Record ID": "hs-1",
        job_title: "Analyst"
      },
      new Set(["job_title"])
    );
    assert.ok(!("error" in mapped));
    if ("error" in mapped) return;
    assert.equal(mapped.firstName, "Ada");
    assert.equal(mapped.lastName, "Lovelace");
    assert.equal(mapped.lifecycleStage, "customer");
    assert.equal(mapped.externalId, "hs-1");
    assert.deepEqual(mapped.unmappedKeys, []);
  });
});

describe("filter AST", () => {
  it("compiles properties.* fields", () => {
    const ast = parseFilterAst({
      op: "and",
      children: [{ op: "eq", field: "properties.jobtitle", value: "Analyst" }]
    });
    const sql = compileFilterAst(ast);
    assert.ok(sql);
  });
});
