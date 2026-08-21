import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { agentPullRequestAuthorFailure } from "./github-bot-identity.mjs";

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
  "AGENTS.md",
  "docs/RELEASE_POLICY.md",
  "docs/DATABASE_CHANGE_POLICY.md",
  "docs/operations/CLOUD_AGENT_GITHUB_IDENTITY.md",
  ".github/CODEOWNERS",
  ".github/pull_request_template.md",
  ".github/workflows/policy-check.yml",
  ".github/workflows/production-promotion.yml",
  ".github/workflows/e2e.yml",
  ".cursor/hooks/assert-github-bot-identity.mjs"
]) read(required);

const agentsMd = read("AGENTS.md");
const identityDoc = read("docs/operations/CLOUD_AGENT_GITHUB_IDENTITY.md");
const releasePolicy = read("docs/RELEASE_POLICY.md");
if (!/TWINITI_CODE_BOT_GITHUB_TOKEN/.test(agentsMd) || !/ManagePullRequest/.test(agentsMd)) {
  failures.push("AGENTS.md must require TWINITI_CODE_BOT_GITHUB_TOKEN gh PRs and forbid ManagePullRequest");
}
if (!/ManagePullRequest/.test(identityDoc) || !/twiniti-code-bot/.test(identityDoc)) {
  failures.push("CLOUD_AGENT_GITHUB_IDENTITY.md must document the ManagePullRequest authorship trap");
}
if (!/TWINITI_CODE_BOT_GITHUB_TOKEN/.test(releasePolicy)) {
  failures.push("RELEASE_POLICY.md must name TWINITI_CODE_BOT_GITHUB_TOKEN");
}

const authorFailure = agentPullRequestAuthorFailure({
  eventName: process.env.GITHUB_EVENT_NAME,
  headRef: process.env.GITHUB_HEAD_REF,
  prAuthor: process.env.PR_AUTHOR || process.env.GITHUB_ACTOR
});
if (authorFailure) failures.push(authorFailure);

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
