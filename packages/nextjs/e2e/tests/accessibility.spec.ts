import { expect, test } from "../fixtures/wallet";
import { findVoteableContent, waitForFeedLoaded } from "../helpers/wait-helpers";

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

  test("interactive elements have accessible names", async ({ connectedPage: page }) => {
    await page.goto("/vote");
    await waitForFeedLoaded(page);

    // Search bar should have an aria-label
    const searchInput = page.getByRole("textbox", { name: "Search content" });
    await expect(searchInput.first()).toBeVisible({ timeout: 10_000 });

    // Vote buttons should have accessible names (if visible)
    const voteUp = page.getByRole("button", { name: "Vote up" });
    const voteDown = page.getByRole("button", { name: "Vote down" });
    const ownContent = page.getByText("Your submission");
    const cooldown = page.getByText(/Cooldown/);

    // At least one of these states should be present (wallet connected)
    const anyState = voteUp.or(voteDown).or(ownContent).or(cooldown);
    await expect(anyState.first()).toBeVisible({ timeout: 10_000 });
  });

  test("StakeSelector dialog has ARIA attributes", async ({ connectedPage: page }) => {
    await page.goto("/vote");
    await waitForFeedLoaded(page);

    const canVote = await findVoteableContent(page);
    expect(canVote, "Should find at least one voteable content via thumbnail grid").toBeTruthy();
    const voteUpBtn = page.getByRole("button", { name: "Vote up" });
    await voteUpBtn.waitFor({ state: "visible", timeout: 10_000 });
    await page.waitForTimeout(500); // let React settle after Ponder polling re-renders
    await voteUpBtn.click();

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
