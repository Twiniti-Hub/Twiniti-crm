import type { DeploymentEnvironment } from "@twiniti/config";

/** Production job-claim loop interval (unchanged). */
export const PRODUCTION_WORKER_POLL_INTERVAL_MS = 2_000;

/** Default Development interval: at most once every two hours. */
export const DEVELOPMENT_WORKER_POLL_INTERVAL_MS = 7_200_000;

export type WorkerPollingConfig = {
  enabled: boolean;
  intervalMs: number;
};

function parseRuntimeEnvironment(value: string | undefined): DeploymentEnvironment | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "development") return "development";
  if (normalized === "production") return "production";
  return undefined;
}

/** Worker polling uses APP_ENV; falls back to DEPLOYMENT_ENV. Unset → production. */
export function resolveWorkerRuntimeEnvironment(input: {
  appEnv?: string;
  deploymentEnv?: string;
}): DeploymentEnvironment {
  return (
    parseRuntimeEnvironment(input.appEnv)
    ?? parseRuntimeEnvironment(input.deploymentEnv)
    ?? "production"
  );
}

function parseBooleanFlag(value: string | undefined): boolean | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return undefined;
}

function parsePositiveInt(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
}

export function resolveWorkerPollingConfig(input: {
  deploymentEnv: DeploymentEnvironment;
  workerPollingEnabled?: string;
  workerPollIntervalMs?: string;
}): WorkerPollingConfig {
  if (input.deploymentEnv === "production") {
    return {
      enabled: true,
      intervalMs: PRODUCTION_WORKER_POLL_INTERVAL_MS
    };
  }

  const enabled = parseBooleanFlag(input.workerPollingEnabled) ?? true;
  const overrideInterval = parsePositiveInt(input.workerPollIntervalMs);

  return {
    enabled,
    intervalMs: overrideInterval ?? DEVELOPMENT_WORKER_POLL_INTERVAL_MS
  };
}
