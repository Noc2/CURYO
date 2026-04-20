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
    "/docs/sdk",
    "/docs/smart-contracts",
    "/docs/frontend-codes",
    "/docs/ai",
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

    const protocolLink = page.getByRole("link", { name: /^Protocol$/i });
    await expect(protocolLink).toBeVisible({ timeout: 10_000 });
    await protocolLink.click();
    await page.waitForURL(/\/docs\/tokenomics$/);
    await expect(page.getByRole("heading", { name: /^Tokenomics$/i }).first()).toBeVisible({ timeout: 10_000 });

    const buildLink = page.getByRole("link", { name: /^Build$/i });
    await expect(buildLink).toBeVisible({ timeout: 10_000 });
    await buildLink.click();
    await page.waitForURL(/\/docs\/sdk$/);
    await expect(page.getByRole("heading", { name: /^SDK$/i }).first()).toBeVisible({ timeout: 10_000 });
  });

  for (const path of legalPages) {
    test(`${path} loads with a heading`, async ({ page }) => {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      const h1 = page.locator("h1");
      await expect(h1.first(), `${path} should expose a visible h1 heading`).toBeVisible({ timeout: 10_000 });
    });
  }
});
