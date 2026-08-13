import { test, expect, waitForAuthenticatedShell } from "./fixtures";

/**
 * Promotion smoke: login + core CRM surfaces only.
 * Long route matrices and Stripe signup live elsewhere so flakes cannot block release.
 */
test.describe("Twiniti CRM authenticated application", () => {
  test("logs in and reaches a valid workspace state", async ({ signedInPage: page }) => {
    await expect(page).not.toHaveURL(/sign-in/);
    await expect(page.locator("body")).not.toContainText(/failed to load session|unauthorized|Timed out loading workspace/i);
    await expect(page.locator("body")).toContainText(/Onboarding|Billing|Overview|Contacts|Companies|Super Admin|Sign out/i);
  });

  test("opens Contacts and Companies boards", async ({ signedInPage: page }) => {
    test.skip(
      await page.getByRole("heading", { name: "Name your company", exact: true }).count() > 0,
      "The persistent E2E account requires workspace setup."
    );
    test.skip(await page.getByText(/Activate your client workspace/i).count() > 0, "The E2E account is billing-gated.");
    test.skip(await page.getByRole("heading", { name: "Super Admin", exact: true }).count() > 0, "The E2E account is on Super Admin.");

    const contactsNav = page.getByRole("navigation").getByRole("link", { name: "Contacts", exact: true });
    await contactsNav.click();
    await waitForAuthenticatedShell(page);
    await expect(page.getByRole("heading", { name: "Contacts", exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("link", { name: "List", exact: true })).toBeVisible();

    const companiesNav = page.getByRole("navigation").getByRole("link", { name: "Companies", exact: true });
    await companiesNav.click();
    await waitForAuthenticatedShell(page);
    await expect(page.getByRole("heading", { name: "Companies", exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("link", { name: "List", exact: true })).toBeVisible();
  });
});
