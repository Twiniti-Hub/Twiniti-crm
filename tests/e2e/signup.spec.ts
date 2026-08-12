import { test, expect } from "./fixtures";

test("new user can create an account and reach authenticated billing", async ({ page, baseURL }) => {
  test.setTimeout(180_000);
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const emailDomain = process.env.E2E_SIGNUP_EMAIL_DOMAIN ?? "example.test";
  const email = process.env.E2E_SIGNUP_EMAIL ?? `e2e-signup-${runId}@${emailDomain}`;
  const password = process.env.E2E_SIGNUP_PASSWORD ?? `Twiniti-E2E-${runId}!`;

  await page.goto(process.env.E2E_LANDING_URL ?? "https://twiniti-crm-dev-landing.onrender.com");
  await page.getByText("Start your workspace", { exact: false }).first().click();
  await page.getByRole("link", { name: /United States/ }).click();
  await page.getByLabel("Company name", { exact: true }).fill(`E2E Workspace ${runId}`);
  await page.locator("select").first().selectOption({ label: "United States" });
  await page.getByLabel("Work email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account", exact: true }).click();

  await expect.poll(() => page.url(), { timeout: 30_000 }).toMatch(/checkout\.stripe\.com/);

  const cardMethod = page.getByRole("radio", { name: "Card", exact: true });
  const cardNumber = page.getByRole("textbox", { name: "Card number", exact: true });
  await expect.poll(async () => (await cardMethod.isVisible()) || (await cardNumber.isVisible())).toBe(true);
  if (!(await cardNumber.isVisible())) {
    await cardMethod.check({ force: true });
    await expect(cardMethod).toBeChecked();
  }
  await cardNumber.fill("4242 4242 4242 4242");
  await page.getByRole("textbox", { name: "Expiration", exact: true }).fill("12 / 34");
  await page.getByRole("textbox", { name: "CVC", exact: true }).fill("123");
  await page.getByRole("textbox", { name: "Cardholder name", exact: true }).fill("Twiniti E2E Test");
  const postalCode = page.getByRole("textbox", { name: /ZIP|Postal code/i });
  if (await postalCode.isVisible()) await postalCode.fill("10001");
  const savePaymentDetails = page.getByRole("checkbox", { name: /Save my information/i });
  if (await savePaymentDetails.isVisible() && await savePaymentDetails.isChecked()) {
    await savePaymentDetails.uncheck();
  }
  await page.getByRole("button", { name: /start trial|subscribe|complete order/i }).last().click();
  await expect.poll(() => page.url(), { timeout: 60_000 }).not.toMatch(/checkout\.stripe\.com/);
  await expect(page.locator("body")).toContainText(/Status:\s*(active|trialing)/i, { timeout: 60_000 });
  await expect(page.locator("body")).not.toContainText("LICENSE_API_UNAVAILABLE");
  await expect(page.locator("body")).not.toContainText(/failed to load session|unauthorized/i);

  const appOrigin = (baseURL ?? "").replace(/\/$/, "");
  await page.goto(`${appOrigin}/contacts`);
  await expect(page.locator("body")).toContainText(/Contacts/i, { timeout: 30_000 });
  const contactEmail = `e2e-contact-${runId}@example.test`;
  await page.getByLabel("Email", { exact: true }).fill(contactEmail);
  await page.getByLabel("First name", { exact: true }).fill("E2E");
  await page.getByLabel("Last name", { exact: true }).fill("Contact");
  await page.getByRole("button", { name: "Create contact", exact: true }).click();
  await expect(page.getByRole("link", { name: contactEmail })).toBeVisible();
  await expect(page.locator("tbody")).toContainText("E2E Contact");
});
