import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEVELOPMENT_WORKER_POLL_INTERVAL_MS,
  PRODUCTION_WORKER_POLL_INTERVAL_MS,
  resolveWorkerPollingConfig
} from "./pollingConfig.js";

describe("resolveWorkerPollingConfig", () => {
  it("keeps production polling enabled at 2s", () => {
    assert.deepEqual(
      resolveWorkerPollingConfig({
        deploymentEnv: "production",
        workerPollingEnabled: "false",
        workerPollIntervalMs: "5000"
      }),
      { enabled: true, intervalMs: PRODUCTION_WORKER_POLL_INTERVAL_MS }
    );
  });

  it("defaults development to a two-hour interval", () => {
    assert.deepEqual(
      resolveWorkerPollingConfig({ deploymentEnv: "development" }),
      { enabled: true, intervalMs: DEVELOPMENT_WORKER_POLL_INTERVAL_MS }
    );
  });

  it("allows disabling development polling", () => {
    assert.deepEqual(
      resolveWorkerPollingConfig({
        deploymentEnv: "development",
        workerPollingEnabled: "false"
      }),
      { enabled: false, intervalMs: DEVELOPMENT_WORKER_POLL_INTERVAL_MS }
    );
  });

  it("honors WORKER_POLL_INTERVAL_MS override in development", () => {
    assert.deepEqual(
      resolveWorkerPollingConfig({
        deploymentEnv: "development",
        workerPollIntervalMs: "60000"
      }),
      { enabled: true, intervalMs: 60_000 }
    );
  });
});
