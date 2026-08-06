import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const migrationDir = path.join(root, "packages/db/drizzle");
const journalPath = path.join(migrationDir, "meta/_journal.json");
const manifestPath = path.join(migrationDir, "migration-manifest.json");
const strict = process.argv.includes("--strict");
const failures = [];

const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const journalTags = journal.entries.map((entry) => entry.tag);
const manifestEntries = manifest.entries;
const manifestByFile = new Map(manifestEntries.map((entry) => [entry.file, entry]));
const sqlFiles = fs.readdirSync(migrationDir)
  .filter((file) => file.endsWith(".sql"))
  .sort();

if (new Set(journalTags).size !== journalTags.length) failures.push("Drizzle journal contains duplicate migration tags");
if (new Set(manifestEntries.map((entry) => entry.file)).size !== manifestEntries.length) failures.push("Migration manifest contains duplicate files");

for (const file of sqlFiles) {
  const entry = manifestByFile.get(file);
  if (!entry) failures.push(`SQL migration is missing from migration-manifest.json: ${file}`);
  if (entry) {
    const normalized = fs.readFileSync(path.join(migrationDir, file), "utf8").replace(/\r\n/g, "\n");
    const sha256 = crypto.createHash("sha256").update(normalized, "utf8").digest("hex");
    if (sha256 !== entry.sha256) failures.push(`Migration checksum mismatch: ${file}`);
  }
}

for (const entry of manifestEntries) {
  if (!fs.existsSync(path.join(migrationDir, entry.file))) failures.push(`Manifest migration file is missing: ${entry.file}`);
  const tag = entry.file.replace(/\.sql$/, "");
  if (entry.status === "journaled" && !journalTags.includes(tag)) {
    failures.push(`Journaled manifest entry is absent from the Drizzle journal: ${entry.file}`);
  }
  if (["retired-folded", "legacy-unjournaled"].includes(entry.status) && journalTags.includes(tag)) {
    failures.push(`Retired or legacy entry unexpectedly appears in the Drizzle journal: ${entry.file}`);
  }
}

for (const tag of journalTags) {
  const file = `${tag}.sql`;
  const entry = manifestByFile.get(file);
  if (!entry) failures.push(`Drizzle journal entry is missing from the manifest: ${file}`);
  if (entry?.status !== "journaled") failures.push(`Drizzle journal entry is not marked journaled: ${file}`);
}

const unresolved = manifestEntries.filter((entry) => entry.status === "legacy-unjournaled");
if (strict && unresolved.length) {
  failures.push(`${unresolved.length} legacy unjournaled migrations require reconciliation before execution`);
}

if (failures.length) {
  console.error("Migration chain check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Migration chain check passed: ${journalTags.length} journaled entries, ${unresolved.length} unresolved legacy entries`);
