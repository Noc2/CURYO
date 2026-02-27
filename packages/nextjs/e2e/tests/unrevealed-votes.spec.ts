import {
  approveCREP,
  commitVoteDirect,
  getActiveRoundId,
  processUnrevealedDirect,
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
 * Unrevealed vote processing — tests processUnrevealedVotes().
 *
 * Scenario: 4 voters commit on fresh content. Only 3 are revealed, meeting
 * the settlement threshold. After settlement, processUnrevealedVotes is called
 * to forfeit the unrevealed voter's stake.
 *
 * Uses direct contract calls (mock mode) to control which votes get revealed.
 *
 * Account allocation (exclusive to this file):
 * - Account #10 — submits fresh content
 * - Accounts #3, #4, #5 — commit & reveal (UP votes, enough for settlement)
 * - Account #6 — commits but is NOT revealed (unrevealed vote)
 */
test.describe("Unrevealed vote processing", () => {
  test.describe.configure({ mode: "serial" });

  const VOTING_ENGINE = CONTRACT_ADDRESSES.RoundVotingEngine;
  const CREP_TOKEN = CONTRACT_ADDRESSES.CuryoReputation;
  const CONTENT_REGISTRY = CONTRACT_ADDRESSES.ContentRegistry;
  const STAKE = BigInt(1e6); // 1 cREP (MIN_STAKE)

  let contentId: string | null = null;
  let roundId: bigint = 0n;

  // Track commit hashes for manual reveals
  const commitData: Array<{
    voter: string;
    isUp: boolean;
    salt: `0x${string}`;
    commitHash: `0x${string}`;
  }> = [];

  test("submit fresh content for unrevealed test", async () => {
    test.setTimeout(60_000);

    const submitter = ANVIL_ACCOUNTS.account10;

    const approved = await approveCREP(CONTENT_REGISTRY, BigInt(10e6), submitter.address, CREP_TOKEN);
    expect(approved, "cREP approval for content submission failed").toBe(true);

    const uniqueId = Date.now();
    const success = await submitContentDirect(
      `https://www.youtube.com/watch?v=unrevealed_test_${uniqueId}`,
      `Unrevealed Test ${uniqueId}`,
      "test",
      1,
      submitter.address,
      CONTENT_REGISTRY,
    );
    expect(success, "Content submission tx failed").toBe(true);

    // Wait for Ponder to index
    const indexed = await waitForPonderIndexed(async () => {
      const { items } = await (
        await import("../helpers/ponder-api")
      ).getContentList({
        status: "all",
        sortBy: "newest",
        limit: 5,
      });
      const match = items.find(item => item.url.includes(`unrevealed_test_${uniqueId}`));
      if (match) {
        contentId = match.id;
        return true;
      }
      return false;
    }, 30_000);

    expect(indexed, "Ponder did not index the newly submitted content").toBe(true);
    expect(contentId).toBeTruthy();
  });

  test("commit 4 votes via direct contract calls", async () => {
    test.setTimeout(120_000);
    test.skip(!contentId, "No content from previous test");

    const voters = [
      { account: ANVIL_ACCOUNTS.account3, isUp: true },
      { account: ANVIL_ACCOUNTS.account4, isUp: true },
      { account: ANVIL_ACCOUNTS.account5, isUp: true },
      { account: ANVIL_ACCOUNTS.account6, isUp: true }, // This one will NOT be revealed
    ];

    for (let i = 0; i < voters.length; i++) {
      const { account, isUp } = voters[i];
      // Unique salt per voter
      const salt = `0x${(i + 1).toString(16).padStart(64, "0")}` as `0x${string}`;

      // Approve cREP spending
      const approved = await approveCREP(VOTING_ENGINE, STAKE, account.address, CREP_TOKEN);
      expect(approved, `cREP approval failed for voter ${i}`).toBe(true);

      // Commit the vote
      const { success, commitHash } = await commitVoteDirect(
        BigInt(contentId!),
        isUp,
        salt,
        STAKE,
        "0x0000000000000000000000000000000000000000",
        account.address,
        VOTING_ENGINE,
      );
      expect(success, `Vote commit failed for voter ${i}`).toBe(true);

      commitData.push({ voter: account.address, isUp, salt, commitHash });
    }

    // Verify round was created
    roundId = await getActiveRoundId(BigInt(contentId!), VOTING_ENGINE);
    expect(roundId).toBeGreaterThan(0n);
  });

  test("reveal 3 of 4 votes, settle, then process unrevealed", async () => {
    test.setTimeout(120_000);
    test.skip(!contentId || roundId === 0n, "No content or round from previous test");

    // Fast-forward past the epoch boundary so reveals are valid
    await fastForwardTime(901);

    // Reveal only the first 3 votes (accounts #3, #4, #5) — skip account #6
    const keeper = ANVIL_ACCOUNTS.account1; // keeper account
    for (let i = 0; i < 3; i++) {
      const cd = commitData[i];
      const revealed = await revealVoteDirect(
        BigInt(contentId!),
        roundId,
        cd.voter,
        cd.commitHash,
        cd.isUp,
        cd.salt,
        keeper.address,
        VOTING_ENGINE,
      );
      expect(revealed, `Reveal failed for voter ${i}`).toBe(true);
    }

    // Fast-forward 1 more epoch to allow settlement (threshold + epochDuration delay)
    await fastForwardTime(901);

    // Settle the round
    const settled = await settleRoundDirect(BigInt(contentId!), roundId, keeper.address, VOTING_ENGINE);
    expect(settled, "Settlement failed").toBe(true);

    // Verify settlement via Ponder
    const settledIndexed = await waitForPonderIndexed(async () => {
      const data = await getContentById(contentId!);
      return data.rounds.some(r => r.state === 1 || r.state === 3);
    }, 30_000);
    expect(settledIndexed, "Ponder did not index settlement").toBe(true);

    // Now process unrevealed votes — the 4th voter's stake should be forfeited
    const processed = await processUnrevealedDirect(
      BigInt(contentId!),
      roundId,
      0, // startIndex
      10, // count (more than enough)
      keeper.address,
      VOTING_ENGINE,
    );
    expect(processed, "processUnrevealedVotes tx failed").toBe(true);
  });

  test("verify settlement data shows 3 revealed and round settled", async () => {
    test.skip(!contentId, "No content from previous test");

    const data = await getContentById(contentId!);
    const round = data.rounds.find(r => String(r.roundId) === String(roundId));

    expect(round, "Round not found in Ponder data").toBeTruthy();
    expect(round!.state).toBe(1); // Settled (unanimous UP → settled, not tied)
    expect(Number(round!.revealedCount)).toBe(3);
    // voteCount should be 4 (all commits), but only 3 revealed
    expect(Number(round!.voteCount)).toBe(4);

    // Rating should have changed since we had a valid settlement
    expect(data.ratings.length).toBeGreaterThanOrEqual(1);
  });
});
