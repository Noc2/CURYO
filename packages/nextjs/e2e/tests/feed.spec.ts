import { expect, test } from "../fixtures/wallet";
import { waitForFeedLoaded } from "../helpers/wait-helpers";

test.describe("Content feed", () => {
  test("displays content items at /vote", async ({ connectedPage: page }) => {
    await page.goto("/vote");
    await waitForFeedLoaded(page);

    // The feed should show vote UI or an empty state — one of these must be visible
    const anyState = page
      .getByRole("button", { name: "Vote up" })
      .or(page.getByText(/Voted (Up|Down)/i))
      .or(page.getByText("Your submission"))
      .or(page.getByText("Round full"))
      .or(page.getByText(/Cooldown/))
      .or(page.getByText("No content submitted yet"));
    await expect(anyState.first()).toBeVisible({ timeout: 15_000 });
  });

  test("category filter pills are visible", async ({ connectedPage: page }) => {
    await page.goto("/vote");
    await waitForFeedLoaded(page);

    // "All" category pill should always be present — use .first() because the
    // CategoryFilter renders a hidden measurement row with duplicate buttons
    const allPill = page.getByRole("button", { name: /^All$/i }).first();
    await expect(allPill).toBeVisible({ timeout: 10_000 });
  });

  test("connected users see the feed scope filter pill", async ({ connectedPage: page }) => {
    await page.goto("/vote");
    await waitForFeedLoaded(page);

    const filterPill = page.getByRole("button", { name: /^Filter$/i }).first();
    await expect(filterPill).toBeVisible({ timeout: 10_000 });
  });
});
