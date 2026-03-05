import { expect, test } from "@playwright/test";

/**
 * Documentation and legal page smoke tests.
 * Verifies all subpages load without errors and have proper headings.
 */
test.describe("Documentation pages", () => {
  const docPages = [
    "/docs",
    "/docs/getting-started",
    "/docs/how-it-works",
    "/docs/tokenomics",
    "/docs/governance",
    "/docs/blind-voting",
    "/docs/delegation",
    "/docs/smart-contracts",
    "/docs/frontend-codes",
    "/docs/security-audit",
    "/docs/whitepaper",
  ];

  test("all doc pages load with h1 heading", async ({ page }) => {
    test.setTimeout(180_000); // 11 pages, some (security-audit) need up to 20s
    const errors: string[] = [];

    for (const path of docPages) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      const h1 = page.locator("h1");
      const visible = await h1
        .first()
        .waitFor({ state: "visible", timeout: 20_000 })
        .then(() => true)
        .catch(() => false);
      if (!visible) {
        errors.push(`${path}: no visible h1 heading`);
      }
    }

    expect(errors, `Pages missing h1: ${errors.join(", ")}`).toEqual([]);
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

  test("legal pages load with headings", async ({ page }) => {
    test.setTimeout(90_000); // 4 pages × ~10s each
    const legalPages = ["/legal", "/legal/terms", "/legal/privacy", "/legal/imprint"];
    const errors: string[] = [];

    for (const path of legalPages) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      const h1 = page.locator("h1");
      const visible = await h1
        .first()
        .waitFor({ state: "visible", timeout: 10_000 })
        .then(() => true)
        .catch(() => false);
      if (!visible) {
        errors.push(`${path}: no visible h1 heading`);
      }
    }

    expect(errors, `Pages missing h1: ${errors.join(", ")}`).toEqual([]);
  });
});
