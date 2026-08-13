import { test, expect, waitForAuthenticatedShell } from "./fixtures";

const crmRoutes = [
  ["/", /Overview|Dashboard/i],
  ["/contacts", /Contacts/i],
  ["/companies", /Companies/i],
  ["/segments", /Segments/i],
  ["/campaigns", /Campaigns/i],
  ["/forms", /Forms/i],
  ["/workflows", /Workflows/i],
  ["/agents", /Agents/i],
  ["/deliverability", /Deliverability/i],
  ["/settings", /Settings/i],
  ["/billing", /Billing|Activate your client workspace/i],
  ["/help", /Help/i]
] as const;

const routeNavLabel: Record<string, string> = {
  "/": "Overview",
  "/contacts": "Contacts",
  "/companies": "Companies",
  "/segments": "Segments",
  "/campaigns": "Campaigns",
  "/forms": "Forms",
  "/workflows": "Workflows",
  "/agents": "Agents",
  "/deliverability": "Deliverability",
  "/settings": "Settings",
  "/billing": "Billing",
  "/help": "Help"
};

async function gotoCrm(page: import("@playwright/test").Page, path: string) {
  // Prefer in-app nav so AuthGate stays mounted across routes. Full reloads
  // re-race Hexclave token hydration and are what stuck on Loading workspace.
  const label = routeNavLabel[path];
  const nav = label ? page.getByRole("navigation").getByRole("link", { name: label, exact: true }) : null;
  if (nav && (await nav.count()) > 0) {
    await nav.click();
  } else {
    await page.goto(path, { waitUntil: "domcontentloaded" });
  }
  await waitForAuthenticatedShell(page);
}

test.describe("Twiniti CRM authenticated application", () => {
  test("logs in and reaches a valid workspace state", async ({ signedInPage: page }) => {
    await expect(page).not.toHaveURL(/sign-in/);
    await expect(page.locator("body")).not.toContainText(/failed to load session|unauthorized|Timed out loading workspace/i);
    await expect(page.locator("body")).toContainText(/Onboarding|Billing|Overview|Contacts|Companies|Super Admin|Sign out/i);
  });

  test("covers the authenticated CRM route surface", async ({ signedInPage: page }) => {
    test.skip(
      await page.getByRole("heading", { name: "Name your company", exact: true }).count() > 0,
      "The persistent E2E account requires workspace setup."
    );
    for (const [path, heading] of crmRoutes) {
      await gotoCrm(page, path);
      if (await page.getByText(/Activate your client workspace/i).count()) continue;
      if (await page.getByRole("heading", { name: "Super Admin", exact: true }).count()) continue;
      await expect(page.locator("body")).toContainText(heading, { timeout: 60_000 });
    }
  });

  test("creates a contact from the Kanban dialog and verifies it", async ({ signedInPage: page }) => {
    test.skip(
      await page.getByRole("heading", { name: "Name your company", exact: true }).count() > 0,
      "The persistent E2E account requires workspace setup."
    );
    await gotoCrm(page, "/contacts");
    test.skip(await page.getByText(/Activate your client workspace/i).count() > 0, "The E2E account is billing-gated.");
    test.skip(await page.getByRole("heading", { name: "Super Admin", exact: true }).count() > 0, "The E2E account is on Super Admin.");
    await expect(page.getByRole("heading", { name: "Contacts", exact: true })).toBeVisible({ timeout: 60_000 });
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
    await expect(dialog).toBeHidden({ timeout: 60_000 });
    await expect(page.getByText(/E2E Contact|e2e-/i).first()).toBeVisible({ timeout: 90_000 });
  });

  test("shows companies Kanban with list fallback", async ({ signedInPage: page }) => {
    test.skip(
      await page.getByRole("heading", { name: "Name your company", exact: true }).count() > 0,
      "The persistent E2E account requires workspace setup."
    );
    await gotoCrm(page, "/companies");
    test.skip(await page.getByText(/Activate your client workspace/i).count() > 0, "The E2E account is billing-gated.");
    test.skip(await page.getByRole("heading", { name: "Super Admin", exact: true }).count() > 0, "The E2E account is on Super Admin.");
    await expect(page.getByRole("heading", { name: "Companies", exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("link", { name: "List", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "List", exact: true }).click();
    await expect(page).toHaveURL(/view=list/);
    await expect(page.getByRole("columnheader", { name: "Name", exact: true })).toBeVisible({ timeout: 60_000 });
  });
});
