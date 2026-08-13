import { test, expect } from "./fixtures";

const crmRoutes = [
  ["/", /Overview|Dashboard/i], ["/contacts", /Contacts/i], ["/companies", /Companies/i],
  ["/segments", /Segments/i], ["/campaigns", /Campaigns/i], ["/forms", /Forms/i],
  ["/workflows", /Workflows/i], ["/agents", /Agents/i], ["/deliverability", /Deliverability/i],
  ["/settings", /Settings/i], ["/billing", /Billing|Activate your client workspace/i], ["/help", /Help/i]
] as const;

test.describe("Twiniti CRM authenticated application", () => {
  test("logs in and reaches a valid workspace state", async ({ signedInPage: page }) => {
    await expect(page).not.toHaveURL(/sign-in/);
    await expect(page.locator("body")).not.toContainText(/failed to load session|unauthorized/i);
    await expect(page.locator("body")).toContainText(/Loading workspace|Onboarding|Billing|Overview|Contacts|Super Admin/i);
  });

  test("covers the authenticated CRM route surface", async ({ signedInPage: page }) => {
    test.skip(
      await page.getByRole("heading", { name: "Name your company", exact: true }).count() > 0,
      "The persistent E2E account requires workspace setup."
    );
    for (const [path, heading] of crmRoutes) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      if (await page.getByText(/Activate your client workspace/i).count()) continue;
      await expect(page.locator("body")).toContainText(heading);
    }
  });

  test("creates a contact from the Kanban dialog and verifies it", async ({ signedInPage: page }) => {
    test.skip(
      await page.getByRole("heading", { name: "Name your company", exact: true }).count() > 0,
      "The persistent E2E account requires workspace setup."
    );
    await page.goto("/contacts");
    await page.waitForLoadState("networkidle");
    test.skip(await page.getByText(/Activate your client workspace/i).count() > 0, "The E2E account is billing-gated.");
    await expect(page.getByRole("link", { name: "Kanban", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "List", exact: true })).toBeVisible();
    const unique = `e2e-${Date.now()}@example.test`;
    await page.getByRole("button", { name: "New contact", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Email", { exact: true }).fill(unique);
    await dialog.getByLabel("First name", { exact: true }).fill("E2E");
    await dialog.getByLabel("Last name", { exact: true }).fill("Contact");
    await dialog.getByRole("button", { name: "Create contact", exact: true }).click();
    await expect(page.getByRole("link", { name: /E2E Contact|e2e-/i }).first()).toBeVisible({ timeout: 15_000 });
  });

  test("shows companies Kanban with list fallback", async ({ signedInPage: page }) => {
    test.skip(
      await page.getByRole("heading", { name: "Name your company", exact: true }).count() > 0,
      "The persistent E2E account requires workspace setup."
    );
    await page.goto("/companies");
    await page.waitForLoadState("networkidle");
    test.skip(await page.getByText(/Activate your client workspace/i).count() > 0, "The E2E account is billing-gated.");
    await expect(page.getByRole("heading", { name: "Companies", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "List", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "List", exact: true }).click();
    await expect(page).toHaveURL(/view=list/);
    await expect(page.getByRole("columnheader", { name: "Name", exact: true })).toBeVisible();
  });
});
