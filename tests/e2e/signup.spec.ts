import { test, expect } from "./fixtures";

test("new user can create an account and reach authenticated billing", async ({ page, baseURL }) => {
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const emailDomain = process.env.E2E_SIGNUP_EMAIL_DOMAIN ?? "example.test";
  const email = `e2e-signup-${runId}@${emailDomain}`;
  const password = `Twiniti-E2E-${runId}!`;

  await page.goto(process.env.E2E_LANDING_URL ?? "https://twiniti-crm-dev-landing.onrender.com");
  await page.getByText("Start your workspace", { exact: false }).first().click();
  await page.getByRole("link", { name: /United States/ }).click();
  await page.getByLabel("Company name", { exact: true }).fill(`E2E Workspace ${runId}`);
  await page.locator("select").first().selectOption({ label: "United States" });
  await page.getByLabel("Work email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account", exact: true }).click();

  await expect.poll(() => page.url(), { timeout: 30_000 }).toMatch(/checkout\.stripe\.com/);

  // Do not submit payment in the automated signup test. Returning to the app
  // still verifies that Hexclave authentication and CRM organization creation
  // completed before the billing gate.
  await page.goto(`${baseURL ?? ""}/billing?canceled=1`);
  await page.waitForTimeout(3000);
  await expect(page.getByRole("heading", { name: "Activate your client workspace" })).toBeVisible();
  await expect(page.locator("body")).toContainText(/Status:\s*pending/i);
  await expect(page.locator("body")).not.toContainText("LICENSE_API_UNAVAILABLE");
  await expect(page.locator("body")).not.toContainText(/failed to load session|unauthorized/i);
});
