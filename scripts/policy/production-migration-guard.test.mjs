import assert from "node:assert/strict";
import test from "node:test";
import {
  assertProductionMigrationGuard,
  productionMigrationGuardFailures
} from "./production-migration-guard.mjs";

const validProduction = {
  environment: "production",
  approved: "true",
  changeId: "TWI-1109",
  backupReference: "Neon PITR verified 2026-11-16T17:30Z",
  confirmation: "MIGRATE PRODUCTION",
  sourceRef: "refs/heads/production",
  databaseUrls: [
    { region: "US", url: "postgresql://user:pass@ep-example.us-east-2.aws.neon.tech/neondb" }
  ]
};

test("accepts a fully evidenced production migration", () => {
  assert.doesNotThrow(() => assertProductionMigrationGuard(validProduction));
});

test("rejects production without every safety gate", () => {
  const failures = productionMigrationGuardFailures({
    environment: "production",
    approved: "false",
    changeId: " ",
    backupReference: "",
    confirmation: "migrate production",
    sourceRef: "refs/heads/development"
  });
  assert.equal(failures.length, 5);
  assert.match(failures.join("\n"), /backup\/PITR/);
  assert.match(failures.join("\n"), /refs\/heads\/production/);
});

test("does not impose production-only gates on development", () => {
  assert.deepEqual(productionMigrationGuardFailures({ environment: "development" }), []);
});

test("rejects pooled application URLs for production migrations", () => {
  const failures = productionMigrationGuardFailures({
    ...validProduction,
    databaseUrls: [
      { region: "US", url: "postgresql://user:pass@ep-example-pooler.us-east-2.aws.neon.tech/neondb" }
    ]
  });
  assert.match(failures.join("\n"), /non-pooled.*US/);
});
