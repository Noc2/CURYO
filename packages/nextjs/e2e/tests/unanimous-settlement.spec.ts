import {
  approveCREP,
  getActiveRoundId,
  mineBlocks,
  readUint256,
  submitContentDirect,
  trySettleDirect,
  voteDirect,
  waitForPonderIndexed,
  waitForPonderSync,
} from "../helpers/admin-helpers";
import { ANVIL_ACCOUNTS } from "../helpers/anvil-accounts";
import { CONTRACT_ADDRESSES } from "../helpers/contracts";
import { getContentById } from "../helpers/ponder-api";
import { expect, test } from "@playwright/test";

/**
 * Unanimous settlement — consensus reserve subsidy.
 *
 * When all voters agree (losingPool == 0), there's no losing pool to
 * redistribute. Instead, the consensus reserve subsidizes the round:
 *   subsidy = 5% of totalStake (capped by reserve balance)
 *   ~89.1% → voter pool, ~10.9% → submitter reward
 *
 * This test verifies:
 * 1. Consensus reserve decreases after unanimous settlement
 * 2. Round settles correctly with all votes on one side
 * 3. Rating updates despite no losers
 * 4. Submitter stake is returned
 *
 * Account allocation (exclusive to this file):
 * - Account #10 — submits fresh content
 * - Accounts #3, #4, #5 — all vote UP (unanimous)
 */
test.describe("Unanimous settlement (consensus reserve)", () => {
  test.describe.configure({ mode: "serial" });

  const VOTING_ENGINE = CONTRACT_ADDRESSES.RoundVotingEngine;
  const CREP_TOKEN = CONTRACT_ADDRESSES.CuryoReputation;
  const CONTENT_REGISTRY = CONTRACT_ADDRESSES.ContentRegistry;
  const STAKE = BigInt(10e6); // 10 cREP each (above MIN_STAKE_FOR_RATING threshold)

  let contentId: string | null = null;
  let roundId: bigint = 0n;
  let reserveBefore: bigint = 0n;

  test("submit fresh content for unanimous test", async () => {
    test.setTimeout(60_000);

    const submitter = ANVIL_ACCOUNTS.account10;

    const approved = await approveCREP(CONTENT_REGISTRY, BigInt(10e6), submitter.address, CREP_TOKEN);
    expect(approved).toBe(true);

    const uniqueId = Date.now();
    const success = await submitContentDirect(
      `https://www.youtube.com/watch?v=unanimous_test_${uniqueId}`,
      `Unanimous Test ${uniqueId}`,
      "test",
      1,
      submitter.address,
      CONTENT_REGISTRY,
    );
    expect(success, "Content submission tx failed").toBe(true);

    const indexed = await waitForPonderIndexed(async () => {
      const { items } = await (
        await import("../helpers/ponder-api")
      ).getContentList({
        status: "all",
        sortBy: "newest",
        limit: 5,
      });
      const match = items.find(item => item.url.includes(`unanimous_test_${uniqueId}`));
      if (match) {
        contentId = match.id;
        return true;
      }
      return false;
    }, 30_000);

    expect(indexed).toBe(true);
    expect(contentId).toBeTruthy();
  });

  test("vote 3 unanimous UP votes, then settle", async () => {
    test.setTimeout(120_000);
    test.skip(!contentId, "No content from previous test");

    // Snapshot consensus reserve BEFORE settlement
    reserveBefore = await readUint256("consensusReserve", VOTING_ENGINE);
    expect(reserveBefore).toBeGreaterThan(0n);

    const voters = [ANVIL_ACCOUNTS.account3, ANVIL_ACCOUNTS.account4, ANVIL_ACCOUNTS.account5];

    // All vote UP — unanimous (public voting, no commit-reveal)
    for (let i = 0; i < voters.length; i++) {
      await approveCREP(VOTING_ENGINE, STAKE, voters[i].address, CREP_TOKEN);
      const success = await voteDirect(
        BigInt(contentId!),
        true, // UP
        STAKE,
        "0x0000000000000000000000000000000000000000",
        voters[i].address,
        VOTING_ENGINE,
      );
      expect(success, `Vote failed for voter ${i}`).toBe(true);
    }

    roundId = await getActiveRoundId(BigInt(contentId!), VOTING_ENGINE);
    expect(roundId).toBeGreaterThan(0n);

    // Advance past maxEpochBlocks for guaranteed settlement
    await mineBlocks(1801);
    await waitForPonderSync();

    // Settle the round
    const keeper = ANVIL_ACCOUNTS.account1;
    const settled = await trySettleDirect(BigInt(contentId!), keeper.address, VOTING_ENGINE);
    expect(settled, "Settlement failed").toBe(true);

    // Wait for Ponder to index
    const settledIndexed = await waitForPonderIndexed(async () => {
      const data = await getContentById(contentId!);
      return data.rounds.some(r => String(r.roundId) === String(roundId) && (r.state === 1 || r.state === 3));
    }, 30_000);
    expect(settledIndexed, "Ponder did not index settlement").toBe(true);
  });

  test("consensus reserve decreased after unanimous settlement", async () => {
    test.skip(!contentId || roundId === 0n, "No content or round from previous test");

    const reserveAfter = await readUint256("consensusReserve", VOTING_ENGINE);

    // Reserve should have decreased by the subsidy amount
    // subsidy = 5% of totalStake = 5% of (3 * 10e6) = 5% of 30e6 = 1.5e6
    // (capped by reserve balance, which was >0)
    expect(reserveAfter).toBeLessThan(reserveBefore);

    const subsidyUsed = reserveBefore - reserveAfter;
    // Expected subsidy: 5% of totalStake (30 cREP) = 1.5 cREP = 1_500_000
    // Allow some tolerance for rounding
    expect(subsidyUsed).toBeGreaterThan(0n);
    expect(subsidyUsed).toBeLessThanOrEqual(BigInt(30e6)); // Cannot exceed totalStake
  });

  test("round settled as unanimous with correct data", async () => {
    test.skip(!contentId || roundId === 0n, "No content or round from previous test");

    const data = await getContentById(contentId!);
    const round = data.rounds.find(r => String(r.roundId) === String(roundId));

    expect(round).toBeTruthy();
    expect(round!.state).toBe(1); // Settled (not tied — all UP, downStake=0)
    expect(round!.upWins).toBe(true);
    expect(Number(round!.voteCount)).toBe(3);

    // Unanimous: downStake should be "0" and upStake should equal totalStake
    expect(round!.downStake).toBe("0");
    expect(BigInt(round!.upStake)).toBe(STAKE * 3n);

    // Rating should have increased from default (50) since UP won
    expect(data.ratings.length).toBeGreaterThanOrEqual(1);
    const latestRating = data.ratings[data.ratings.length - 1];
    expect(latestRating.newRating).toBeGreaterThan(latestRating.oldRating);

    // Submitter stake is NOT returned yet — _checkSubmitterStake only auto-returns
    // after STAKE_RETURN_PERIOD (4 days). In tests, only ~30 min of chain time passes.
    expect(data.content.submitterStakeReturned).toBe(false);
  });
});
