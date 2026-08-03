import assert from "node:assert/strict";
import test from "node:test";
import { countryCodeSchema, regionForCountry } from "@twiniti/contracts";

test("country routing keeps EU and UK separate", () => {
  assert.equal(regionForCountry(countryCodeSchema.parse("de")), "eu");
  assert.equal(regionForCountry(countryCodeSchema.parse("GB")), "uk");
  assert.equal(regionForCountry(countryCodeSchema.parse("us")), "us");
});

test("country validation rejects unsupported values", () => {
  assert.throws(() => countryCodeSchema.parse("XX"));
});
