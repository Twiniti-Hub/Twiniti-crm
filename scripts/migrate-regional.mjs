import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const deploymentEnvironment = process.env.DEPLOYMENT_ENV
  ?? (process.env.NODE_ENV === "production" ? "production" : "development");
if (!["development", "production"].includes(deploymentEnvironment)) {
  console.error(`[db:migrate:regional] Unsupported DEPLOYMENT_ENV: ${deploymentEnvironment}`);
  process.exit(1);
}

if (deploymentEnvironment === "production" && process.env.MIGRATION_APPROVED !== "true") {
  console.error("[db:migrate:regional] Production migrations require protected-environment approval");
  process.exit(1);
}
if (deploymentEnvironment === "production" && !process.env.MIGRATION_CHANGE_ID?.trim()) {
  console.error("[db:migrate:regional] Production migrations require MIGRATION_CHANGE_ID");
  process.exit(1);
}

const suffix = deploymentEnvironment === "production" ? "Prod" : "Dev";
const targets = [
  ["us", process.env[`DATABASE_URL_${suffix}_US`]],
  ["eu", process.env[`DATABASE_URL_${suffix}_EU`]],
  ["uk", process.env[`DATABASE_URL_${suffix}_UK`]]
];
const missing = targets.filter(([, url]) => !url?.trim()).map(([region]) => region);
if (missing.length) {
  console.error(`[db:migrate:regional] Missing ${deploymentEnvironment} database URL for: ${missing.join(", ")}`);
  process.exit(1);
}

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: false,
    env
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log("[db:migrate:regional] Validating the canonical migration chain");
run(process.execPath, [path.join(root, "scripts/policy/check-migration-chain.mjs"), "--strict"]);

console.log(`[db:migrate:regional] Verifying all ${deploymentEnvironment} regional schemas before migration`);
run(process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["--filter", "@twiniti/db", "db:verify:regional", "--", "--allow-migration-prefix"]);

const startedAt = new Date().toISOString();
const results = [];
for (const [region, url] of targets) {
  console.log(`[db:migrate:regional] Applying migrations to ${region}`);
  const result = spawnSync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["--filter", "@twiniti/db", "db:migrate"], {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, DATABASE_URL: url }
  });
  if (result.status !== 0) {
    console.error(`[db:migrate:regional] Migration failed for ${region}; rollout stopped`);
    process.exit(result.status ?? 1);
  }
  results.push({ region, status: "migrated" });
}

console.log(`[db:migrate:regional] Verifying all ${deploymentEnvironment} regional schemas after migration`);
run(process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["--filter", "@twiniti/db", "db:verify:regional"]);

const receipt = {
  schemaVersion: 1,
  deploymentEnvironment,
  changeId: process.env.MIGRATION_CHANGE_ID ?? null,
  commitSha: process.env.GITHUB_SHA ?? null,
  startedAt,
  completedAt: new Date().toISOString(),
  regions: results
};
const receiptPath = process.env.MIGRATION_RECEIPT_PATH;
if (receiptPath) fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
console.log(`[db:migrate:regional] All regional databases reached the current migration level (${results.length} regions)`);
