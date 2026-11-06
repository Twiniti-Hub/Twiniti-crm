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
const earlyPersonal = createFn.indexOf('if (workspaceKind === "personal" && sameKind)');
const earlyCompany = createFn.indexOf("if (existingByKey[0])");
const earlyReturn = Math.min(
  earlyPersonal > 0 ? earlyPersonal : Number.POSITIVE_INFINITY,
  earlyCompany > 0 ? earlyCompany : Number.POSITIVE_INFINITY
);
const insert = createFn.indexOf("await db.insert(organizations)");
assert.ok(Number.isFinite(earlyReturn) && insert > earlyReturn, "existing subject returns before insert");
const beforeInsert = createFn.slice(0, insert);
assert.equal(
  beforeInsert.includes(".set("),
  false,
  "an existing workspace must not be updated before the insert"
);
assert.match(createFn, /organizationProvisioningKey/, "personal and company use distinct provisioning keys");
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

const licenseEnqueue = post.indexOf("enqueueLicenseProvisioning");
assert.ok(licenseEnqueue > lock && checkout > licenseEnqueue, "license provisioning is queued after the region lock and before checkout");

const billing = readFileSync(join(root, "apps/api/src/routes/billing.ts"), "utf8");
const webhook = billing.slice(billing.indexOf('app.post("/api/v1/webhooks/stripe"'));
const completed = webhook.indexOf('case "checkout.session.completed"');
const sync = webhook.indexOf("enqueueLicenseSubscriptionSync");
assert.ok(completed > 0 && sync > completed, "a completed checkout enqueues a license subscription sync");

const jobs = readFileSync(join(root, "apps/api/src/license-jobs.ts"), "utf8");
const syncFn = jobs.slice(jobs.indexOf("export async function processLicenseSubscriptionSync"));
assert.match(syncFn, /licenseProvisioningStatus: "provisioned"/, "subscription sync marks the license provisioned");
assert.match(syncFn, /synchronizeSubscriptionState/, "subscription sync updates the license server");

console.log("signup residency check passed");
