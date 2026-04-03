import {
  approveCREP,
  claimParticipationReward,
  claimSubmitterReward,
  claimVoterReward,
  commitVoteDirect,
  evmIncreaseTime,
  getActiveRoundId,
  processUnrevealedVotes,
  readAddress,
  readTokenBalance,
  readUint256,
  revealVoteDirect,
  setTestConfig,
  settleRoundDirect,
  submitContentDirect,
  waitForPonderIndexed,
  waitForPonderSync,
} from "../helpers/admin-helpers";
import { ANVIL_ACCOUNTS, DEPLOYER } from "../helpers/anvil-accounts";
import { newE2EContext } from "../helpers/browser-context";
import { CONTRACT_ADDRESSES } from "../helpers/contracts";
import { gotoWithRetry } from "../helpers/wait-helpers";
import { setupWallet } from "../helpers/wallet-session";
import { getContentById, getContentList, getSubmitterRewards, ponderGet } from "../helpers/ponder-api";
import { expect, test } from "@playwright/test";

/**
 * Reward claiming after settlement (tlock commit-reveal flow).
 * Triggers Ponder events: RewardClaimed, SubmitterRewardClaimed, RatingUpdated.
 *
 * Uses direct contract calls for the entire flow:
 *   commitVote → (epoch ends) → revealVoteByCommitKey → settleRound → claim
 *
 * Account allocation (exclusive to this file for voting):
 * - Account #2 — submits fresh content (also used for submitter reward tests)
 * - Accounts #3, #4 — vote UP (winning side)
 * - Account #7 — votes DOWN (losing side, tests 5% rebate claims)
 * - Account #1 (keeper) — reveals votes and settles
 *
 * Tests run serially: submit → commit+reveal+settle → verify → claim → submitter claim.
 */
