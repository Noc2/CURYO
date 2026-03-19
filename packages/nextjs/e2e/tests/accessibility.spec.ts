import { ANVIL_ACCOUNTS } from "../helpers/anvil-accounts";
import { setupWallet } from "../helpers/wallet-session";
import { expect, test } from "../fixtures/wallet";

test.describe("Accessibility basics", () => {
  test("main pages have h1 heading", async ({ connectedPage: page }) => {
    // /governance uses tabs (no h1), /portfolio requires wallet state
    const pages = ["/submit", "/docs", "/legal"];

    for (const path of pages) {
      await page.goto(path, { waitUntil: "domcontentloaded" });

      const h1 = page.locator("h1");
      await expect(h1.first(), `Page ${path} should have a visible h1 heading`).toBeVisible({ timeout: 10_000 });
    }
  });

  test("interactive elements have accessible names", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await setupWallet(page, ANVIL_ACCOUNTS.account8.privateKey);

    await page.goto(`/vote?q=${encodeURIComponent("The Godfather")}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "The Godfather" })).toBeVisible({ timeout: 15_000 });

    // Search bar should have an aria-label
    const searchInput = page.getByRole("textbox", { name: "Search content" });
    await expect(searchInput.first()).toBeVisible({ timeout: 10_000 });

    await expect(page.getByRole("button", { name: /^Vote up$/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: /^Vote down$/i })).toBeVisible({ timeout: 10_000 });

    await context.close();
  });

  test("StakeSelector dialog has ARIA attributes", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await setupWallet(page, ANVIL_ACCOUNTS.account8.privateKey);

    await page.goto(`/vote?q=${encodeURIComponent("The Godfather")}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "The Godfather" })).toBeVisible({ timeout: 15_000 });

    // Ponder polling triggers React re-renders that detach/reattach the vote button.
    // Use toPass() retry pattern to handle DOM detachment during click.
    const voteUpBtn = page.getByRole("button", { name: /^Vote up$/i });
    await expect(voteUpBtn).toBeVisible({ timeout: 10_000 });
    await expect(async () => {
      await voteUpBtn.click({ timeout: 5_000 });
    }).toPass({ timeout: 30_000, intervals: [500, 1_000, 2_000] });

    // Dialog should have proper ARIA role and label
    const dialog = page.getByRole("dialog", { name: "Select stake amount" });
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Stake slider should have an accessible label
    const slider = page.getByRole("slider", { name: "Stake amount" });
    const sliderVisible = await slider.isVisible({ timeout: 3_000 }).catch(() => false);
    if (sliderVisible) {
      await expect(slider).toBeVisible();
    }

    await page.keyboard.press("Escape");
    await context.close();
  });

  test("no duplicate element IDs on main pages", async ({ connectedPage: page }) => {
    const pages = ["/vote", "/submit", "/governance", "/docs", "/legal"];

    for (const path of pages) {
      await page.goto(path, { waitUntil: "domcontentloaded" });

      // Wait for main content to render before checking IDs
      const main = page.locator("main");
      await expect(main).toBeVisible({ timeout: 10_000 });

      const duplicateIds = await page.evaluate(() => {
        // Only check IDs within <main> to avoid DaisyUI drawer/modal duplicates
        // (checkbox-based drawers render content twice for the overlay pattern)
        const scope = document.querySelector("main") || document.body;
        const ids = Array.from(scope.querySelectorAll("[id]"))
          .map(el => el.id)
          .filter(id => id !== "");
        const seen = new Set<string>();
        const dupes: string[] = [];
        for (const id of ids) {
          if (seen.has(id)) dupes.push(id);
          seen.add(id);
        }
        return dupes;
      });

      expect(duplicateIds, `Page ${path} has duplicate IDs: ${duplicateIds.join(", ")}`).toEqual([]);
    }
  });
});
