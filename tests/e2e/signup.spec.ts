import { test, expect } from "./fixtures";

test("new user can create an account and reach email verification", async ({ page, baseURL }) => {
  test.setTimeout(90_000);
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const emailDomain = process.env.E2E_SIGNUP_EMAIL_DOMAIN ?? "example.test";
  const email = process.env.E2E_SIGNUP_EMAIL ?? `e2e-signup-${runId}@${emailDomain}`;
  const password = process.env.E2E_SIGNUP_PASSWORD ?? `Twiniti-E2E-${runId}!`;

  const landingUrl = process.env.E2E_LANDING_URL ?? baseURL ?? "https://loop-dev.twiniti.ai";
  await page.goto(landingUrl, { waitUntil: "domcontentloaded" });
  await page.getByRole("link", { name: /Start free/i }).first().click();
  await expect(page).toHaveURL(/\/sign-up(?:[/?#]|$)/);
  await page.getByLabel("Company name", { exact: true }).fill(`E2E Workspace ${runId}`);
  await page.locator("select").first().selectOption({ label: "United States" });
  await page.getByLabel("Work email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account", exact: true }).click();

  // Email verification is authoritative and must precede workspace creation.
  // Checkout is exercised separately with a verified authenticated account.
  await expect(page).toHaveURL(/\/onboarding(?:[/?#]|$)/, { timeout: 60_000 });
  await expect(page.getByRole("heading", { name: "Verify your email to continue" })).toBeVisible();
  await expect(page.getByText(email, { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "I’ve verified my email — continue" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Resend verification email" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign out" })).toBeVisible();
});
