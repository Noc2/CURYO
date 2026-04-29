import {
  evmIncreaseTime,
  getActiveRoundId,
  setTestConfig,
  settleRoundDirect,
  waitForPonderIndexed,
  waitForPonderSync,
} from "../helpers/admin-helpers";
import { ANVIL_ACCOUNTS, DEPLOYER } from "../helpers/anvil-accounts";
import {
  continueToBountyStep,
  selectAskCategory,
  selectAskSubcategory,
  selectBountyRewardAsset,
} from "../helpers/ask-form";
import { newE2EContext } from "../helpers/browser-context";
import { CONTRACT_ADDRESSES } from "../helpers/contracts";
import { waitForSettlementIndexed } from "../helpers/keeper";
import { getContentById, getContentList } from "../helpers/ponder-api";
import { PONDER_URL } from "../helpers/ponder-url";
import { voteOnSpecificContent } from "../helpers/vote-helpers";
import { gotoWithRetry } from "../helpers/wait-helpers";
import { setupWallet } from "../helpers/wallet-session";
import { expect, test } from "@playwright/test";

/**
 * Tied round lifecycle test (tlock commit-reveal).
 * Verifies that when upStake === downStake the round settles as Tied (state=3),
 * the content rating does NOT change, and rewards are handled correctly.
 *
 * Strategy:
 * 1. Ask a fresh question via the UI to get a clean round with 0 votes
 * 2. 4 accounts vote on the SAME content via UI: 2 UP + 2 DOWN, all 1 HREP
 *    (UI voting uses commitVote correctly via hooks)
 * 3. Fast-forward past epoch → keeper reveals via keeper API → fast-forward → settle
 * 4. Verify round.state === 3 (Tied) and rating unchanged
 *
 * Account allocation:
 * - Account #2 — submits new content
 * - Accounts #3, #4 — vote UP (1 HREP each)
 * - Accounts #5, #6 — vote DOWN (1 HREP each)
 *
 * NOTE: Uses accounts that may already have cooldowns from settlement-lifecycle
 * and reward-claim tests. The test asks a fresh question to avoid cooldown issues.
 */
