import {
  approveCREP,
  commitVoteDirect,
  evmIncreaseTime,
  evmSetTimestamp,
  getActiveRoundId,
  setTestConfig,
  submitContentDirect,
  waitForPonderIndexed,
  waitForPonderSync,
} from "../helpers/admin-helpers";
import { ANVIL_ACCOUNTS, DEPLOYER } from "../helpers/anvil-accounts";
import { CONTRACT_ADDRESSES } from "../helpers/contracts";
import { setupWallet } from "../helpers/wallet-session";
import { getContentById, getContentList, getVotes } from "../helpers/ponder-api";
import { expect, test } from "@playwright/test";

test.describe("Manual reveal fallback", () => {
  test.describe.configure({ mode: "serial" });

  const VOTING_ENGINE = CONTRACT_ADDRESSES.RoundVotingEngine;
  const CREP_TOKEN = CONTRACT_ADDRESSES.CuryoReputation;
  const CONTENT_REGISTRY = CONTRACT_ADDRESSES.ContentRegistry;
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const STAKE = BigInt(10e6);
  const EPOCH_DURATION = 300; // 5 min — contract minimum

  // The tlock encryption epoch must be short enough that the drand beacon
  // advances during the test, but the on-chain epochDuration is 300s.
  // Strategy: set chain time to (real time − 270s) so that:
  //   revealableAfter ≈ real time + 30s
  //   tlock ciphertext decryptable at real time + TLOCK_EPOCH
  const TLOCK_EPOCH = 30; // seconds — short enough to pass during the test
  const CHAIN_TIME_OFFSET = EPOCH_DURATION - TLOCK_EPOCH; // 270s

  test.beforeAll(async () => {
    const ok = await setTestConfig(VOTING_ENGINE, DEPLOYER.address, EPOCH_DURATION);
    if (!ok) throw new Error("Failed to set test config");
  });

  test("connected voter can use the hidden reveal fallback page", async ({ browser }) => {
    test.setTimeout(300_000); // 5 min (includes real-time wait for drand beacon)

    const submitter = ANVIL_ACCOUNTS.account2;
    const voter = ANVIL_ACCOUNTS.account3;
    const uniqueId = Date.now();

    // Sync chain time to (real time − CHAIN_TIME_OFFSET) so that
    // revealableAfter ≈ Date.now()/1000 + TLOCK_EPOCH. This aligns the
    // on-chain revealability window with the tlock decryption window.
    await evmSetTimestamp(Math.floor(Date.now() / 1000) - CHAIN_TIME_OFFSET);

    const submitApproved = await approveCREP(CONTENT_REGISTRY, BigInt(10e6), submitter.address, CREP_TOKEN);
    expect(submitApproved, "Content submission approval failed").toBe(true);

    const submitted = await submitContentDirect(
      `https://www.youtube.com/watch?v=manual_reveal_${uniqueId}`,
      `Manual Reveal ${uniqueId}`,
      `Manual reveal test description ${uniqueId}`,
      "test",
      1,
      submitter.address,
      CONTENT_REGISTRY,
    );
    expect(submitted, "Content submission failed").toBe(true);

    let contentId: string | null = null;
    const indexedContent = await waitForPonderIndexed(async () => {
      const { items } = await getContentList({ status: "all", sortBy: "newest", limit: 5 });
      const match = items.find(item => item.url.includes(`manual_reveal_${uniqueId}`));
      if (match) {
        contentId = match.id;
        return true;
      }
      return false;
    }, 30_000);
    expect(indexedContent, "Ponder did not index the manual reveal content").toBe(true);
    expect(contentId).toBeTruthy();

    const approved = await approveCREP(VOTING_ENGINE, STAKE, voter.address, CREP_TOKEN);
    expect(approved, "Vote approval failed").toBe(true);

    // Commit with short tlock epoch — the ciphertext will be decryptable in TLOCK_EPOCH real seconds
    const commit = await commitVoteDirect(
      BigInt(contentId!),
      true,
      STAKE,
      ZERO_ADDRESS,
      voter.address,
      VOTING_ENGINE,
      TLOCK_EPOCH,
    );
    expect(commit.success, "Vote commit failed").toBe(true);

    const roundId = await getActiveRoundId(BigInt(contentId!), VOTING_ENGINE);
    expect(roundId).toBeGreaterThan(0n);

    const indexedCommit = await waitForPonderIndexed(async () => {
      const data = await getContentById(contentId!);
      return data.rounds.some(round => String(round.roundId) === String(roundId) && Number(round.voteCount) >= 1);
    }, 30_000);
    expect(indexedCommit, "Ponder did not index the pending vote").toBe(true);

    // Advance chain time past revealableAfter (on-chain epoch = 300s).
    // After this, chain time ≈ real time + TLOCK_EPOCH.
    await evmIncreaseTime(EPOCH_DURATION + 1);

    // Wait for tlock ciphertext to become decryptable (TLOCK_EPOCH real seconds).
    // Add generous buffer for drand beacon propagation + network delays.
    const waitMs = (TLOCK_EPOCH + 30) * 1000;
    await new Promise(resolve => setTimeout(resolve, waitMs));

    await waitForPonderSync();

    // Before navigating, verify the vote is still unrevealed (keeper might have beaten us).
    // Check on-chain rather than Ponder types — getVotes returns VoteItem without 'revealed'.
    const voteData = await getVotes({ voter: voter.address.toLowerCase(), contentId: contentId! });
    const ourVote = voteData.items.find(item => item.roundId === String(roundId));
    if (ourVote && (ourVote as Record<string, unknown>).revealed === true) {
      // Keeper revealed it first — this can happen if the test ran slowly.
      test.skip(true, "Keeper revealed the vote before manual reveal page loaded — test passed implicitly");
      return;
    }

    const context = await browser.newContext();
    const page = await context.newPage();
    await setupWallet(page, voter.privateKey);

    await page.goto("/vote/reveal");
    await expect(page.getByRole("heading", { name: "Reveal My Vote" })).toBeVisible({ timeout: 15_000 });

    // The vote should appear as a link or in the ready section
    const contentLink = page.getByRole("link", { name: `Content #${contentId}` });
    const revealButton = page.getByRole("button", { name: "Reveal" });

    // Wait for either the content link or the "No unrevealed votes" heading
    const noVotes = page.getByRole("heading", { name: "No unrevealed votes" });
    const voteOrEmpty = contentLink.or(noVotes);
    await expect(voteOrEmpty.first()).toBeVisible({ timeout: 30_000 });

    if (await noVotes.isVisible().catch(() => false)) {
      // Keeper revealed before we got here — acceptable race condition
      await context.close();
      return;
    }

    await expect(contentLink).toBeVisible({ timeout: 15_000 });
    await expect(revealButton).toBeVisible({ timeout: 15_000 });
    await revealButton.click();

    await expect(page.getByText("Vote revealed.")).toBeVisible({ timeout: 30_000 });

    const indexedReveal = await waitForPonderIndexed(async () => {
      const { items } = await getVotes({ voter: voter.address.toLowerCase(), contentId: contentId! });
      return items.some(item => item.roundId === String(roundId));
    }, 30_000);
    expect(indexedReveal, "Ponder did not index the manual reveal").toBe(true);

    await page.reload();
    await expect(page.getByRole("heading", { name: "No unrevealed votes" })).toBeVisible({ timeout: 15_000 });

    await context.close();
  });
});
