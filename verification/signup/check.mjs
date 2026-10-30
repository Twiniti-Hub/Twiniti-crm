/**
 * Ties the signup residency model to the code.
 * Fails if regionForCountry drifts from the published map, or if the
 * create path can replace a stored residency region.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { regionForCountry } from "../../packages/contracts/src/index.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const expected = { GB: "uk", DE: "eu", FR: "eu", US: "us", CA: "us", AU: "us" };

for (const [country, region] of Object.entries(expected)) {
  assert.equal(regionForCountry(country), region, `${country} must stay in ${region}`);
}

const createOrg = readFileSync(join(root, "packages/db/src/repositories.ts"), "utf8");
const createFn = createOrg.slice(createOrg.indexOf("export async function createOrganization"));
const earlyReturn = createFn.indexOf("if (existing[0]) return {");
const insert = createFn.indexOf("await db.insert(organizations)");
assert.ok(earlyReturn > 0 && insert > earlyReturn, "existing subject returns before insert");
const beforeInsert = createFn.slice(0, insert);
assert.equal(
  beforeInsert.includes(".set("),
  false,
  "an existing workspace must not be updated before the insert"
);
assert.match(
  createFn.slice(insert, insert + 400),
  /residencyRegion/,
  "residency is written on the insert of a new workspace"
);
assert.equal(
  createFn.includes("residencyRegion:"),
  true
);
const updates = createFn.match(/\.update\(organizations\)/g);
assert.equal(updates, null, "createOrganization must not update organizations");

const route = readFileSync(join(root, "apps/api/src/routes/organizations.ts"), "utf8");
const post = route.slice(route.indexOf('app.post("/api/v1/organizations"'));
const lock = post.indexOf('code: "region_locked"');
const checkout = post.indexOf("createOrganizationCheckoutSession");
assert.ok(lock > 0 && checkout > lock, "region lock is checked before checkout");
assert.match(
  post,
  /!created\.created && joinAsAdmin && created\.organization\.residencyRegion !== regionForCountry\(input\.countryCode\)/
);

console.log("signup residency check passed");
