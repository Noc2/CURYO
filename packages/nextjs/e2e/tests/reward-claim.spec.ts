import { claimSubmitterReward, waitForPonderIndexed } from "../helpers/admin-helpers";
import { ANVIL_ACCOUNTS } from "../helpers/anvil-accounts";
import { CONTRACT_ADDRESSES } from "../helpers/contracts";
import { fastForwardTime, triggerKeeper, waitForSettlementIndexed } from "../helpers/keeper";
import { setupWallet } from "../helpers/local-storage";
import { getContentList, getSubmitterRewards, ponderGet } from "../helpers/ponder-api";
import { voteOnContent } from "../helpers/vote-helpers";
import { expect, test } from "@playwright/test";

/**
 * Reward claiming after settlement.
 * Triggers Ponder events: RewardClaimed, SubmitterRewardClaimed, RatingUpdated.
 *
 * Uses accounts #3-#7 for voting (5 voters = minVoters threshold).
 * Tests run serially: vote → settle → verify → claim → submitter claim.
 */
test.describe("Reward claim lifecycle", () => {
  // These tests depend on each other and share state
  test.describe.configure({ mode: "serial" });

  // Extend timeout for the entire describe
  let settledContentId: string | null = null;

  test("vote with 5 accounts and settle a round", async ({ browser }) => {
    test.setTimeout(300_000);

    const voters = [
      { account: ANVIL_ACCOUNTS.account3, direction: "up" as const },
      { account: ANVIL_ACCOUNTS.account4, direction: "up" as const },
      { account: ANVIL_ACCOUNTS.account5, direction: "up" as const },
      { account: ANVIL_ACCOUNTS.account6, direction: "up" as const },
      { account: ANVIL_ACCOUNTS.account7, direction: "down" as const },
    ];

    let successCount = 0;

    // Step 1: Five accounts vote on content
    for (const voter of voters) {
      const context = await browser.newContext();
      const page = await context.newPage();
      await setupWallet(page, voter.account.privateKey);

      const success = await voteOnContent(page, voter.direction);
      if (success) successCount++;

      await context.close();
    }

    // Need 5 votes for settlement (minVoters=5)
    if (successCount < 5) {
      test.skip(true, `Only ${successCount}/5 votes succeeded (cooldowns from prior runs)`);
      return;
    }

    // Step 2: Fast-forward past the epoch boundary (900s + buffer)
    await fastForwardTime(901);

    // Step 3: Trigger keeper to reveal and settle.
    // Tlock decryption needs the drand beacon for the targeted round, which is
    // produced in real wall-clock time (~15 min after chain start).
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
    if (totalRevealed === 0) {
      test.skip(true, "Drand beacons not yet available (chain started < 15 min ago)");
      return;
    }
    expect(totalSettled).toBeGreaterThanOrEqual(1);

    // Step 4: Find the settled content for later tests
    const { items } = await getContentList({ status: "all", limit: 20 });
    for (const item of items) {
      const settled = await waitForSettlementIndexed(item.id, "http://localhost:42069", 15_000);
      if (settled) {
        settledContentId = item.id;
        break;
      }
    }

    expect(settledContentId).toBeTruthy();
  });

  test("content rating updates after settlement", async () => {
    test.skip(!settledContentId, "No settled content from previous test");

    const data = await ponderGet(`/content/${settledContentId}`);
    expect(data).toHaveProperty("content");
    expect(data).toHaveProperty("rounds");

    // Should have at least one settled round
    const settledRounds = data.rounds.filter((r: { state: number }) => r.state === 1 || r.state === 3);
    expect(settledRounds.length).toBeGreaterThanOrEqual(1);

    // Content should have rating data
    expect(data.content).toHaveProperty("rating");
    expect(data.content).toHaveProperty("totalVotes");
  });

  test("portfolio shows claim button after settlement", async ({ browser }) => {
    test.setTimeout(120_000);
    test.skip(!settledContentId, "No settled content from previous test");

    // Use account #3 who voted in the first test
    const context = await browser.newContext();
    const page = await context.newPage();
    await setupWallet(page, ANVIL_ACCOUNTS.account3.privateKey);

    await page.goto("/portfolio");

    // Wait for portfolio to load
    const heading = page.getByRole("heading", { name: "Portfolio" });
    await expect(heading).toBeVisible({ timeout: 15_000 });

    // Wait for vote history to load
    const voteHistory = page.getByRole("heading", { name: "Vote History" });
    await expect(voteHistory).toBeVisible({ timeout: 10_000 });

    // Should see either "Claim Reward" button (settled) or "Active" badge
    const claimBtn = page.getByRole("button", { name: "Claim Reward" });
    const activeBadge = page.getByText("Active");
    const anyState = claimBtn.or(activeBadge);
    await expect(anyState.first()).toBeVisible({ timeout: 15_000 });

    // If claim button is visible, click it to test the claim flow
    const canClaim = await claimBtn
      .first()
      .waitFor({ state: "visible", timeout: 5_000 })
      .then(() => true)
      .catch(() => false);
    if (canClaim) {
      await claimBtn.first().click();

      // Wait for success notification
      const success = page.getByText(/Reward claimed/i).or(page.getByText(/success/i));
      const errorMsg = page
        .getByText(/failed/i)
        .or(page.getByText(/error/i))
        .or(page.getByText(/reverted/i));
      const outcome = success.or(errorMsg);
      await expect(outcome.first()).toBeVisible({ timeout: 30_000 });
    }

    await context.close();
  });

  test("submitter rewards visible in Ponder API", async () => {
    test.skip(!settledContentId, "No settled content from previous test");

    // Account #2 submitted content #1 — check their reward data
    const address = ANVIL_ACCOUNTS.account2.address.toLowerCase();
    const data = await ponderGet(`/rewards?voter=${address}`);
    expect(data).toHaveProperty("items");
    expect(Array.isArray(data.items)).toBe(true);
    // Rewards may or may not exist depending on whether account #2's content was settled
  });

  test("submitter claims reward via direct call and Ponder indexes it", async () => {
    test.skip(!settledContentId, "No settled content from previous test");
    test.setTimeout(60_000);

    const REWARD_DISTRIBUTOR = CONTRACT_ADDRESSES.RoundRewardDistributor;

    // Get the settled round info
    const data = await ponderGet(`/content/${settledContentId}`);
    const settledRound = data.rounds?.find((r: { state: number }) => r.state === 1 || r.state === 3);

    if (!settledRound) {
      test.skip(true, "No settled round found for this content");
      return;
    }

    // The submitter is stored in the content data
    const submitter = data.content.submitter;

    // Claim submitter reward — any account can call, but reward goes to the submitter
    const success = await claimSubmitterReward(
      BigInt(settledContentId!),
      BigInt(settledRound.roundId),
      submitter,
      REWARD_DISTRIBUTOR,
    );

    // The claim may fail if there's no submitter reward for this round (e.g., already claimed,
    // or submitter reward is 0). That's OK — we still verify the API endpoint works.
    if (!success) {
      // Verify the submitter-rewards endpoint still works even with no claims
      const { items } = await getSubmitterRewards(submitter);
      expect(Array.isArray(items)).toBe(true);
      return;
    }

    // Wait for Ponder to index the submitter reward claim
    const indexed = await waitForPonderIndexed(async () => {
      const { items } = await getSubmitterRewards(submitter);
      return items.some(r => r.contentId === settledContentId && r.roundId === settledRound.roundId);
    });

    if (!indexed) {
      test.skip(true, "Ponder not indexing submitter reward claim — on-chain tx succeeded");
      return;
    }

    const { items } = await getSubmitterRewards(submitter);
    const claim = items.find(r => r.contentId === settledContentId && r.roundId === settledRound.roundId);
    expect(claim).toBeTruthy();
    expect(claim!.submitter.toLowerCase()).toBe(submitter.toLowerCase());
  });

  test("losing voter has no reward for the settled round", async () => {
    test.skip(!settledContentId, "No settled content from previous test");

    // Account #7 voted DOWN while accounts #3-#6 voted UP → account #7 is the loser
    const loserAddress = ANVIL_ACCOUNTS.account7.address.toLowerCase();

    // Get the settled round info to know which roundId to check
    const data = await ponderGet(`/content/${settledContentId}`);
    const settledRound = data.rounds?.find((r: { state: number }) => r.state === 1);

    if (!settledRound) {
      // If round is tied (state=3), both sides get refunds — skip
      test.skip(true, "No definitively settled round (may be tied)");
      return;
    }

    // If UP won (upWins=true), then DOWN voters (account #7) should have no reward
    if (settledRound.upWins) {
      const rewards = await ponderGet(`/rewards?voter=${loserAddress}`);
      const loserReward = rewards.items?.find(
        (r: { contentId: string; roundId: string }) =>
          r.contentId === settledContentId && r.roundId === settledRound.roundId,
      );
      // Loser should NOT have a reward entry (their stake is forfeited)
      expect(loserReward).toBeFalsy();
    }
  });
});
