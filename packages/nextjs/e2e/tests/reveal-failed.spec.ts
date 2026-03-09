import {
  approveCREP,
  claimCancelledRoundRefund,
  commitVoteDirect,
  evmIncreaseTime,
  finalizeRevealFailedRound,
  getActiveRoundId,
  revealVoteDirect,
  setTestConfig,
  submitContentDirect,
  waitForPonderIndexed,
  waitForPonderSync,
} from "../helpers/admin-helpers";
import { ANVIL_ACCOUNTS, DEPLOYER } from "../helpers/anvil-accounts";
import { CONTRACT_ADDRESSES } from "../helpers/contracts";
import { getContentById, getContentList, ponderGet } from "../helpers/ponder-api";
import { expect, test } from "@playwright/test";

test.describe("RevealFailed lifecycle", () => {
  test.describe.configure({ mode: "serial" });

  const VOTING_ENGINE = CONTRACT_ADDRESSES.RoundVotingEngine;
  const CREP_TOKEN = CONTRACT_ADDRESSES.CuryoReputation;
  const CONTENT_REGISTRY = CONTRACT_ADDRESSES.ContentRegistry;
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const STAKE = BigInt(10e6);
  const EPOCH_DURATION = 300;
  const MAX_DURATION = 86400; // 1 day — minimum allowed by contract
  const REVEAL_GRACE_PERIOD = 3600;

  test.beforeAll(async () => {
    const ok = await setTestConfig(VOTING_ENGINE, DEPLOYER.address, EPOCH_DURATION);
    if (!ok) throw new Error("Failed to set test config");
  });

  test("reveal-failed rounds refund only revealed voters", async () => {
    test.setTimeout(180_000);

    const submitter = ANVIL_ACCOUNTS.account2;
    const keeper = ANVIL_ACCOUNTS.account1;
    const uniqueId = Date.now();

    const submitApproved = await approveCREP(CONTENT_REGISTRY, BigInt(10e6), submitter.address, CREP_TOKEN);
    expect(submitApproved, "Content submission approval failed").toBe(true);

    const submitted = await submitContentDirect(
      `https://www.youtube.com/watch?v=reveal_failed_${uniqueId}`,
      `Reveal Failed ${uniqueId}`,
      "test",
      1,
      submitter.address,
      CONTENT_REGISTRY,
    );
    expect(submitted, "Content submission failed").toBe(true);

    let contentId: string | null = null;
    const indexedContent = await waitForPonderIndexed(async () => {
      const { items } = await getContentList({ status: "all", sortBy: "newest", limit: 5 });
      const match = items.find(item => item.url.includes(`reveal_failed_${uniqueId}`));
      if (match) {
        contentId = match.id;
        return true;
      }
      return false;
    }, 30_000);
    expect(indexedContent, "Ponder did not index the reveal-failed content").toBe(true);
    expect(contentId).toBeTruthy();

    const voters = [
      { account: ANVIL_ACCOUNTS.account3, isUp: true },
      { account: ANVIL_ACCOUNTS.account4, isUp: true },
      { account: ANVIL_ACCOUNTS.account7, isUp: false },
    ];

    const commits: { commitKey: `0x${string}`; isUp: boolean; salt: `0x${string}` }[] = [];

    for (const voter of voters) {
      const approved = await approveCREP(VOTING_ENGINE, STAKE, voter.account.address, CREP_TOKEN);
      expect(approved, `Vote approval failed for ${voter.account.address}`).toBe(true);

      const commit = await commitVoteDirect(
        BigInt(contentId!),
        voter.isUp,
        STAKE,
        ZERO_ADDRESS,
        voter.account.address,
        VOTING_ENGINE,
      );
      expect(commit.success, `Vote commit failed for ${voter.account.address}`).toBe(true);
      commits.push({ commitKey: commit.commitKey, isUp: commit.isUp, salt: commit.salt });
    }

    const roundId = await getActiveRoundId(BigInt(contentId!), VOTING_ENGINE);
    expect(roundId).toBeGreaterThan(0n);

    await evmIncreaseTime(EPOCH_DURATION + 1);

    for (let i = 0; i < 2; i++) {
      const revealed = await revealVoteDirect(
        BigInt(contentId!),
        roundId,
        commits[i].commitKey,
        commits[i].isUp,
        commits[i].salt,
        keeper.address,
        VOTING_ENGINE,
      );
      expect(revealed, `Reveal failed for voter ${i}`).toBe(true);
    }

    // Advance past maxDuration + revealGracePeriod from round start.
    // We already advanced EPOCH_DURATION + 1, so advance the remainder.
    await evmIncreaseTime(MAX_DURATION + REVEAL_GRACE_PERIOD - EPOCH_DURATION + 1);
    await waitForPonderSync();

    const finalized = await finalizeRevealFailedRound(BigInt(contentId!), roundId, keeper.address, VOTING_ENGINE);
    expect(finalized, "RevealFailed finalization failed").toBe(true);

    const indexedRound = await waitForPonderIndexed(async () => {
      const data = await getContentById(contentId!);
      return data.rounds.some(round => String(round.roundId) === String(roundId) && round.state === 4);
    }, 30_000);
    expect(indexedRound, "Ponder did not index the RevealFailed round").toBe(true);

    const revealedRefunded = await claimCancelledRoundRefund(
      BigInt(contentId!),
      roundId,
      ANVIL_ACCOUNTS.account3.address,
      VOTING_ENGINE,
    );
    expect(revealedRefunded, "Revealed voter should recover stake from a RevealFailed round").toBe(true);

    const unrevealedRefunded = await claimCancelledRoundRefund(
      BigInt(contentId!),
      roundId,
      ANVIL_ACCOUNTS.account7.address,
      VOTING_ENGINE,
    );
    expect(unrevealedRefunded, "Unrevealed voter should not recover stake from a RevealFailed round").toBe(false);

    const indexedRefund = await waitForPonderIndexed(async () => {
      const rewards = await ponderGet(`/rewards?voter=${ANVIL_ACCOUNTS.account3.address.toLowerCase()}`);
      return rewards.items?.some(
        (item: { contentId: string; roundId: string; source: string }) =>
          item.contentId === contentId && item.roundId === String(roundId) && item.source === "refund",
      );
    }, 30_000);
    expect(indexedRefund, "Ponder did not index the RevealFailed refund").toBe(true);

    const rewards = await ponderGet(`/rewards?voter=${ANVIL_ACCOUNTS.account3.address.toLowerCase()}`);
    const refund = rewards.items?.find(
      (item: { contentId: string; roundId: string; source: string }) =>
        item.contentId === contentId && item.roundId === String(roundId) && item.source === "refund",
    );

    expect(refund).toBeTruthy();
    expect(refund.stakeReturned).toBe(STAKE.toString());
    expect(refund.crepReward).toBe("0");
  });
});
