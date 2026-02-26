import { ANVIL_ACCOUNTS } from "../helpers/anvil-accounts";
import { fastForwardTime, triggerKeeper, waitForSettlementIndexed } from "../helpers/keeper";
import { setupWallet } from "../helpers/local-storage";
import { getContentById, getContentList } from "../helpers/ponder-api";
import { voteOnContent } from "../helpers/vote-helpers";
import { expect, test } from "@playwright/test";

test.describe("Settlement lifecycle", () => {
  // Extend timeout: 3 votes × ~45s + time fast-forward + keeper calls
  test("full cycle: vote → reveal → settle", async ({ browser }) => {
    test.setTimeout(240_000);
    // Use accounts #3, #4, #5 for settlement test (separate from vote.spec.ts which uses #7, #8, #9)
    const voters = [
      { account: ANVIL_ACCOUNTS.account3, direction: "up" as const },
      { account: ANVIL_ACCOUNTS.account4, direction: "up" as const },
      { account: ANVIL_ACCOUNTS.account5, direction: "down" as const },
    ];

    let successCount = 0;

    // Step 1: Three accounts vote on content
    for (const voter of voters) {
      const context = await browser.newContext();
      const page = await context.newPage();
      await setupWallet(page, voter.account.privateKey);

      const success = await voteOnContent(page, voter.direction);
      if (success) successCount++;

      await context.close();
    }

    // Need at least 3 votes for settlement (minVoters threshold)
    if (successCount < 3) {
      test.skip(true, `Only ${successCount}/3 votes succeeded (cooldowns from prior runs)`);
      return;
    }

    // Step 2: Fast-forward Anvil past the epoch boundary (900s + buffer)
    await fastForwardTime(901);

    // Step 3: Trigger the keeper to reveal votes and settle rounds.
    // Tlock decryption needs the drand beacon for the targeted round, which is
    // produced in real wall-clock time (~15 min after chain start). Retry with
    // increasing waits to give the beacon time to appear.
    let totalRevealed = 0;
    let totalSettled = 0;

    for (let attempt = 0; attempt < 5; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 4_000));
      const resp = await triggerKeeper("http://localhost:3000");
      totalRevealed += resp.result.votesRevealed;
      totalSettled += resp.result.roundsSettled;
      if (totalRevealed > 0 && totalSettled > 0) break;
    }

    // If no reveals happened, drand beacons aren't available yet (chain too fresh).
    // Skip rather than fail — this is a real-time constraint, not a bug.
    if (totalRevealed === 0) {
      test.skip(true, "Drand beacons not yet available (chain started < 15 min ago)");
      return;
    }
    expect(totalSettled).toBeGreaterThanOrEqual(1);

    // Step 4: Verify settlement via Ponder API
    const { items } = await getContentList({ status: "all", sortBy: "newest", limit: 20 });
    let settledContentId: string | null = null;
    for (const item of items) {
      const settled = await waitForSettlementIndexed(item.id, "http://localhost:42069", 15_000);
      if (settled) {
        settledContentId = item.id;
        break;
      }
    }
    expect(settledContentId).toBeTruthy();

    // Step 5: Verify RatingUpdated — settled content should have rating history
    if (settledContentId) {
      const { content: settledContent, ratings } = await getContentById(settledContentId);

      // After settlement the rating may have moved from the default (50)
      // and a ratingChange record should exist
      expect(ratings.length).toBeGreaterThanOrEqual(1);
      expect(ratings[0]).toHaveProperty("oldRating");
      expect(ratings[0]).toHaveProperty("newRating");

      // Step 6: Verify SubmitterStakeReturned — stake should be returned after settlement
      expect(settledContent.submitterStakeReturned).toBe(true);
    }
  });

  test("portfolio shows vote history after voting", async ({ browser }) => {
    // Use account #2 which has cREP and submitted content
    const context = await browser.newContext();
    const page = await context.newPage();
    await setupWallet(page, ANVIL_ACCOUNTS.account2.privateKey);

    await page.goto("/portfolio");

    // Wait for Portfolio heading (replaces arbitrary timeout)
    const heading = page.getByRole("heading", { name: "Portfolio" });
    await expect(heading).toBeVisible({ timeout: 15_000 });

    // Stats section — scope to main to avoid sidebar matches
    const main = page.locator("main");
    const totalVotesLabel = main.getByText("Total Votes");
    await expect(totalVotesLabel).toBeVisible({ timeout: 10_000 });

    // Vote history section — use heading role to avoid matching h4s in sidebar
    const voteHistoryHeading = page.getByRole("heading", { name: "Vote History" });
    await expect(voteHistoryHeading).toBeVisible({ timeout: 10_000 });

    await context.close();
  });

  test("keeper API returns valid response", async () => {
    const response = await triggerKeeper("http://localhost:3000");
    expect(response).toHaveProperty("success");
    expect(response).toHaveProperty("result");
    expect(response.result).toHaveProperty("votesRevealed");
    expect(response.result).toHaveProperty("roundsSettled");
    expect(response.result).toHaveProperty("roundsCancelled");
  });
});
