import {
  approveCREP,
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
import { newE2EContext } from "../helpers/browser-context";
import { CONTRACT_ADDRESSES } from "../helpers/contracts";
import { gotoWithRetry } from "../helpers/wait-helpers";
import { setupWallet } from "../helpers/wallet-session";
import { getContentById, getContentList } from "../helpers/ponder-api";
import { expect, test } from "@playwright/test";

/**
 * Settlement lifecycle — full tlock commit-reveal cycle.
 *
 * Uses direct contract calls for the entire flow:
 *   commitVote → (epoch ends) → revealVoteByCommitKey → settleRound
 *
 * Account allocation (exclusive to this file):
 * - Account #10 — submits fresh content
 * - Accounts #3, #4, #5 — vote via direct contract calls
 * - Account #1 (keeper) — reveals votes and settles
 */
test.describe("Settlement lifecycle", () => {
  test.describe.configure({ mode: "serial" });

  const VOTING_ENGINE = CONTRACT_ADDRESSES.RoundVotingEngine;
  const CREP_TOKEN = CONTRACT_ADDRESSES.CuryoReputation;
  const CONTENT_REGISTRY = CONTRACT_ADDRESSES.ContentRegistry;
  const STAKE = BigInt(10e6); // 10 cREP (above MIN_STAKE_FOR_RATING threshold)
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const EPOCH_DURATION = 300; // 5 min — contract minimum is 5 minutes

  test.beforeAll(async () => {
    const ok = await setTestConfig(VOTING_ENGINE, DEPLOYER.address, EPOCH_DURATION);
    if (!ok) throw new Error("Failed to set test config");
  });

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
      `Settlement test description ${uniqueId}`,
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

  test("full cycle: commit → reveal → settle", async () => {
    test.setTimeout(120_000);
    test.skip(!newContentId, "No content from previous test");

    // Step 1: Commit votes via direct contract calls (tlock commit-reveal)
    const voters = [
      { account: ANVIL_ACCOUNTS.account3, isUp: true },
      { account: ANVIL_ACCOUNTS.account4, isUp: true },
      { account: ANVIL_ACCOUNTS.account5, isUp: false },
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

    // Step 2: Get the active round ID
    const roundId = await getActiveRoundId(BigInt(newContentId!), VOTING_ENGINE);
    expect(roundId).toBeGreaterThan(0n);

    // Step 3: Fast-forward past epoch duration so votes become revealable
    await evmIncreaseTime(EPOCH_DURATION + 1);

    // Step 4: Reveal all votes (keeper/anyone can do this)
    const revealer = ANVIL_ACCOUNTS.account1;
    for (let i = 0; i < commits.length; i++) {
      const revealed = await revealVoteDirect(
        BigInt(newContentId!),
        roundId,
        commits[i].commitKey,
        commits[i].isUp,
        commits[i].salt,
        revealer.address,
        VOTING_ENGINE,
      );
      expect(revealed, `Reveal failed for voter ${i}`).toBe(true);
    }

    // Step 5: Fast-forward past epoch (settlement has no delay, but chain time must advance)
    await evmIncreaseTime(EPOCH_DURATION + 1);
    await waitForPonderSync();

    // Step 6: Settle the round
    const settled = await settleRoundDirect(BigInt(newContentId!), roundId, revealer.address, VOTING_ENGINE);
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
  });

  test("governance profile shows vote history after voting", async ({ browser }) => {
    test.skip(!newContentId, "No content from previous test");

    const context = await newE2EContext(browser);
    const page = await context.newPage();
    await setupWallet(page, ANVIL_ACCOUNTS.account3.privateKey);

    await gotoWithRetry(page, "/governance#profile", { ensureWalletConnected: true });

    const main = page.locator("main");
    await expect(main.getByText("Voting performance")).toBeVisible({ timeout: 15_000 });
    await expect(main.getByText("Recent votes")).toBeVisible({ timeout: 10_000 });
    await expect(main.getByRole("link", { name: `Content #${newContentId}` })).toBeVisible({ timeout: 15_000 });

    await context.close();
  });
});
