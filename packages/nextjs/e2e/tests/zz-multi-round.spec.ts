import {
  approveHREP,
  commitVoteDirect,
  evmIncreaseTime,
  getActiveRoundId,
  revealVoteDirect,
  setTestConfig,
  settleRoundDirect,
  submitContentDirect,
  waitForPonderIndexed,
  waitForPonderSync,
} from "../helpers/admin-helpers";
import { ANVIL_ACCOUNTS, DEPLOYER } from "../helpers/anvil-accounts";
import { CONTRACT_ADDRESSES } from "../helpers/contracts";
import { fastForwardTime } from "../helpers/keeper";
import { getContentById } from "../helpers/ponder-api";
import { expect, test } from "@playwright/test";

/**
 * Multi-round succession — same content settles two consecutive rounds.
 *
 * Verifies that after round 1 settles, a new round 2 can be opened on the
 * same content and settled independently. Rating changes accumulate across
 * rounds.
 *
 * Uses direct contract calls (tlock commit-reveal) to avoid UI cooldown
 * and timing issues. Fast-forwards 24h between rounds to clear the
 * per-content vote cooldown.
 *
 * Account allocation (exclusive to this file):
 * - Account #10 — submits fresh content
 * - Accounts #3, #4, #5 — vote in both rounds
 */
