import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractContactEmailDomain,
  extractEmailDomainFromAddress,
  normalizeDomain
} from "../src/repositories.js";

describe("contact email domain extraction", () => {
  it("extracts domain from email address", () => {
    assert.equal(extractEmailDomainFromAddress("ada@Walbridge.com"), "walbridge.com");
    assert.equal(extractEmailDomainFromAddress("invalid"), null);
  });

  it("prefers email_domain property over email address", () => {
    assert.equal(
      extractContactEmailDomain("person@gmail.com", { email_domain: "walbridge.com" }),
      "walbridge.com"
    );
  });

  it("falls back to email address when property is absent", () => {
    assert.equal(extractContactEmailDomain("person@walbridge.com", {}), "walbridge.com");
  });

  it("normalizes domains consistently", () => {
    assert.equal(normalizeDomain("WWW.Example.COM"), "example.com");
  });
});
