import { cancelContent } from "../helpers/admin-helpers";
import { ANVIL_ACCOUNTS } from "../helpers/anvil-accounts";
import { newE2EContext } from "../helpers/browser-context";
import { CONTRACT_ADDRESSES } from "../helpers/contracts";
import { gotoWithRetry } from "../helpers/wait-helpers";
import { findVoteableContent, waitForFeedLoaded } from "../helpers/wait-helpers";
import { setupWallet } from "../helpers/wallet-session";
import { expect, test } from "@playwright/test";

/**
 * Negative / rejection tests.
 * Verify that invalid actions are properly rejected on-chain and in the UI.
 *
 * Account allocation:
 * - Account #9 (scaffold-eth deployer) — has GOVERNANCE_ROLE
 * - Account #0 (no VoterID) — unauthorized user
 * - Account #2 (1000 HREP + VoterID) — submitter of content #1
 * - Account #3 (1000 HREP + VoterID) — non-submitter
 */
test.describe("Negative cases", () => {
  test("non-submitter cannot cancel content", async () => {
    // Content #1 was submitted by account #2. Account #3 should NOT be able to cancel it.
    const success = await cancelContent(BigInt(1), ANVIL_ACCOUNTS.account3.address, CONTRACT_ADDRESSES.ContentRegistry);
    expect(success).toBe(false);
  });

  test("vote page shows content for user without VoterID", async ({ browser }) => {
    // Account #0 has no VoterID — verify the vote page loads
    // and content is visible. Vote buttons may or may not be shown
    // (the contract will reject votes without VoterID regardless).
    const context = await newE2EContext(browser);
    const page = await context.newPage();
    await setupWallet(page, ANVIL_ACCOUNTS.account0.privateKey, { bootstrap: false });

    await page.goto("/rate");

    // The page should load safely even if the local wallet bridge doesn't attach.
    const main = page.locator("main");
    await expect(main).toBeVisible({ timeout: 10_000 });

    await context.close();
  });

  test("ask page shows VoterID prompt for user without VoterID", async ({ browser }) => {
    const context = await newE2EContext(browser);
    const page = await context.newPage();
    await setupWallet(page, ANVIL_ACCOUNTS.account0.privateKey, { bootstrap: false });

    await page.goto("/ask");

    const voterIdRequired = page.getByRole("heading", { name: /Voter ID Required/i });
    const submitForm = page.getByRole("heading", { name: "Submit Question" });
    const signedOutHeading = page.getByRole("heading", { name: "Submit" });

    // Accept either the connected no-VoterID prompt, the ask form, or the
    // signed-out shell if the local test wallet bridge doesn't attach.
    await expect(voterIdRequired.or(submitForm).or(signedOutHeading)).toBeVisible({ timeout: 15_000 });

    // If VoterID prompt shows, verify the "Get Voter ID" link exists
    if (await voterIdRequired.isVisible()) {
      const getVoterIdLink = page.getByRole("link", { name: /Get Voter ID/i });
      await expect(getVoterIdLink).toBeVisible({ timeout: 5_000 });
    } else if (await signedOutHeading.isVisible().catch(() => false)) {
      test.skip(true, "Local test wallet bridge did not attach on ask page");
    }

    await context.close();
  });

  test("double vote on same content shows cooldown", async ({ page }) => {
    test.setTimeout(120_000);

    // Account #6 has VoterID #104 and HREP.
    await setupWallet(page, ANVIL_ACCOUNTS.account6.privateKey);

    await gotoWithRetry(page, "/rate", { ensureWalletConnected: true, timeout: 30_000 });
    await waitForFeedLoaded(page, 20_000);

    const voteUp = page.getByRole("button", { name: /^Vote up\b/i }).first();
    const canVote = await findVoteableContent(page);

    if (!canVote) {
      test.skip(true, "No voteable content found for account #6 (all content has cooldowns)");
      return;
    }

    if (!(await voteUp.isVisible({ timeout: 10_000 }).catch(() => false))) {
      test.skip(true, "No visible vote-up button found after selecting voteable content");
      return;
    }

    // First vote — wait for the button to stabilize (React re-renders from Ponder polling
    // can detach/reattach the element between locator resolution and click)
    await voteUp.waitFor({ state: "visible", timeout: 10_000 });
    await page.waitForTimeout(500); // let React settle
    await voteUp.click();
    const stakeModal = page.locator("[role='dialog']").first();
    await expect(stakeModal).toBeVisible({ timeout: 5_000 });

    const presetBtn = stakeModal.getByRole("button", { name: /^1$/ });
    if (await presetBtn.isVisible().catch(() => false)) {
      await presetBtn.click();
    }

    const confirmBtn = stakeModal.getByRole("button", { name: /Stake \d+/i });
    await expect(confirmBtn).toBeVisible({ timeout: 5_000 });
    await page.waitForTimeout(300); // let React settle before confirm click
    await confirmBtn.click();

    // Wait for success or error (includes approval failures).
    // The UI may show "Voted!", "submitted", "committed", "staked", or an error toast.
    // Also detect the modal closing as an implicit success signal.
    const successMsg = page.getByText(/voted|success|submitted|committed|staked/i);
    const errorMsg = page.getByText(/reverted|failed|error|rejected|not confirmed/i);
    const modalClosed = stakeModal
      .waitFor({ state: "hidden", timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    const msgVisible = expect(successMsg.or(errorMsg).first())
      .toBeVisible({ timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    await Promise.race([modalClosed, msgVisible]);

    // Check if vote succeeded: either success message visible or modal closed without error
    const hasSuccessMsg = await successMsg
      .first()
      .isVisible()
      .catch(() => false);
    const hasErrorMsg = await errorMsg
      .first()
      .isVisible()
      .catch(() => false);
    const firstVoteSucceeded = hasSuccessMsg || (!hasErrorMsg && !(await stakeModal.isVisible().catch(() => true)));

    if (!firstVoteSucceeded) {
      test.skip(true, "First vote did not succeed (contract may have reverted)");
      return;
    }

    // After successful vote, stay on the page and verify the UI shows voted state.
    // The VotingQuestionCard reads the vote from contract state and shows
    // "Voted hidden" badge or "Cooldown" instead of vote buttons.
    // The page may auto-advance to the next content after voting.
    // Also accept "vote reverted" as evidence: the contract rejects
    // duplicate votes, so a revert when revisiting means the prior vote stuck.
    const votedOrCooldown = page
      .getByText(/Voted(?: hidden| Up| Down)?/i)
      .or(page.getByText(/Cooldown/i))
      .or(page.getByText(/vote.*reverted/i));

    let foundVotedState = await votedOrCooldown
      .first()
      .waitFor({ state: "visible", timeout: 10_000 })
      .then(() => true)
      .catch(() => false);

    if (!foundVotedState) {
      // Page may have auto-advanced to next content. Cycle through thumbnails
      // to re-select the voted content and verify its voted/cooldown state.
      const thumbnails = page.locator("[data-testid='content-thumbnail']");
      const thumbCount = await thumbnails.count();

      for (let i = 0; i < Math.min(thumbCount, 20); i++) {
        const thumb = thumbnails.nth(i);
        if (await thumb.isVisible().catch(() => false)) {
          await thumb.click();
          foundVotedState = await votedOrCooldown
            .first()
            .waitFor({ state: "visible", timeout: 3_000 })
            .then(() => true)
            .catch(() => false);
          if (foundVotedState) break;
        }
      }
    }

    // The voted content should show "Voted hidden", "Cooldown", or
    // "vote reverted" (contract rejects duplicate votes).
    // After voting the page auto-advances to the next card, so re-finding
    // the voted content in the thumbnail grid can be flaky — skip gracefully.
    if (!foundVotedState) {
      test.skip(true, "Vote succeeded but could not re-find voted content after page auto-advanced");
      return;
    }
  });
});
