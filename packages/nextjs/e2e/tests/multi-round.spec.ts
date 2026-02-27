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
 * Uses direct contract calls (mock mode) to avoid UI cooldown and timing issues.
 * Fast-forwards 24h between rounds to clear the per-content vote cooldown.
 *
 * Account allocation (exclusive to this file):
 * - Account #10 — submits fresh content
 * - Accounts #3, #4, #5 — vote in both rounds
 */
test.describe("Multi-round succession", () => {
  test.describe.configure({ mode: "serial" });

  const VOTING_ENGINE = CONTRACT_ADDRESSES.RoundVotingEngine;
  const CREP_TOKEN = CONTRACT_ADDRESSES.CuryoReputation;
  const CONTENT_REGISTRY = CONTRACT_ADDRESSES.ContentRegistry;
  const STAKE = BigInt(10e6); // 10 cREP (must be >= MIN_STAKE_FOR_RATING for rating delta > 0)

  let contentId: string | null = null;
  let round1Id: bigint = 0n;
  let round2Id: bigint = 0n;
  let ratingAfterRound1: string | null = null;

  test("submit fresh content for multi-round test", async () => {
    test.setTimeout(60_000);

    const submitter = ANVIL_ACCOUNTS.account10;

    const approved = await approveCREP(CONTENT_REGISTRY, BigInt(10e6), submitter.address, CREP_TOKEN);
    expect(approved).toBe(true);

    const uniqueId = Date.now();
    const success = await submitContentDirect(
      `https://www.youtube.com/watch?v=multi_round_test_${uniqueId}`,
      `Multi-Round Test ${uniqueId}`,
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
    const commitData: Array<{ voter: string; commitHash: `0x${string}`; salt: `0x${string}` }> = [];

    // Commit 3 UP votes
    for (let i = 0; i < voters.length; i++) {
      const salt = `0x${(i + 1).toString(16).padStart(64, "0")}` as `0x${string}`;
      await approveCREP(VOTING_ENGINE, STAKE, voters[i].address, CREP_TOKEN);
      const { success, commitHash } = await commitVoteDirect(
        BigInt(contentId!),
        true, // UP
        salt,
        STAKE,
        "0x0000000000000000000000000000000000000000",
        voters[i].address,
        VOTING_ENGINE,
      );
      expect(success, `Round 1 commit failed for voter ${i}`).toBe(true);
      commitData.push({ voter: voters[i].address, commitHash, salt });
    }

    round1Id = await getActiveRoundId(BigInt(contentId!), VOTING_ENGINE);
    expect(round1Id).toBeGreaterThan(0n);

    // Fast-forward past epoch boundary
    await fastForwardTime(901);

    // Reveal all 3 votes
    const keeper = ANVIL_ACCOUNTS.account1;
    for (const cd of commitData) {
      const revealed = await revealVoteDirect(
        BigInt(contentId!),
        round1Id,
        cd.voter,
        cd.commitHash,
        true,
        cd.salt,
        keeper.address,
        VOTING_ENGINE,
      );
      expect(revealed, "Round 1 reveal failed").toBe(true);
    }

    // Fast-forward for settlement delay
    await fastForwardTime(901);

    // Settle round 1
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
    const commitData: Array<{ voter: string; commitHash: `0x${string}`; salt: `0x${string}` }> = [];

    // Commit 3 DOWN votes for round 2 (opposite direction to show rating moves both ways)
    for (let i = 0; i < voters.length; i++) {
      // Different salts from round 1
      const salt = `0x${(i + 100).toString(16).padStart(64, "0")}` as `0x${string}`;
      await approveCREP(VOTING_ENGINE, STAKE, voters[i].address, CREP_TOKEN);
      const { success, commitHash } = await commitVoteDirect(
        BigInt(contentId!),
        false, // DOWN
        salt,
        STAKE,
        "0x0000000000000000000000000000000000000000",
        voters[i].address,
        VOTING_ENGINE,
      );
      expect(success, `Round 2 commit failed for voter ${i}`).toBe(true);
      commitData.push({ voter: voters[i].address, commitHash, salt });
    }

    // A new round should have been created
    round2Id = await getActiveRoundId(BigInt(contentId!), VOTING_ENGINE);
    expect(round2Id).toBeGreaterThan(round1Id);

    // Fast-forward past epoch
    await fastForwardTime(901);

    // Reveal all 3 votes
    const keeper = ANVIL_ACCOUNTS.account1;
    for (const cd of commitData) {
      const revealed = await revealVoteDirect(
        BigInt(contentId!),
        round2Id,
        cd.voter,
        cd.commitHash,
        false,
        cd.salt,
        keeper.address,
        VOTING_ENGINE,
      );
      expect(revealed, "Round 2 reveal failed").toBe(true);
    }

    // Fast-forward for settlement delay
    await fastForwardTime(901);

    // Settle round 2
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
