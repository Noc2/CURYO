import {
  approveCREP,
  commitVoteDirect,
  getActiveRoundId,
  submitContentDirect,
  waitForPonderIndexed,
} from "../helpers/admin-helpers";
import { ANVIL_ACCOUNTS } from "../helpers/anvil-accounts";
import { CONTRACT_ADDRESSES } from "../helpers/contracts";
import { fastForwardTime, triggerKeeper, waitForSettlementIndexed } from "../helpers/keeper";
import { setupWallet } from "../helpers/local-storage";
import { getContentById, getContentList } from "../helpers/ponder-api";
import { expect, test } from "@playwright/test";

/**
 * Settlement lifecycle — full vote → reveal → settle cycle.
 *
 * Uses direct contract calls for voting (bypasses UI) for reliability.
 * The keeper handles reveal + settle via its API endpoint.
 *
 * Account allocation (exclusive to this file):
 * - Account #10 — submits fresh content
 * - Accounts #3, #4, #5 — vote on the fresh content via direct contract calls
 */
test.describe("Settlement lifecycle", () => {
  test.describe.configure({ mode: "serial" });

  const VOTING_ENGINE = CONTRACT_ADDRESSES.RoundVotingEngine;
  const CREP_TOKEN = CONTRACT_ADDRESSES.CuryoReputation;
  const CONTENT_REGISTRY = CONTRACT_ADDRESSES.ContentRegistry;
  const STAKE = BigInt(1e6); // 1 cREP

  let newContentId: string | null = null;

  test("submit fresh content for settlement test", async () => {
    test.setTimeout(60_000);

    const submitter = ANVIL_ACCOUNTS.account10;

    // Approve MIN_SUBMITTER_STAKE (10 cREP = 10e6) to ContentRegistry
    const approved = await approveCREP(CONTENT_REGISTRY, BigInt(10e6), submitter.address, CREP_TOKEN);
    expect(approved, "cREP approval for content submission failed").toBe(true);

    // Submit content with a unique URL
    const uniqueId = Date.now();
    const success = await submitContentDirect(
      `https://www.youtube.com/watch?v=settlement_test_${uniqueId}`,
      `Settlement Test ${uniqueId}`,
      "test",
      1, // categoryId 1 = YouTube
      submitter.address,
      CONTENT_REGISTRY,
    );
    expect(success, "Content submission tx failed").toBe(true);

    // Wait for Ponder to index the new content
    const indexed = await waitForPonderIndexed(async () => {
      const { items } = await getContentList({ status: "all", sortBy: "newest", limit: 5 });
      const match = items.find(item => item.url.includes(`settlement_test_${uniqueId}`));
      if (match) {
        newContentId = match.id;
        return true;
      }
      return false;
    }, 30_000);

    expect(indexed, "Ponder did not index the newly submitted content").toBe(true);
    expect(newContentId).toBeTruthy();
  });

  test("full cycle: vote → reveal → settle", async () => {
    test.setTimeout(240_000);
    test.skip(!newContentId, "No content from previous test");

    // Vote via direct contract calls — accounts #3 (up), #4 (up), #5 (down)
    const voters = [
      { account: ANVIL_ACCOUNTS.account3, isUp: true },
      { account: ANVIL_ACCOUNTS.account4, isUp: true },
      { account: ANVIL_ACCOUNTS.account5, isUp: false },
    ];

    for (let i = 0; i < voters.length; i++) {
      const salt = `0x${(i + 1).toString(16).padStart(64, "0")}` as `0x${string}`;
      await approveCREP(VOTING_ENGINE, STAKE, voters[i].account.address, CREP_TOKEN);
      const { success } = await commitVoteDirect(
        BigInt(newContentId!),
        voters[i].isUp,
        salt,
        STAKE,
        "0x0000000000000000000000000000000000000000",
        voters[i].account.address,
        VOTING_ENGINE,
      );
      expect(success, `Commit failed for voter ${i}`).toBe(true);
    }

    // Step 2: Fast-forward Anvil past the epoch boundary (900s + buffer)
    await fastForwardTime(901);

    // Step 3: Trigger the keeper to reveal votes and settle rounds.
    // Tlock decryption needs the drand beacon for the targeted round, which is
    // produced in real wall-clock time (~15 min after chain start). Retry with
    // increasing waits to give the beacon time to appear.
    let totalRevealed = 0;
    let totalSettled = 0;

    for (let attempt = 0; attempt < 20; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 15_000));
      const resp = await triggerKeeper("http://localhost:3000");
      totalRevealed += resp.result.votesRevealed;
      totalSettled += resp.result.roundsSettled;
      if (totalRevealed > 0 && totalSettled > 0) break;
    }

    expect(totalRevealed, "Drand beacons not available — keeper revealed 0 votes").toBeGreaterThan(0);
    expect(totalSettled).toBeGreaterThanOrEqual(1);

    // Step 4: Verify settlement via Ponder API
    const settled = await waitForSettlementIndexed(newContentId!, "http://localhost:42069", 30_000);
    expect(settled, "Ponder did not index settlement for the fresh content").toBe(true);

    // Step 5: Verify RatingUpdated — settled content should have rating history
    const { content: settledContent, ratings } = await getContentById(newContentId!);

    // After settlement the rating may have moved from the default (50)
    // and a ratingChange record should exist
    expect(ratings.length).toBeGreaterThanOrEqual(1);
    expect(ratings[0]).toHaveProperty("oldRating");
    expect(ratings[0]).toHaveProperty("newRating");

    // Step 6: Submitter stake is NOT returned yet — _checkSubmitterStake only auto-returns
    // after STAKE_RETURN_PERIOD (4 days). In tests, only ~30 min of chain time passes.
    expect(settledContent.submitterStakeReturned).toBe(false);
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
