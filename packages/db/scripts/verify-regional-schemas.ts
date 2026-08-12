import { Pool } from "@neondatabase/serverless";

type Region = "US" | "EU" | "UK";

const environment = process.env.DEPLOYMENT_ENV === "production" ? "Prod" : "Dev";
const targets = (["US", "EU", "UK"] as Region[]).map((region) => ({
  region,
  url: process.env[`DATABASE_URL_${environment}_${region}`]
}));
const missing = targets.filter((target) => !target.url?.trim()).map((target) => target.region);
const allowMigrationPrefix = process.argv.includes("--allow-migration-prefix");

if (missing.length) throw new Error(`Missing ${environment} database URL for: ${missing.join(", ")}`);

async function snapshot(url: string) {
  const pool = new Pool({ connectionString: url, max: 2 });
  try {
    const [migrations, columns, indexes, policies, roles] = await Promise.all([
      pool.query("SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id"),
      pool.query(`SELECT table_schema, table_name, column_name, data_type, udt_name, is_nullable, column_default
        FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_schema, table_name, column_name`),
      pool.query("SELECT schemaname, tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' ORDER BY schemaname, tablename, indexname"),
      pool.query(`SELECT schemaname, tablename, policyname, permissive, roles::text, cmd, qual, with_check
        FROM pg_policies WHERE schemaname = 'public' ORDER BY schemaname, tablename, policyname`),
      pool.query("SELECT rolname, rolbypassrls FROM pg_roles WHERE rolname = 'twiniti_app'")
    ]);
    return {
      migrations: migrations.rows,
      columns: columns.rows,
      indexes: indexes.rows,
      policies: policies.rows,
      roles: roles.rows
    };
  } finally {
    await pool.end();
  }
}

const snapshots = await Promise.all(targets.map(async (target) => ({
  region: target.region,
  snapshot: await snapshot(target.url!)
})));
const canonical = JSON.stringify(snapshots[0]?.snapshot);
let mismatches: Region[];

if (allowMigrationPrefix) {
  const longest = snapshots.reduce((candidate, target) =>
    target.snapshot.migrations.length > candidate.snapshot.migrations.length ? target : candidate
  ).snapshot.migrations;
  const validPrefixes = snapshots.every((target) => target.snapshot.migrations.every((entry, index) =>
    JSON.stringify(entry) === JSON.stringify(longest[index])
  ));
  const byLedger = new Map<string, typeof snapshots>();
  for (const target of snapshots) {
    const key = JSON.stringify(target.snapshot.migrations);
    byLedger.set(key, [...(byLedger.get(key) ?? []), target]);
  }
  const structurallyMismatched = [...byLedger.values()].flatMap((group) => {
    const expected = JSON.stringify({ ...group[0]!.snapshot, migrations: [] });
    return group
      .filter((target) => JSON.stringify({ ...target.snapshot, migrations: [] }) !== expected)
      .map((target) => target.region);
  });
  mismatches = validPrefixes ? structurallyMismatched : snapshots.map((target) => target.region);
} else {
  mismatches = snapshots.filter((target) => JSON.stringify(target.snapshot) !== canonical).map((target) => target.region);
}

console.log(JSON.stringify({ environment, allowMigrationPrefix, regions: snapshots.map((target) => target.region), schemaMatch: mismatches.length === 0, mismatches }, null, 2));
if (mismatches.length) process.exit(1);
