import { expect, test } from "../fixtures/wallet";
import { waitForFeedLoaded } from "../helpers/wait-helpers";

const MOBILE_VIEWPORT = { width: 390, height: 844 }; // iPhone 12

test.describe("Mobile viewport", () => {
  test("sidebar hidden and hamburger visible on mobile", async ({ connectedPage: page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto("/vote");
    await waitForFeedLoaded(page);

    // Desktop sidebar should be hidden
    const sidebar = page.locator("aside");
    await expect(sidebar).toBeHidden();

    // Hamburger menu button should be visible
    const hamburger = page.getByLabel("Open menu");
    await expect(hamburger).toBeVisible({ timeout: 5_000 });
  });

  test("hamburger opens mobile menu with nav links", async ({ connectedPage: page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto("/vote");
    await waitForFeedLoaded(page);

    // Open the hamburger menu (DaisyUI <details> dropdown)
    await page.getByLabel("Open menu").click();
    await page.waitForTimeout(300);

    // Nav links should be visible inside the dropdown-content
    const dropdown = page.locator(".dropdown-content");
    await expect(dropdown.getByRole("link", { name: /Discover/i })).toBeVisible({ timeout: 5_000 });
    await expect(dropdown.getByRole("link", { name: /Submit/i })).toBeVisible({ timeout: 3_000 });
    await expect(dropdown.getByRole("link", { name: /cREP/i })).toBeVisible({ timeout: 3_000 });
  });

  test("mobile menu navigation works", async ({ connectedPage: page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto("/vote");
    await waitForFeedLoaded(page);

    // Open hamburger and navigate to Submit via the dropdown menu
    await page.getByLabel("Open menu").click();
    await page.waitForTimeout(300);
    await page
      .locator(".dropdown-content")
      .getByRole("link", { name: /Submit/i })
      .click();

    await expect(page).toHaveURL(/\/submit/, { timeout: 15_000 });
  });

  test("vote page loads and content visible on mobile", async ({ connectedPage: page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto("/vote");
    await waitForFeedLoaded(page);

    // Main content area should be visible
    const main = page.locator("main");
    await expect(main).toBeVisible({ timeout: 10_000 });

    // No horizontal overflow — page width should not exceed viewport
    const hasOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasOverflow).toBe(false);
  });

  test("StakeSelector dialog opens on mobile", async ({ connectedPage: page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);

    // Navigate to feed and find voteable content.
    // The default featured card may be own content (from earlier moderation tests),
    // so click through thumbnail grid items until we find one with a Vote button.
    await page.goto("/vote");
    await waitForFeedLoaded(page);

    const voteBtn = page.getByRole("button", { name: "Vote up" });
    let canVote = await voteBtn
      .waitFor({ state: "visible", timeout: 5_000 })
      .then(() => true)
      .catch(() => false);

    if (!canVote) {
      const thumbnails = page.locator(".grid button").filter({ has: page.locator("img") });
      const thumbCount = await thumbnails.count();

      for (let i = 0; i < Math.min(thumbCount, 20); i++) {
        const thumb = thumbnails.nth(i);
        if (await thumb.isVisible().catch(() => false)) {
          await thumb.click();
          await page.waitForTimeout(2_000);
          canVote = await voteBtn
            .waitFor({ state: "visible", timeout: 3_000 })
            .then(() => true)
            .catch(() => false);
          if (canVote) break;
        }
      }
    }

    expect(canVote, "Should find at least one voteable content via thumbnail grid").toBeTruthy();
    await voteBtn.click();

    // StakeSelector dialog should appear and be usable on mobile
    const dialog = page.locator("[role='dialog']").first();
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Dialog should contain the stake confirmation button
    const confirmBtn = dialog.getByRole("button", { name: /confirm|vote|stake/i });
    const hasConfirm = await confirmBtn
      .first()
      .isVisible({ timeout: 3_000 })
      .catch(() => false);
    expect(hasConfirm).toBe(true);

    // Close the dialog by pressing Escape
    await page.keyboard.press("Escape");
  });
});
