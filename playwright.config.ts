import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  // Authenticated CRM + billing gates can exceed the previous 45s default,
  // especially while Kanban boards hydrate after deploy.
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: process.env.CI ? [["html", { open: "never" }], ["line"]] : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    testIdAttribute: "data-testid"
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }]
});
