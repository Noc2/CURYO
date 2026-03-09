import {
  approveCREP,
  commitVoteDirect,
  evmIncreaseTime,
  getActiveRoundId,
  setTestConfig,
  submitContentDirect,
  waitForPonderIndexed,
  waitForPonderSync,
} from "../helpers/admin-helpers";
import { ANVIL_ACCOUNTS, DEPLOYER } from "../helpers/anvil-accounts";
import { CONTRACT_ADDRESSES } from "../helpers/contracts";
import { setupWallet } from "../helpers/local-storage";
import { getContentById, getContentList, getVotes } from "../helpers/ponder-api";
import { expect, test } from "@playwright/test";

test.describe("Manual reveal fallback", () => {
  test.describe.configure({ mode: "serial" });

  const VOTING_ENGINE = CONTRACT_ADDRESSES.RoundVotingEngine;
  const CREP_TOKEN = CONTRACT_ADDRESSES.CuryoReputation;
  const CONTENT_REGISTRY = CONTRACT_ADDRESSES.ContentRegistry;
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const STAKE = BigInt(10e6);
  const EPOCH_DURATION = 300;

  test.beforeAll(async () => {
    const ok = await setTestConfig(VOTING_ENGINE, DEPLOYER.address, EPOCH_DURATION);
    if (!ok) throw new Error("Failed to set test config");
  });

  test("connected voter can use the hidden reveal fallback page", async ({ browser }) => {
    test.setTimeout(180_000);

    const submitter = ANVIL_ACCOUNTS.account2;
    const voter = ANVIL_ACCOUNTS.account3;
    const uniqueId = Date.now();

    const submitApproved = await approveCREP(CONTENT_REGISTRY, BigInt(10e6), submitter.address, CREP_TOKEN);
    expect(submitApproved, "Content submission approval failed").toBe(true);

    const submitted = await submitContentDirect(
      `https://www.youtube.com/watch?v=manual_reveal_${uniqueId}`,
      `Manual Reveal ${uniqueId}`,
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

    const commit = await commitVoteDirect(BigInt(contentId!), true, STAKE, ZERO_ADDRESS, voter.address, VOTING_ENGINE);
    expect(commit.success, "Vote commit failed").toBe(true);

    const roundId = await getActiveRoundId(BigInt(contentId!), VOTING_ENGINE);
    expect(roundId).toBeGreaterThan(0n);

    const indexedCommit = await waitForPonderIndexed(async () => {
      const data = await getContentById(contentId!);
      return data.rounds.some(round => String(round.roundId) === String(roundId) && Number(round.voteCount) >= 1);
    }, 30_000);
    expect(indexedCommit, "Ponder did not index the pending vote").toBe(true);

    await evmIncreaseTime(EPOCH_DURATION + 1);
    await waitForPonderSync();

    const context = await browser.newContext();
    const page = await context.newPage();
    await setupWallet(page, voter.privateKey);

    await page.goto("/vote/reveal");
    await expect(page.getByRole("heading", { name: "Reveal My Vote" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("link", { name: `Content #${contentId}` })).toBeVisible({ timeout: 15_000 });

    const revealButton = page.getByRole("button", { name: "Reveal" });
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