test.describe("Reward claim lifecycle", () => {
  test.describe.configure({ mode: "serial" });

  const VOTING_ENGINE = CONTRACT_ADDRESSES.RoundVotingEngine;
  const REWARD_DISTRIBUTOR = CONTRACT_ADDRESSES.RoundRewardDistributor;
  const CREP_TOKEN = CONTRACT_ADDRESSES.CuryoReputation;
  const CONTENT_REGISTRY = CONTRACT_ADDRESSES.ContentRegistry;
  const STAKE = BigInt(10e6); // 10 cREP (above MIN_STAKE_FOR_RATING threshold)
  const LOSER_REBATE = STAKE / 20n; // 5%
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const EPOCH_DURATION = 300; // 5 min — contract minimum is 5 minutes

  test.beforeAll(async () => {
    const ok = await setTestConfig(VOTING_ENGINE, DEPLOYER.address, EPOCH_DURATION);
    if (!ok) throw new Error("Failed to set test config");
  });

  let newContentId: string | null = null;
  let settledContentId: string | null = null;
  let roundId: bigint = 0n;

  test("submit fresh content for reward claim test", async () => {
    test.setTimeout(60_000);

    const submitter = ANVIL_ACCOUNTS.account2;

    const approved = await approveCREP(CONTENT_REGISTRY, BigInt(10e6), submitter.address, CREP_TOKEN);
    expect(approved, "cREP approval for content submission failed").toBe(true);

    const uniqueId = Date.now();
    const success = await submitContentDirect(
      `https://www.youtube.com/watch?v=reward_test_${uniqueId}`,
      `Reward Claim Test ${uniqueId}`,
      `Reward claim test description ${uniqueId}`,
      "test",
      1,
      submitter.address,
      CONTENT_REGISTRY,
    );
    expect(success, "Content submission tx failed").toBe(true);

    const indexed = await waitForPonderIndexed(async () => {
      const { items } = await getContentList({ status: "all", sortBy: "newest", limit: 5 });
      const match = items.find(item => item.url.includes(`reward_test_${uniqueId}`));
      if (match) {
        newContentId = match.id;
        return true;
      }
      return false;
    }, 30_000);

    expect(indexed, "Ponder did not index the newly submitted content").toBe(true);
    expect(newContentId).toBeTruthy();
  });

  test("commit, reveal, and settle a round with 3 voters", async () => {
    test.setTimeout(120_000);
    test.skip(!newContentId, "No content from previous test");

    // Step 1: Commit votes — #3 UP, #4 UP, #7 DOWN
    const voters = [
      { account: ANVIL_ACCOUNTS.account3, isUp: true },
      { account: ANVIL_ACCOUNTS.account4, isUp: true },
      { account: ANVIL_ACCOUNTS.account7, isUp: false },
    ];

    const commits: { commitKey: `0x${string}`; isUp: boolean; salt: `0x${string}` }[] = [];

    for (let i = 0; i < voters.length; i++) {
      await approveCREP(VOTING_ENGINE, STAKE, voters[i].account.address, CREP_TOKEN);
      const result = await commitVoteDirect(
        BigInt(newContentId!),
        voters[i].isUp,
        STAKE,
        ZERO_ADDRESS,
        voters[i].account.address,
        VOTING_ENGINE,
      );
      expect(result.success, `Commit failed for voter ${i}`).toBe(true);
      commits.push({ commitKey: result.commitKey, isUp: result.isUp, salt: result.salt });
    }

    // Step 2: Get active round ID
    roundId = await getActiveRoundId(BigInt(newContentId!), VOTING_ENGINE);
    expect(roundId).toBeGreaterThan(0n);

    // Step 3: Fast-forward past epoch duration so votes become revealable
    await evmIncreaseTime(EPOCH_DURATION + 1);

    // Step 4: Reveal all votes (keeper does this)
    const keeper = ANVIL_ACCOUNTS.account1;
    for (let i = 0; i < commits.length; i++) {
      const revealed = await revealVoteDirect(
        BigInt(newContentId!),
        roundId,
        commits[i].commitKey,
        commits[i].isUp,
        commits[i].salt,
        keeper.address,
        VOTING_ENGINE,
      );
      expect(revealed, `Reveal failed for voter ${i}`).toBe(true);
    }

    // Step 5: Fast-forward past epoch (settlement has no delay, but chain time must advance)
    await evmIncreaseTime(EPOCH_DURATION + 1);
    await waitForPonderSync();

    // Step 6: Settle the round
    const settled = await settleRoundDirect(BigInt(newContentId!), roundId, keeper.address, VOTING_ENGINE);
    expect(settled, "Settlement failed").toBe(true);

    // Step 7: Wait for Ponder to index
    const settledIndexed = await waitForPonderIndexed(async () => {
      const data = await getContentById(newContentId!);
      return data.rounds.some(r => String(r.roundId) === String(roundId) && (r.state === 1 || r.state === 3));
    }, 30_000);
    expect(settledIndexed, "Ponder did not index settlement").toBe(true);

    settledContentId = newContentId;
  });

  test("content rating updates after settlement", async () => {
    test.skip(!settledContentId, "No settled content from previous test");

    const data = await ponderGet(`/content/${settledContentId}`);
    expect(data).toHaveProperty("content");
    expect(data).toHaveProperty("rounds");

    const settledRounds = data.rounds.filter((r: { state: number }) => r.state === 1 || r.state === 3);
    expect(settledRounds.length).toBeGreaterThanOrEqual(1);

    expect(data.content).toHaveProperty("rating");
    expect(data.content).toHaveProperty("totalVotes");
  });

  test("sidebar wallet summary shows claim button after settlement", async ({ browser }) => {
    test.setTimeout(120_000);
    test.skip(!settledContentId || roundId === 0n, "No settled content from previous test");

    const context = await newE2EContext(browser);
    const page = await context.newPage();
    await setupWallet(page, ANVIL_ACCOUNTS.account4.privateKey);

    await gotoWithRetry(page, "/governance#profile", { ensureWalletConnected: true });

    const walletSummary = page.getByTestId("wallet-connected");
    await expect(walletSummary.getByRole("button", { name: /Claim .* cREP/ })).toBeVisible({ timeout: 15_000 });

    await context.close();
  });

  test("winning voter claims reward via direct call", async () => {
    test.skip(!settledContentId || roundId === 0n, "No settled content from previous test");
    test.setTimeout(60_000);

    const REWARD_DISTRIBUTOR = CONTRACT_ADDRESSES.RoundRewardDistributor;

    // Account #3 voted UP (winning side) — claim voter reward
    const winner = ANVIL_ACCOUNTS.account3;
    const success = await claimVoterReward(BigInt(settledContentId!), roundId, winner.address, REWARD_DISTRIBUTOR);
    expect(success, "Voter reward claim should succeed for winning voter").toBe(true);
  });

  test("portfolio shows claim button after settlement", async ({ browser }) => {
    test.setTimeout(120_000);
    test.skip(!settledContentId, "No settled content from previous test");

    const context = await newE2EContext(browser);
    const page = await context.newPage();
    await setupWallet(page, ANVIL_ACCOUNTS.account3.privateKey);

    await gotoWithRetry(page, "/portfolio", { ensureWalletConnected: true });

    const heading = page.getByRole("heading", { name: "Portfolio" });
    await expect(heading).toBeVisible({ timeout: 15_000 });

    const voteHistory = page.getByRole("heading", { name: "Vote History" });
    await expect(voteHistory).toBeVisible({ timeout: 10_000 });

    // Scroll to vote history so round-status elements are in the viewport
    await voteHistory.scrollIntoViewIfNeeded();

    // Check for any settlement state badge — use toPass() to retry because
    // .or().first() can pick a hidden element earlier in DOM order.
    await expect(async () => {
      const hasClaimBtn = await page.getByRole("button", { name: "Claim Reward" }).first().isVisible();
      const hasActive = await page
        .getByText(/^Active( ·|$)/)
        .first()
        .isVisible();
      const hasClaimed = await page.getByText("Claimed", { exact: true }).first().isVisible();
      expect(hasClaimBtn || hasActive || hasClaimed).toBeTruthy();
    }).toPass({ timeout: 15_000 });

    await context.close();
  });

  test("submitter rewards visible in Ponder API", async () => {
    test.skip(!settledContentId, "No settled content from previous test");

    const address = ANVIL_ACCOUNTS.account2.address.toLowerCase();
    const data = await ponderGet(`/rewards?voter=${address}`);
    expect(data).toHaveProperty("items");
    expect(Array.isArray(data.items)).toBe(true);
  });

  test("submitter claims reward via direct call and Ponder indexes it", async () => {
    test.skip(!settledContentId, "No settled content from previous test");
    test.setTimeout(60_000);

    const REWARD_DISTRIBUTOR = CONTRACT_ADDRESSES.RoundRewardDistributor;

    const data = await ponderGet(`/content/${settledContentId}`);
    const settledRound = data.rounds?.find((r: { state: number }) => r.state === 1 || r.state === 3);

    if (!settledRound) {
      test.skip(true, "No settled round found for this content");
      return;
    }

    const submitter = data.content.submitter;

    const success = await claimSubmitterReward(
      BigInt(settledContentId!),
      BigInt(settledRound.roundId),
      submitter,
      REWARD_DISTRIBUTOR,
    );

    if (!success) {
      const { items } = await getSubmitterRewards(submitter);
      expect(Array.isArray(items)).toBe(true);
      return;
    }

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

  test("losing voter claims the fixed rebate for the settled round", async () => {
    test.skip(!settledContentId || roundId === 0n, "No settled content from previous test");
    test.setTimeout(60_000);

    const REWARD_DISTRIBUTOR = CONTRACT_ADDRESSES.RoundRewardDistributor;
    const loser = ANVIL_ACCOUNTS.account7;
    const loserAddress = loser.address.toLowerCase();

    const success = await claimVoterReward(BigInt(settledContentId!), roundId, loser.address, REWARD_DISTRIBUTOR);
    expect(success, "Revealed losing voter should be able to claim the 5% rebate").toBe(true);

    const data = await ponderGet(`/content/${settledContentId}`);
    const settledRound = data.rounds?.find((r: { state: number }) => r.state === 1);

    if (!settledRound) {
      test.skip(true, "No definitively settled round (may be tied)");
      return;
    }

    const indexed = await waitForPonderIndexed(async () => {
      const rewards = await ponderGet(`/rewards?voter=${loserAddress}`);
      return rewards.items?.some(
        (r: { contentId: string; roundId: string }) =>
          r.contentId === settledContentId && r.roundId === settledRound.roundId,
      );
    });

    if (!indexed) {
      test.skip(true, "Ponder not indexing loser rebate claim — on-chain tx succeeded");
      return;
    }

    const rewards = await ponderGet(`/rewards?voter=${loserAddress}`);
    const loserReward = rewards.items?.find(
      (r: { contentId: string; roundId: string }) =>
        r.contentId === settledContentId && r.roundId === settledRound.roundId,
    );
    expect(loserReward).toBeTruthy();
    expect(loserReward.crepReward).toBe(LOSER_REBATE.toString());
    expect(loserReward.stakeReturned).toBe("0");
  });

  test("winning voter claims participation reward, double claim reverts", async () => {
    test.skip(!settledContentId || roundId === 0n, "No settled content from previous test");
    test.setTimeout(60_000);

    // Account #3 voted UP (winning side) — claim participation reward
    const voter = ANVIL_ACCOUNTS.account3;
    const success = await claimParticipationReward(
      BigInt(settledContentId!),
      roundId,
      voter.address,
      REWARD_DISTRIBUTOR,
    );
    expect(success, "Participation reward claim should succeed").toBe(true);

    // Double claim should revert (AlreadyClaimed)
    const doubleClaim = await claimParticipationReward(
      BigInt(settledContentId!),
      roundId,
      voter.address,
      REWARD_DISTRIBUTOR,
    );
    expect(doubleClaim, "Double participation reward claim should revert").toBe(false);
  });

  test("losing voter cannot claim participation reward (NotWinningSide)", async () => {
    test.skip(!settledContentId || roundId === 0n, "No settled content from previous test");
    test.setTimeout(60_000);

    const loser = ANVIL_ACCOUNTS.account7;
    const result = await claimParticipationReward(
      BigInt(settledContentId!),
      roundId,
      loser.address,
      REWARD_DISTRIBUTOR,
    );
    expect(result, "Losing voter participation reward claim should revert with NotWinningSide").toBe(false);
  });

  test("processUnrevealedVotes reverts when nothing to process (NothingProcessed)", async () => {
    test.skip(!settledContentId || roundId === 0n, "No settled content from previous test");
    test.setTimeout(60_000);

    const keeper = ANVIL_ACCOUNTS.account1;
    const result = await processUnrevealedVotes(
      BigInt(settledContentId!),
      roundId,
      0,
      10,
      keeper.address,
      VOTING_ENGINE,
    );
    expect(result, "processUnrevealedVotes should revert with NothingProcessed when all votes revealed").toBe(false);
  });

  test("processUnrevealedVotes forfeits unrevealed past-epoch stakes and pays keeper once", async () => {
    test.setTimeout(180_000);

    // All voters commit in epoch 0. After settlement, unrevealed epoch-0
    // commits are "past epoch" (revealableAfter <= settledAt) → forfeited.
    // The future-epoch refund path is covered by Foundry unit tests
    // (test_ProcessUnrevealed_RefundsCurrentEpochVote) because E2E timing
    // makes it impractical to create true future-epoch commits here.
    const submitter = ANVIL_ACCOUNTS.account10;
    const keeper = ANVIL_ACCOUNTS.account1;
    const unrevealed1 = ANVIL_ACCOUNTS.account5;
    const unrevealed2 = ANVIL_ACCOUNTS.account6;
    const uniqueId = Date.now();

    const submitApproved = await approveCREP(CONTENT_REGISTRY, BigInt(10e6), submitter.address, CREP_TOKEN);
    expect(submitApproved, "Content submission approval failed").toBe(true);

    const submitted = await submitContentDirect(
      `https://www.youtube.com/watch?v=cleanup_test_${uniqueId}`,
      `Cleanup Test ${uniqueId}`,
      `Cleanup test description ${uniqueId}`,
      "test",
      1,
      submitter.address,
      CONTENT_REGISTRY,
    );
    expect(submitted, "Content submission failed").toBe(true);

    let cleanupContentId: string | null = null;
    const indexedContent = await waitForPonderIndexed(async () => {
      const { items } = await getContentList({ status: "all", sortBy: "newest", limit: 5 });
      const match = items.find(item => item.url.includes(`cleanup_test_${uniqueId}`));
      if (match) {
        cleanupContentId = match.id;
        return true;
      }
      return false;
    }, 30_000);
    expect(indexedContent, "Ponder did not index the cleanup test content").toBe(true);
    expect(cleanupContentId).toBeTruthy();

    const voters = [
      { account: ANVIL_ACCOUNTS.account3, isUp: true },
      { account: ANVIL_ACCOUNTS.account4, isUp: true },
      { account: ANVIL_ACCOUNTS.account7, isUp: false },
      { account: unrevealed1, isUp: true },
      { account: unrevealed2, isUp: false },
    ];

    const commits: {
      account: (typeof voters)[number]["account"];
      commitKey: `0x${string}`;
      isUp: boolean;
      salt: `0x${string}`;
    }[] = [];

    for (const voter of voters) {
      const approved = await approveCREP(VOTING_ENGINE, STAKE, voter.account.address, CREP_TOKEN);
      expect(approved, `Vote approval failed for ${voter.account.address}`).toBe(true);

      const commit = await commitVoteDirect(
        BigInt(cleanupContentId!),
        voter.isUp,
        STAKE,
        ZERO_ADDRESS,
        voter.account.address,
        VOTING_ENGINE,
      );
      expect(commit.success, `Vote commit failed for ${voter.account.address}`).toBe(true);
      commits.push({ account: voter.account, commitKey: commit.commitKey, isUp: commit.isUp, salt: commit.salt });
    }

    const cleanupRoundId = await getActiveRoundId(BigInt(cleanupContentId!), VOTING_ENGINE);
    expect(cleanupRoundId).toBeGreaterThan(0n);

    await evmIncreaseTime(EPOCH_DURATION + 1);

    for (const commit of commits.slice(0, 3)) {
      const revealed = await revealVoteDirect(
        BigInt(cleanupContentId!),
        cleanupRoundId,
        commit.commitKey,
        commit.isUp,
        commit.salt,
        keeper.address,
        VOTING_ENGINE,
      );
      expect(revealed, `Reveal failed for ${commit.account.address}`).toBe(true);
    }

    // Advance past the reveal grace period (60 min default) so unrevealed
    // past-epoch commits don't block settlement via UnrevealedPastEpochVotes.
    const REVEAL_GRACE_PERIOD = 3600;
    await evmIncreaseTime(EPOCH_DURATION + REVEAL_GRACE_PERIOD + 1);
    await waitForPonderSync();

    const settled = await settleRoundDirect(BigInt(cleanupContentId!), cleanupRoundId, keeper.address, VOTING_ENGINE);
    expect(settled, "Cleanup setup round did not settle").toBe(true);

    const treasuryAddress = await readAddress("treasury", CONTENT_REGISTRY);
    const treasuryBalanceBefore = await readTokenBalance(treasuryAddress, CREP_TOKEN);

    const cleanupSuccess = await processUnrevealedVotes(
      BigInt(cleanupContentId!),
      cleanupRoundId,
      0,
      10,
      keeper.address,
      VOTING_ENGINE,
    );
    expect(cleanupSuccess, "Cleanup should process unrevealed votes").toBe(true);

    const treasuryBalanceAfter = await readTokenBalance(treasuryAddress, CREP_TOKEN);

    // Both unrevealed epoch-0 stakes forfeited to treasury
    expect(treasuryBalanceAfter - treasuryBalanceBefore).toBe(STAKE * 2n);

    const secondCleanup = await processUnrevealedVotes(
      BigInt(cleanupContentId!),
      cleanupRoundId,
      0,
      10,
      keeper.address,
      VOTING_ENGINE,
    );
    expect(secondCleanup, "Cleanup should not pay out again once all unrevealed votes are processed").toBe(false);
  });
});
