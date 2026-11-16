const productionConfirmation = "MIGRATE PRODUCTION";
const productionRef = "refs/heads/production";

export function productionMigrationGuardFailures({
  environment,
  approved,
  changeId,
  backupReference,
  confirmation,
  sourceRef,
  databaseUrls = []
}) {
  if (environment !== "production") return [];

  const failures = [];
  if (approved !== "true") failures.push("protected-environment approval is required");
  if (!changeId?.trim()) failures.push("an approved change identifier is required");
  if (!backupReference?.trim()) failures.push("backup/PITR evidence is required");
  if (confirmation !== productionConfirmation) {
    failures.push(`confirmation must exactly match ${productionConfirmation}`);
  }
  if (sourceRef !== productionRef) {
    failures.push(`source ref must be ${productionRef}; received ${sourceRef || "missing"}`);
  }
  const pooledRegions = databaseUrls.flatMap(({ region, url }) => {
    try {
      return new URL(url).hostname.includes("-pooler") ? [region] : [];
    } catch {
      return [region];
    }
  });
  if (pooledRegions.length) {
    failures.push(`direct non-pooled database URLs are required for: ${pooledRegions.join(", ")}`);
  }
  return failures;
}

export function assertProductionMigrationGuard(values) {
  const failures = productionMigrationGuardFailures(values);
  if (failures.length) {
    throw new Error(`Production migration guard failed: ${failures.join("; ")}`);
  }
}

export const productionMigrationRequirements = {
  confirmation: productionConfirmation,
  sourceRef: productionRef
};