test.describe("Multi-round succession", () => {
  test.describe.configure({ mode: "serial" });

  const VOTING_ENGINE = CONTRACT_ADDRESSES.RoundVotingEngine;
  const HREP_TOKEN = CONTRACT_ADDRESSES.HumanReputation;
  const CONTENT_REGISTRY = CONTRACT_ADDRESSES.ContentRegistry;
  const STAKE = BigInt(10e6); // 10 HREP (must be >= MIN_STAKE_FOR_RATING for rating delta > 0)
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const EPOCH_DURATION = 300; // 5 min — contract minimum is 5 minutes

  test.beforeAll(async () => {
    const ok = await setTestConfig(VOTING_ENGINE, DEPLOYER.address, EPOCH_DURATION);
    if (!ok) throw new Error("Failed to set test config");
  });

  let contentId: string | null = null;
  let round1Id: bigint = 0n;
  let round2Id: bigint = 0n;
  let ratingAfterRound1: string | null = null;

  test("submit fresh content for multi-round test", async () => {
    test.setTimeout(60_000);

    const submitter = ANVIL_ACCOUNTS.account10;

    const approved = await approveHREP(CONTENT_REGISTRY, BigInt(10e6), submitter.address, HREP_TOKEN);
    expect(approved).toBe(true);

    const uniqueId = Date.now();
    const success = await submitContentDirect(
      `https://www.youtube.com/watch?v=multi_round_test_${uniqueId}`,
      `Multi-Round Test ${uniqueId}`,
      `Multi-round test description ${uniqueId}`,
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
      const match = items.find(item => item.url.includes(`multi_round_test_${uniqueId}`));
      if (match) {
        contentId = match.id;
        return true;
      }
      return false;
    }, 30_000);

    expect(indexed).toBe(true);
    expect(contentId).toBeTruthy();
  });

  test("round 1: commit, reveal, settle (3 UP votes)", async () => {
    test.setTimeout(120_000);
    test.skip(!contentId, "No content from previous test");

    const voters = [ANVIL_ACCOUNTS.account3, ANVIL_ACCOUNTS.account4, ANVIL_ACCOUNTS.account5];

    // Step 1: Commit 3 UP votes via tlock commit-reveal
    const commits: { commitKey: `0x${string}`; isUp: boolean; salt: `0x${string}` }[] = [];

    for (let i = 0; i < voters.length; i++) {
      await approveHREP(VOTING_ENGINE, STAKE, voters[i].address, HREP_TOKEN);
      const result = await commitVoteDirect(
        BigInt(contentId!),
        true, // UP
        STAKE,
        ZERO_ADDRESS,
        voters[i].address,
        VOTING_ENGINE,
      );
      expect(result.success, `Round 1 commit failed for voter ${i}`).toBe(true);
      commits.push({ commitKey: result.commitKey, isUp: result.isUp, salt: result.salt });
    }

    round1Id = await getActiveRoundId(BigInt(contentId!), VOTING_ENGINE);
    expect(round1Id).toBeGreaterThan(0n);

    // Step 2: Fast-forward past epoch so votes become revealable
    await evmIncreaseTime(EPOCH_DURATION + 1);

    // Step 3: Reveal all votes
    const keeper = ANVIL_ACCOUNTS.account1;
    for (let i = 0; i < commits.length; i++) {
      const revealed = await revealVoteDirect(
        BigInt(contentId!),
        round1Id,
        commits[i].commitKey,
        commits[i].isUp,
        commits[i].salt,
        keeper.address,
        VOTING_ENGINE,
      );
      expect(revealed, `Round 1 reveal failed for voter ${i}`).toBe(true);
    }

    // Step 4: Fast-forward past epoch (no settlement delay, but chain time must advance)
    await evmIncreaseTime(EPOCH_DURATION + 1);
    await waitForPonderSync();

    // Step 5: Settle round 1
    const settled = await settleRoundDirect(BigInt(contentId!), round1Id, keeper.address, VOTING_ENGINE);
    expect(settled, "Round 1 settlement failed").toBe(true);

    // Wait for Ponder to index settlement
    const settledIndexed = await waitForPonderIndexed(async () => {
      const data = await getContentById(contentId!);
      return data.rounds.some(r => String(r.roundId) === String(round1Id) && (r.state === 1 || r.state === 3));
    }, 30_000);
    expect(settledIndexed, "Round 1 not indexed by Ponder").toBe(true);

    // Record rating after round 1
    const data = await getContentById(contentId!);
    ratingAfterRound1 = data.content.rating;
  });

  test("round 2: new votes on same content after cooldown", async () => {
    test.setTimeout(120_000);
    test.skip(!contentId || round1Id === 0n, "No content or round 1 from previous test");

    // Fast-forward 24 hours to clear the per-content vote cooldown
    await fastForwardTime(86401);

    const voters = [ANVIL_ACCOUNTS.account3, ANVIL_ACCOUNTS.account4, ANVIL_ACCOUNTS.account5];

    // Step 1: Commit 3 DOWN votes for round 2 (opposite direction to show rating moves both ways)
    const commits: { commitKey: `0x${string}`; isUp: boolean; salt: `0x${string}` }[] = [];

    for (let i = 0; i < voters.length; i++) {
      await approveHREP(VOTING_ENGINE, STAKE, voters[i].address, HREP_TOKEN);
      const result = await commitVoteDirect(
        BigInt(contentId!),
        false, // DOWN
        STAKE,
        ZERO_ADDRESS,
        voters[i].address,
        VOTING_ENGINE,
      );
      expect(result.success, `Round 2 commit failed for voter ${i}`).toBe(true);
      commits.push({ commitKey: result.commitKey, isUp: result.isUp, salt: result.salt });
    }

    // A new round should have been created
    round2Id = await getActiveRoundId(BigInt(contentId!), VOTING_ENGINE);
    expect(round2Id).toBeGreaterThan(round1Id);

    // Step 2: Fast-forward past epoch so votes become revealable
    await evmIncreaseTime(EPOCH_DURATION + 1);

    // Step 3: Reveal all votes
    const keeper = ANVIL_ACCOUNTS.account1;
    for (let i = 0; i < commits.length; i++) {
      const revealed = await revealVoteDirect(
        BigInt(contentId!),
        round2Id,
        commits[i].commitKey,
        commits[i].isUp,
        commits[i].salt,
        keeper.address,
        VOTING_ENGINE,
      );
      expect(revealed, `Round 2 reveal failed for voter ${i}`).toBe(true);
    }

    // Step 4: Fast-forward past epoch (no settlement delay, but chain time must advance)
    await evmIncreaseTime(EPOCH_DURATION + 1);
    await waitForPonderSync();

    // Step 5: Settle round 2
    const settled = await settleRoundDirect(BigInt(contentId!), round2Id, keeper.address, VOTING_ENGINE);
    expect(settled, "Round 2 settlement failed").toBe(true);

    // Wait for Ponder to index
    const settledIndexed = await waitForPonderIndexed(async () => {
      const data = await getContentById(contentId!);
      return data.rounds.some(r => String(r.roundId) === String(round2Id) && (r.state === 1 || r.state === 3));
    }, 30_000);
    expect(settledIndexed, "Round 2 not indexed by Ponder").toBe(true);
  });

  test("verify both rounds are settled with cumulative rating changes", async () => {
    test.skip(!contentId || round2Id === 0n, "No content or round 2 from previous test");

    const data = await getContentById(contentId!);

    // Should have at least 2 settled/tied rounds
    const terminalRounds = data.rounds.filter(r => r.state === 1 || r.state === 3);
    expect(terminalRounds.length).toBeGreaterThanOrEqual(2);

    // Verify round IDs are distinct
    const roundIds = new Set(terminalRounds.map(r => r.roundId));
    expect(roundIds.size).toBeGreaterThanOrEqual(2);

    // Should have at least 2 rating changes (one per round)
    expect(data.ratings.length).toBeGreaterThanOrEqual(2);

    // Round 1 was all UP → rating should have increased from default (50)
    // Round 2 was all DOWN → rating should have decreased
    // The exact values depend on RewardMath, but rating after round 2
    // should differ from rating after round 1
    const currentRating = data.content.rating;
    if (ratingAfterRound1 !== null) {
      expect(currentRating).not.toBe(ratingAfterRound1);
    }
  });
});
