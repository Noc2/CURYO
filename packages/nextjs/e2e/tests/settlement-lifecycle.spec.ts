import {
  approveCREP,
  commitVoteDirect,
  getActiveRoundId,
  revealVoteDirect,
  settleRoundDirect,
  submitContentDirect,
  waitForPonderIndexed,
} from "../helpers/admin-helpers";
import { ANVIL_ACCOUNTS } from "../helpers/anvil-accounts";
import { CONTRACT_ADDRESSES } from "../helpers/contracts";
import { fastForwardTime, triggerKeeper } from "../helpers/keeper";
import { setupWallet } from "../helpers/local-storage";
import { getContentById, getContentList } from "../helpers/ponder-api";
import { expect, test } from "@playwright/test";

/**
 * Settlement lifecycle — full vote → reveal → settle cycle.
 *
 * Uses direct contract calls for the entire flow (commit, reveal, settle)
 * to avoid drand beacon timing dependencies.
 *
 * Account allocation (exclusive to this file):
 * - Account #10 — submits fresh content
 * - Accounts #3, #4, #5 — vote via direct contract calls
 * - Account #1 (keeper) — reveals and settles
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

  test("full cycle: vote → reveal → settle", async () => {
    test.setTimeout(120_000);
    test.skip(!newContentId, "No content from previous test");

    // Step 1: Commit votes via direct contract calls
    const voters = [
      { account: ANVIL_ACCOUNTS.account3, isUp: true },
      { account: ANVIL_ACCOUNTS.account4, isUp: true },
      { account: ANVIL_ACCOUNTS.account5, isUp: false },
    ];
    const commitData: Array<{ voter: string; commitHash: `0x${string}`; salt: `0x${string}`; isUp: boolean }> = [];

    for (let i = 0; i < voters.length; i++) {
      const salt = `0x${(i + 1).toString(16).padStart(64, "0")}` as `0x${string}`;
      await approveCREP(VOTING_ENGINE, STAKE, voters[i].account.address, CREP_TOKEN);
      const { success, commitHash } = await commitVoteDirect(
        BigInt(newContentId!),
        voters[i].isUp,
        salt,
        STAKE,
        "0x0000000000000000000000000000000000000000",
        voters[i].account.address,
        VOTING_ENGINE,
      );
      expect(success, `Commit failed for voter ${i}`).toBe(true);
      commitData.push({ voter: voters[i].account.address, commitHash, salt, isUp: voters[i].isUp });
    }

    // Step 2: Get the active round ID
    const roundId = await getActiveRoundId(BigInt(newContentId!), VOTING_ENGINE);
    expect(roundId).toBeGreaterThan(0n);

    // Step 3: Fast-forward past the epoch boundary
    await fastForwardTime(901);

    // Step 4: Reveal all votes directly (bypasses drand/tlock)
    const keeper = ANVIL_ACCOUNTS.account1;
    for (const cd of commitData) {
      const revealed = await revealVoteDirect(
        BigInt(newContentId!),
        roundId,
        cd.voter,
        cd.commitHash,
        cd.isUp,
        cd.salt,
        keeper.address,
        VOTING_ENGINE,
      );
      expect(revealed, `Reveal failed for ${cd.voter}`).toBe(true);
    }

    // Step 5: Fast-forward for settlement delay
    await fastForwardTime(901);

    // Step 6: Settle the round directly
    const settled = await settleRoundDirect(BigInt(newContentId!), roundId, keeper.address, VOTING_ENGINE);
    expect(settled, "Settlement failed").toBe(true);

    // Step 7: Wait for Ponder to index the settlement AND rating update
    const settledIndexed = await waitForPonderIndexed(async () => {
      const data = await getContentById(newContentId!);
      const roundSettled = data.rounds.some(
        r => String(r.roundId) === String(roundId) && (r.state === 1 || r.state === 3),
      );
      return roundSettled && data.ratings.length >= 1;
    }, 30_000);
    expect(settledIndexed, "Ponder did not index settlement + rating for the fresh content").toBe(true);

    // Step 8: Verify RatingUpdated
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

  test("keeper API returns valid response", async () => {
    const response = await triggerKeeper("http://localhost:3000");
    expect(response).toHaveProperty("success");
    expect(response).toHaveProperty("result");
    expect(response.result).toHaveProperty("votesRevealed");
    expect(response.result).toHaveProperty("roundsSettled");
    expect(response.result).toHaveProperty("roundsCancelled");
  });
});