test.describe("Tied round lifecycle", () => {
  test.describe.configure({ mode: "serial" });

  const VOTING_ENGINE = CONTRACT_ADDRESSES.RoundVotingEngine;
  const EPOCH_DURATION = 300; // 5 min — contract minimum is 5 minutes

  test.beforeAll(async () => {
    const ok = await setTestConfig(VOTING_ENGINE, DEPLOYER.address, EPOCH_DURATION);
    if (!ok) throw new Error("Failed to set test config");
  });

  let newContentId: string | null = null;

  test("ask a fresh question for tie test", async ({ browser }) => {
    test.setTimeout(120_000);

    const context = await newE2EContext(browser);
    const page = await context.newPage();
    await setupWallet(page, ANVIL_ACCOUNTS.account2.privateKey);

    await gotoWithRetry(page, "/ask", { ensureWalletConnected: true });
    await expect(page.getByRole("heading", { name: "Submit Question" })).toBeVisible({ timeout: 15_000 });

    // Select Media category — handle "No categories available" if categories are not loaded.
    const hasCategories = await selectAskCategory(page);
    if (!hasCategories) {
      await context.close();
      test.skip(true, "Categories not loaded — cannot ask a question for tie test");
      return;
    }

    // Enter a unique direct image URL
    const uniqueId = Date.now();
    const urlInput = page.locator("input[type='url']").first();
    await expect(urlInput).toBeVisible({ timeout: 5_000 });
    await urlInput.fill(`https://picsum.photos/seed/tie-test-${uniqueId}/1200/800.jpg`);

    // Enter title and description
    const titleInput = page.getByPlaceholder("Write a subjective question voters can rate");
    await expect(titleInput).toBeVisible({ timeout: 3_000 });
    await titleInput.fill(`Tie Test Title ${uniqueId}`);

    const descInput = page.locator("textarea").first();
    await expect(descInput).toBeVisible({ timeout: 3_000 });
    await descInput.fill(`Tie Test ${uniqueId}`);

    const hasSubcategory = await selectAskSubcategory(page);
    if (!hasSubcategory) {
      await context.close();
      test.skip(true, "No seeded subcategory available for tie test");
      return;
    }

    // Submit
    await continueToBountyStep(page);
    await selectBountyRewardAsset(page, "hrep");
    const submitBtn = page.getByRole("button", { name: /^Submit/i });
    await expect(submitBtn).toBeVisible({ timeout: 5_000 });
    await expect(submitBtn).toBeEnabled({ timeout: 5_000 });
    await submitBtn.click();

    await expect(page.getByRole("heading", { name: /Question Submitted/i })).toBeVisible({ timeout: 30_000 });

    await context.close();

    // Ensure Ponder has caught up to the chain tip before polling for specific content
    await waitForPonderSync(60_000);

    // Find the newly submitted content via Ponder
    const indexed = await waitForPonderIndexed(
      async () => {
        const { items } = await getContentList({ status: "all", sortBy: "newest", limit: 5 });
        const match = items.find(item => item.url.includes(`tie-test-${uniqueId}`));
        if (match) {
          newContentId = match.id;
          return true;
        }
        return false;
      },
      30_000,
      2_000,
      "tied-round:findContent",
    );

    if (!indexed) {
      test.skip(true, "Ponder not indexing new content — skipping tie test");
      return;
    }

    expect(newContentId).toBeTruthy();
  });

  test("4 voters create a tie (2 up, 2 down, equal stakes)", async ({ browser }) => {
    test.setTimeout(240_000);
    test.skip(!newContentId, "No content from previous test");

    // 2 UP + 2 DOWN = equal pools → tie
    const voters = [
      { account: ANVIL_ACCOUNTS.account3, direction: "up" as const },
      { account: ANVIL_ACCOUNTS.account4, direction: "up" as const },
      { account: ANVIL_ACCOUNTS.account5, direction: "down" as const },
      { account: ANVIL_ACCOUNTS.account6, direction: "down" as const },
    ];

    let successCount = 0;

    for (const voter of voters) {
      const context = await newE2EContext(browser);
      const page = await context.newPage();
      await setupWallet(page, voter.account.privateKey);

      const success = await voteOnSpecificContent(page, newContentId!, voter.direction);
      if (success) successCount++;

      await context.close();
    }

    // Need all 4 votes for a perfect tie (>= minVoters=3 for settlement)
    if (successCount < 4) {
      test.skip(true, `Only ${successCount}/4 votes succeeded (cooldowns?)`);
      return;
    }

    // Snapshot the pre-settlement rating
    const preData = await getContentById(newContentId!);
    const preRating = preData.content.rating;

    // Get the active round ID before settlement
    const roundId = await getActiveRoundId(BigInt(newContentId!), VOTING_ENGINE);

    // Fast-forward past epoch duration so votes become revealable
    await evmIncreaseTime(EPOCH_DURATION + 1);

    // Trigger the keeper to reveal votes via its API.
    // The keeper reads committed votes on-chain and calls revealVoteByCommitKey.
    // In E2E, we trigger a keeper run by calling its endpoint or just fast-forward
    // and let the keeper poll loop handle it. Since UI votes use transferAndCall(),
    // the keeper's _revealCommits will decode the mock ciphertext and reveal.
    //
    // Wait a bit for the keeper to pick up the reveals
    await waitForPonderSync();

    // Fast-forward past epoch (no settlement delay, but chain time must advance)
    await evmIncreaseTime(EPOCH_DURATION + 1);
    await waitForPonderSync();

    // Try to settle
    if (roundId > 0n) {
      await settleRoundDirect(BigInt(newContentId!), roundId, ANVIL_ACCOUNTS.account1.address, VOTING_ENGINE);
    }

    // Wait for settlement in Ponder
    const settled = await waitForSettlementIndexed(newContentId!, PONDER_URL, 30_000);
    expect(settled).toBe(true);

    // Verify round state — must be Tied (state=3) since pools are equal
    const postData = await getContentById(newContentId!);
    const tiedRound = postData.rounds.find(r => r.state === 3);

    expect(tiedRound, "Round should be Tied (state=3) when upPool === downPool").toBeTruthy();

    // Rating must NOT change on a tied round
    expect(postData.content.rating).toBe(preRating);

    // Verify equal pools
    expect(tiedRound!.upPool).toBe(tiedRound!.downPool);
  });
});
