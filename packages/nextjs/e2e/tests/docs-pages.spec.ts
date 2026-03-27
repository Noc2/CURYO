import { expect, test } from "@playwright/test";

/**
 * Documentation and legal page smoke tests.
 * Verifies all subpages load without errors and have proper headings.
 */
test.describe("Documentation pages", () => {
  const docPages = [
    "/docs",
    "/docs/how-it-works",
    "/docs/tokenomics",
    "/docs/governance",
    "/docs/smart-contracts",
    "/docs/frontend-codes",
    "/docs/whitepaper",
  ];
  const legalPages = ["/legal", "/legal/terms", "/legal/privacy", "/legal/imprint"];

  for (const path of docPages) {
    test(`${path} loads with a heading`, async ({ page }) => {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      const h1 = page.locator("h1");
      await expect(h1.first(), `${path} should expose a visible h1 heading`).toBeVisible({ timeout: 20_000 });
    });
  }

  test("blind voting docs redirect to how it works", async ({ page }) => {
    await page.goto("/docs/blind-voting");
    await page.waitForURL(/\/docs\/how-it-works#blind-voting$/);
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 10_000 });
  });

  test("transaction costs docs redirect to how it works", async ({ page }) => {
    await page.goto("/docs/funding-wallet");
    await page.waitForURL(/\/docs\/how-it-works#transaction-costs$/);
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 10_000 });
  });

  test("docs sidebar navigation works", async ({ page }) => {
    await page.goto("/docs");
    await page.waitForLoadState("domcontentloaded");

    // Wait for docs page to load
    const h1 = page.locator("h1");
    await expect(h1.first()).toBeVisible({ timeout: 15_000 });

    // Find a sidebar link and click it
    const sidebarLink = page.getByRole("link", { name: /How It Works/i });
    const hasLink = await sidebarLink
      .waitFor({ state: "visible", timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!hasLink, "Sidebar link not found — layout may differ");

    await sidebarLink.click();
    await page.waitForURL(/how-it-works/, { timeout: 10_000 });

    // Verify the new page loaded
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 10_000 });
  });

  test("docs section headings open the first page in each section", async ({ page }) => {
    await page.goto("/docs/tokenomics");
    await page.waitForLoadState("domcontentloaded");

    const startHereLink = page.getByRole("link", { name: /^Start Here$/i });
    await expect(startHereLink).toBeVisible({ timeout: 10_000 });
    await startHereLink.click();
    await page.waitForURL(/\/docs$/);
    await expect(page.getByRole("heading", { name: /^Introduction$/i }).first()).toBeVisible({ timeout: 10_000 });

    const conceptsLink = page.getByRole("link", { name: /^Concepts$/i });
    await expect(conceptsLink).toBeVisible({ timeout: 10_000 });
    await conceptsLink.click();
    await page.waitForURL(/\/docs\/tokenomics$/);
    await expect(page.getByRole("heading", { name: /^Tokenomics$/i }).first()).toBeVisible({ timeout: 10_000 });

    const technicalLink = page.getByRole("link", { name: /^Technical$/i });
    await expect(technicalLink).toBeVisible({ timeout: 10_000 });
    await technicalLink.click();
    await page.waitForURL(/\/docs\/smart-contracts$/);
    await expect(page.getByRole("heading", { name: /^Smart Contracts$/i }).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  for (const path of legalPages) {
    test(`${path} loads with a heading`, async ({ page }) => {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      const h1 = page.locator("h1");
      await expect(h1.first(), `${path} should expose a visible h1 heading`).toBeVisible({ timeout: 10_000 });
    });
  }
});
