import { test as base, expect, type Page } from "@playwright/test";

export const test = base.extend<{ signedInPage: Page }>({
  signedInPage: async ({ page }, use) => {
    const email = process.env.E2E_EMAIL;
    const password = process.env.E2E_PASSWORD;
    if (!email || !password) {
      throw new Error("E2E_EMAIL and E2E_PASSWORD are required for authenticated E2E tests.");
    }
    await page.goto("/sign-in");
    await page.getByLabel(/email/i).fill(email);
    await page.getByRole("textbox", { name: /password/i }).fill(password);
    await page.getByRole("button", { name: "Sign In", exact: true }).click();
    await expect(page).not.toHaveURL(/\/sign-in(?:[/?#]|$)/, { timeout: 30_000 });
    await expect(page.locator("body")).toContainText(
      /Sign out|Name your company|Activate your client workspace|Billing is active|Super Admin/i,
      { timeout: 30_000 }
    );
    await use(page);
  }
});

export { expect };
