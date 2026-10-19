import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEVELOPMENT_WORKER_POLL_INTERVAL_MS,
  EMPTY_QUEUE_POLL_BACKOFF_MS,
  PRODUCTION_WORKER_POLL_INTERVAL_MS,
  resolvePollDelayMs,
  resolveWorkerPollingConfig,
  resolveWorkerRuntimeEnvironment
} from "./pollingConfig.js";

describe("resolveWorkerRuntimeEnvironment", () => {
  it("prefers APP_ENV over DEPLOYMENT_ENV", () => {
    assert.equal(
      resolveWorkerRuntimeEnvironment({ appEnv: "production", deploymentEnv: "development" }),
      "production"
    );
  });

  it("falls back to DEPLOYMENT_ENV when APP_ENV is unset", () => {
    assert.equal(resolveWorkerRuntimeEnvironment({ deploymentEnv: "development" }), "development");
  });

  it("defaults to production when both are unset", () => {
    assert.equal(resolveWorkerRuntimeEnvironment({}), "production");
  });
});

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

  it("defaults development polling off with a two-hour interval when enabled", () => {
    assert.deepEqual(
      resolveWorkerPollingConfig({ deploymentEnv: "development" }),
      { enabled: false, intervalMs: DEVELOPMENT_WORKER_POLL_INTERVAL_MS }
    );
  });

  it("allows enabling development polling via JOBS_POLL_ENABLED", () => {
    assert.deepEqual(
      resolveWorkerPollingConfig({
        deploymentEnv: "development",
        jobsPollEnabled: "true"
      }),
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
        jobsPollEnabled: "true",
        workerPollIntervalMs: "60000"
      }),
      { enabled: true, intervalMs: 60_000 }
    );
  });
});

describe("resolvePollDelayMs", () => {
  it("uses the busy interval after work was claimed", () => {
    assert.equal(resolvePollDelayMs({ hadWork: true, intervalMs: 2_000 }), 2_000);
  });

  it("backs off at least 60s when the queue was empty", () => {
    assert.equal(resolvePollDelayMs({ hadWork: false, intervalMs: 2_000 }), EMPTY_QUEUE_POLL_BACKOFF_MS);
    assert.equal(
      resolvePollDelayMs({ hadWork: false, intervalMs: DEVELOPMENT_WORKER_POLL_INTERVAL_MS }),
      DEVELOPMENT_WORKER_POLL_INTERVAL_MS
    );
  });
});
