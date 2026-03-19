import { expect, test } from "@playwright/test";

test.describe("Page smoke tests", () => {
  test("landing page loads", async ({ page }) => {
    await page.goto("/");
    // The page title should contain "Curyo" regardless of redirects
    await expect(page).toHaveTitle(/Curyo/i);

    // The landing page may redirect to /governance or /vote if a test wallet
    // session is already active. Either the hero section or a redirected page is acceptable.
    const heroHeading = page.getByRole("heading", { name: /Curyo/i }).first();
    const governancePage = page.getByRole("button", { name: /Profile|Leaderboard|Faucet/i }).first();
    const feedPage = page.getByRole("button", { name: "Vote up" });

    const landingOrRedirect = heroHeading.or(governancePage).or(feedPage);
    await expect(landingOrRedirect.first()).toBeVisible({ timeout: 15_000 });
  });

  test("docs page renders documentation", async ({ page }) => {
    await page.goto("/docs");

    // Docs page should have the "Introduction" heading
    const introHeading = page.getByRole("heading", { name: /Introduction/i });
    await expect(introHeading).toBeVisible({ timeout: 10_000 });

    // Key sections should be present
    const missionHeading = page.getByRole("heading", { name: /Mission/i });
    await expect(missionHeading).toBeVisible({ timeout: 5_000 });

    // Key principles section
    const skinInGame = page.getByText("Skin in the Game");
    await expect(skinInGame).toBeVisible({ timeout: 5_000 });
  });

  test("legal page shows legal cards", async ({ page }) => {
    await page.goto("/legal");

    // Main heading
    const heading = page.getByRole("heading", { name: "Legal", level: 1 });
    await expect(heading).toBeVisible({ timeout: 10_000 });

    // Three legal document cards — use heading role to avoid matching footer links
    const termsHeading = page.getByRole("heading", { name: "Terms of Service" });
    await expect(termsHeading).toBeVisible({ timeout: 5_000 });

    const privacyHeading = page.getByRole("heading", { name: "Privacy Notice" });
    await expect(privacyHeading).toBeVisible({ timeout: 5_000 });

    const imprintHeading = page.getByRole("heading", { name: "Imprint" });
    await expect(imprintHeading).toBeVisible({ timeout: 5_000 });
  });

  test("blockexplorer shows search and transactions", async ({ page }) => {
    await page.goto("/blockexplorer");

    // Search bar should be visible
    const searchInput = page.getByPlaceholder("Search by hash or address");
    await expect(searchInput).toBeVisible({ timeout: 10_000 });

    // Transaction table should be present (deploy txs from yarn deploy)
    const table = page.locator("table");
    await expect(table).toBeVisible({ timeout: 10_000 });
  });

  test("legal subpages load without errors", async ({ page }) => {
    for (const subpage of ["/legal/terms", "/legal/privacy", "/legal/imprint"]) {
      // Use domcontentloaded to avoid timeouts when heavy resources stall the load event
      await page.goto(subpage, { waitUntil: "domcontentloaded" });

      // Page should have some text content (not blank)
      const mainContent = page.locator("main");
      await expect(mainContent).toBeVisible({ timeout: 10_000 });

      // Each page should not show a Next.js error overlay
      const errorOverlay = page.locator("nextjs-portal");
      const hasError = await errorOverlay.isVisible({ timeout: 1_000 }).catch(() => false);
      expect(hasError).toBe(false);
    }
  });
});
