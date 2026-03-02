import {
  approveCREP,
  getActiveRoundId,
  mineBlocks,
  submitContentDirect,
  trySettleDirect,
  voteDirect,
  waitForPonderIndexed,
  waitForPonderSync,
} from "../helpers/admin-helpers";
import { ANVIL_ACCOUNTS } from "../helpers/anvil-accounts";
import { CONTRACT_ADDRESSES } from "../helpers/contracts";
import { setupWallet } from "../helpers/local-storage";
import { getContentById, getContentList } from "../helpers/ponder-api";
import { expect, test } from "@playwright/test";

/**
 * Settlement lifecycle — full vote → settle cycle.
 *
 * Uses direct contract calls for the entire flow (vote, settle)
 * with public voting (no commit-reveal).
 *
 * Account allocation (exclusive to this file):
 * - Account #10 — submits fresh content
 * - Accounts #3, #4, #5 — vote via direct contract calls
 * - Account #1 (keeper) — settles
 */
test.describe("Settlement lifecycle", () => {
  test.describe.configure({ mode: "serial" });

  const VOTING_ENGINE = CONTRACT_ADDRESSES.RoundVotingEngine;
  const CREP_TOKEN = CONTRACT_ADDRESSES.CuryoReputation;
  const CONTENT_REGISTRY = CONTRACT_ADDRESSES.ContentRegistry;
  const STAKE = BigInt(10e6); // 10 cREP (above MIN_STAKE_FOR_RATING threshold)
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

  let newContentId: string | null = null;

  test("submit fresh content for settlement test", async () => {
    test.setTimeout(60_000);

    const submitter = ANVIL_ACCOUNTS.account10;

    const approved = await approveCREP(CONTENT_REGISTRY, BigInt(10e6), submitter.address, CREP_TOKEN);
    expect(approved, "cREP approval for content submission failed").toBe(true);

    const uniqueId = Date.now();
    const success = await submitContentDirect(
      `https://www.youtube.com/watch?v=settlement_test_${uniqueId}`,
      `Settlement Test ${uniqueId}`,
      "test",
      1,
      submitter.address,
      CONTENT_REGISTRY,
    );
    expect(success, "Content submission tx failed").toBe(true);

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

  test("full cycle: vote → settle", async () => {
    test.setTimeout(120_000);
    test.skip(!newContentId, "No content from previous test");

    // Step 1: Vote via direct contract calls (public voting — no commit/reveal)
    const voters = [
      { account: ANVIL_ACCOUNTS.account3, isUp: true },
      { account: ANVIL_ACCOUNTS.account4, isUp: true },
      { account: ANVIL_ACCOUNTS.account5, isUp: false },
    ];

    for (let i = 0; i < voters.length; i++) {
      await approveCREP(VOTING_ENGINE, STAKE, voters[i].account.address, CREP_TOKEN);
      const success = await voteDirect(
        BigInt(newContentId!),
        voters[i].isUp,
        STAKE,
        ZERO_ADDRESS,
        voters[i].account.address,
        VOTING_ENGINE,
      );
      expect(success, `Vote failed for voter ${i}`).toBe(true);
    }

    // Step 2: Get the active round ID
    const roundId = await getActiveRoundId(BigInt(newContentId!), VOTING_ENGINE);
    expect(roundId).toBeGreaterThan(0n);

    // Step 3: Mine blocks past maxEpochBlocks for guaranteed settlement
    await mineBlocks(1801);
    await waitForPonderSync();

    // Step 4: Settle the round
    const keeper = ANVIL_ACCOUNTS.account1;
    const settled = await trySettleDirect(BigInt(newContentId!), keeper.address, VOTING_ENGINE);
    expect(settled, "Settlement failed").toBe(true);

    // Step 5: Wait for Ponder to index the settlement AND rating update
    const settledIndexed = await waitForPonderIndexed(async () => {
      const data = await getContentById(newContentId!);
      const roundSettled = data.rounds.some(
        r => String(r.roundId) === String(roundId) && (r.state === 1 || r.state === 3),
      );
      return roundSettled && data.ratings.length >= 1;
    }, 30_000);
    expect(settledIndexed, "Ponder did not index settlement + rating for the fresh content").toBe(true);

    // Step 6: Verify RatingUpdated
    const { content: settledContent, ratings } = await getContentById(newContentId!);
    expect(ratings.length).toBeGreaterThanOrEqual(1);
    expect(ratings[0]).toHaveProperty("oldRating");
    expect(ratings[0]).toHaveProperty("newRating");

    // Submitter stake is NOT returned yet (needs STAKE_RETURN_PERIOD = 4 days)
    expect(settledContent.submitterStakeReturned).toBe(false);
  });

  test("portfolio shows vote history after voting", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await setupWallet(page, ANVIL_ACCOUNTS.account2.privateKey);

    await page.goto("/portfolio");

    const heading = page.getByRole("heading", { name: "Portfolio" });
    await expect(heading).toBeVisible({ timeout: 15_000 });

    const main = page.locator("main");
    const totalVotesLabel = main.getByText("Total Votes");
    await expect(totalVotesLabel).toBeVisible({ timeout: 10_000 });

    const voteHistoryHeading = page.getByRole("heading", { name: "Vote History" });
    await expect(voteHistoryHeading).toBeVisible({ timeout: 10_000 });

    await context.close();
  });
});
