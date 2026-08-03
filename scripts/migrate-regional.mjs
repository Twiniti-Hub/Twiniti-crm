import { spawnSync } from "node:child_process";

const targets = [
  ["us", process.env.DATABASE_URL],
  ["eu", process.env.DATABASE_URL_EU],
  ["uk", process.env.DATABASE_URL_UK]
];

const missing = targets.filter(([, url]) => !url?.trim()).map(([region]) => region);
if (missing.length) {
  console.error(`[db:migrate:regional] Missing configured database URL for: ${missing.join(", ")}`);
  process.exit(1);
}

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
for (const [region, url] of targets) {
  console.log(`[db:migrate:regional] Applying migrations to ${region}`);
  const result = spawnSync(pnpm, ["--filter", "@twiniti/db", "db:migrate"], {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, DATABASE_URL: url }
  });
  if (result.status !== 0) {
    console.error(`[db:migrate:regional] Migration failed for ${region}`);
    process.exit(result.status ?? 1);
  }
}

console.log("[db:migrate:regional] All regional databases are at the current migration level");
