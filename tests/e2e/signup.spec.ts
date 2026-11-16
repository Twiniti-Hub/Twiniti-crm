import { test, expect } from "./fixtures";

test("new user can create a workspace and start a cardless trial", async ({ page, baseURL }) => {
  test.setTimeout(180_000);
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

  // Account creation precedes workspace provisioning. The saved signup draft
  // supplies the organization details on the onboarding screen.
  await expect(page).toHaveURL(/\/onboarding(?:[/?#]|$)/, { timeout: 60_000 });
  await expect(page.getByRole("heading", { name: "Choose your workspace" })).toBeVisible();
  await page.getByRole("button", { name: "Create company", exact: true }).click();

  await expect.poll(() => page.url(), { timeout: 60_000 }).toMatch(/checkout\.stripe\.com/);
  await expect(page.getByText(/7[- ]day|7 days/i).first()).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Card number", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: /start trial|subscribe|complete order/i }).last().click();
  await expect.poll(() => page.url(), { timeout: 60_000 }).not.toMatch(/checkout\.stripe\.com/);
  await expect(page.locator("body")).toContainText(/Status:\s*(active|trialing)/i, { timeout: 60_000 });
  await expect(page.locator("body")).not.toContainText("LICENSE_API_UNAVAILABLE");
  await expect(page.locator("body")).not.toContainText(/failed to load session|unauthorized/i);

  const appOrigin = (baseURL ?? "").replace(/\/$/, "");
  await page.goto(`${appOrigin}/contacts`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("body")).toContainText(/Contacts/i, { timeout: 30_000 });
  const contactEmail = `e2e-contact-${runId}@example.test`;
  await page.getByRole("button", { name: "New contact", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Email", { exact: true }).fill(contactEmail);
  await dialog.getByLabel("First name", { exact: true }).fill("E2E");
  await dialog.getByLabel("Last name", { exact: true }).fill("Contact");
  await dialog.getByRole("button", { name: "Create contact", exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  await expect(page.getByText(/E2E Contact|e2e-contact-/i).first()).toBeVisible({ timeout: 60_000 });
});
