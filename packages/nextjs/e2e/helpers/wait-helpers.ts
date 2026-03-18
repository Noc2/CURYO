import type { Page } from "@playwright/test";

/**
 * Wait until the content feed has loaded — either content cards appear
 * or the "No content submitted yet" empty state shows.
 */
export async function waitForFeedLoaded(page: Page, timeout = 15_000): Promise<void> {
  const feedContent = page
    .getByRole("button", { name: "Vote up" })
    .or(page.getByRole("button", { name: "Vote down" }))
    .or(page.getByText(/Voted (Up|Down)/i))
    .or(page.getByText("Your submission"))
    .or(page.getByText(/Cooldown/))
    .or(page.getByText("Round full"))
    .or(page.getByText("No content submitted yet"))
    .or(page.getByText(/No content found/i));

  await feedContent.first().waitFor({ state: "visible", timeout });
}

/**
 * Find voteable content by cycling through thumbnail grid items.
 * The default featured card may be the user's own content, so this clicks
 * through thumbnails until it finds one with a "Vote up" button.
 * Returns true if voteable content was found.
 */
export async function findVoteableContent(page: Page): Promise<boolean> {
  const voteBtn = page.getByRole("button", { name: "Vote up" });
  let canVote = await voteBtn
    .waitFor({ state: "visible", timeout: 5_000 })
    .then(() => true)
    .catch(() => false);

  if (!canVote) {
    const thumbnails = page.locator("[data-testid='content-thumbnail']");
    const thumbCount = await thumbnails.count();

    for (let i = 0; i < Math.min(thumbCount, 20); i++) {
      const thumb = thumbnails.nth(i);
      if (await thumb.isVisible().catch(() => false)) {
        await thumb.click();
        canVote = await voteBtn
          .waitFor({ state: "visible", timeout: 5_000 })
          .then(() => true)
          .catch(() => false);
        if (canVote) break;
      }
    }
  }

  return canVote;
}

