import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const failures = [];

function read(relativePath) {
  const file = path.join(root, relativePath);
  if (!fs.existsSync(file)) {
    failures.push(`Missing required policy file: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(file, "utf8");
}

const packageJson = JSON.parse(read("package.json") || "{}");
const changelog = read("CHANGELOG.md");
const ci = read(".github/workflows/ci.yml");
const promotion = read(".github/workflows/production-promotion.yml");
const devBlueprint = read("render.yaml");
const prodBlueprint = read("render.production.yaml");

if (!/^0\.10\.\d+$/.test(String(packageJson.version ?? ""))) {
  failures.push(`Package version must remain a confirmed pre-1.0 0.10.x version: ${packageJson.version ?? "missing"}`);
}

const escapedVersion = String(packageJson.version ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
if (!new RegExp(`^## \\[${escapedVersion}\\]`, "m").test(changelog)) {
  failures.push(`CHANGELOG.md has no entry for package version ${packageJson.version ?? "missing"}`);
}

for (const required of [
  "docs/RELEASE_POLICY.md",
  "docs/DATABASE_CHANGE_POLICY.md",
  ".github/CODEOWNERS",
  ".github/pull_request_template.md",
  ".github/workflows/policy-check.yml",
  ".github/workflows/production-promotion.yml",
  ".github/workflows/e2e.yml"
]) read(required);

if (!/branches:\s*\[main,\s*development,\s*production\]/m.test(ci)) {
  failures.push("CI must run on main, development, and production pushes");
}
if (!/pull_request:/m.test(ci)) failures.push("CI must run for pull requests");
if (!/E2E \/ development-smoke/m.test(promotion)) {
  failures.push("Production promotion must require the exact successful Development E2E check");
}
if (/DATABASE_URL_Prod_/m.test(devBlueprint)) failures.push("Development Blueprint contains a production database key");
if (/DATABASE_URL_Dev_/m.test(prodBlueprint)) failures.push("Production Blueprint contains a development database key");

const baseRef = process.env.GITHUB_BASE_REF;
const headRef = process.env.GITHUB_HEAD_REF;
if (baseRef === "production" && headRef !== "development") {
  failures.push(`Production pull requests must originate from development; received ${headRef || "unknown"}`);
}

if (failures.length) {
  console.error("Release policy check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Release policy check passed for Twiniti CRM ${packageJson.version}`);
