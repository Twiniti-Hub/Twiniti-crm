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

  await page.getByLabel(/card number/i).fill("4242 4242 4242 4242");
  await page.getByPlaceholder("MM / YY").fill("12 / 34");
  await page.getByPlaceholder("CVC").fill("123");
  await page.getByPlaceholder("Full name on card").fill("Twiniti E2E Test");
  await page.getByRole("button", { name: /start trial|subscribe|complete order/i }).last().click();
  await page.waitForTimeout(10_000);
  await page.goto(`${baseURL ?? ""}/billing?success=1`);
  await expect(page.locator("body")).toContainText(/Status:\s*(active|trialing)/i, { timeout: 30_000 });
  await expect(page.locator("body")).not.toContainText("LICENSE_API_UNAVAILABLE");
  await expect(page.locator("body")).not.toContainText(/failed to load session|unauthorized/i);
});
