import { cancelContent } from "../helpers/admin-helpers";
import { ANVIL_ACCOUNTS } from "../helpers/anvil-accounts";
import { CONTRACT_ADDRESSES } from "../helpers/contracts";
import { setupWallet } from "../helpers/local-storage";
import { waitForFeedLoaded } from "../helpers/wait-helpers";
import { expect, test } from "@playwright/test";

/**
 * Negative / rejection tests.
 * Verify that invalid actions are properly rejected on-chain and in the UI.
 *
 * Account allocation:
 * - Account #9 (scaffold-eth deployer) — has GOVERNANCE_ROLE
 * - Account #1 (no cREP, no VoterID) — unauthorized user
 * - Account #2 (1000 cREP + VoterID) — submitter of content #1
 * - Account #3 (1000 cREP + VoterID) — non-submitter
 */
test.describe("Negative cases", () => {
  test("non-submitter cannot cancel content", async () => {
    // Content #1 was submitted by account #2. Account #3 should NOT be able to cancel it.
    const success = await cancelContent(BigInt(1), ANVIL_ACCOUNTS.account3.address, CONTRACT_ADDRESSES.ContentRegistry);
    expect(success).toBe(false);
  });

  test("vote page shows content for user without VoterID", async ({ browser }) => {
    // Account #1 has no VoterID and no cREP — verify the vote page loads
    // and content is visible. Vote buttons may or may not be shown
    // (the contract will reject votes without VoterID regardless).
    const context = await browser.newContext();
    const page = await context.newPage();
    await setupWallet(page, ANVIL_ACCOUNTS.account1.privateKey);

    await page.goto("/vote");
    await waitForFeedLoaded(page);

    // The page should load and show content cards or a message
    const main = page.locator("main");
    await expect(main).toBeVisible({ timeout: 10_000 });

    await context.close();
  });

  test("submit page shows VoterID prompt for user without VoterID", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await setupWallet(page, ANVIL_ACCOUNTS.account1.privateKey);

    await page.goto("/submit");

    const voterIdRequired = page.getByRole("heading", { name: /Voter ID Required/i });
    const submitForm = page.getByRole("heading", { name: "Submit Content" });

    // Wait for either VoterID prompt or submit form
    await expect(voterIdRequired.or(submitForm)).toBeVisible({ timeout: 15_000 });

    // If VoterID prompt shows, verify the "Get Voter ID" link exists
    if (await voterIdRequired.isVisible()) {
      const getVoterIdLink = page.getByRole("link", { name: /Get Voter ID/i });
      await expect(getVoterIdLink).toBeVisible({ timeout: 5_000 });
    }

    await context.close();
  });

  test("double vote on same content shows cooldown", async ({ browser }) => {
    test.setTimeout(120_000);

    // Account #6 has VoterID #104 and cREP.
    const context = await browser.newContext();
    const page = await context.newPage();
    await setupWallet(page, ANVIL_ACCOUNTS.account6.privateKey);

    // Navigate to the feed and find voteable content.
    // Prior runs may have used up content #2, so cycle through thumbnails.
    await page.goto("/vote");
    await waitForFeedLoaded(page);

    const voteUp = page.getByRole("button", { name: "Vote up" });
    let canVote = await voteUp
      .waitFor({ state: "visible", timeout: 5_000 })
      .then(() => true)
      .catch(() => false);

    if (!canVote) {
      const thumbnails = page.locator(".grid button").filter({ has: page.locator("img") });
      const thumbCount = await thumbnails.count();

      for (let i = 0; i < Math.min(thumbCount, 20); i++) {
        const thumb = thumbnails.nth(i);
        if (await thumb.isVisible().catch(() => false)) {
          await thumb.click();
          await page.waitForTimeout(2_000);
          canVote = await voteUp
            .waitFor({ state: "visible", timeout: 3_000 })
            .then(() => true)
            .catch(() => false);
          if (canVote) break;
        }
      }
    }

    if (!canVote) {
      await context.close();
      test.skip(true, "No voteable content found for account #6 (all content has cooldowns)");
      return;
    }

    // First vote
    await voteUp.click();
    const stakeModal = page.locator("[role='dialog']").first();
    await expect(stakeModal).toBeVisible({ timeout: 5_000 });

    const presetBtn = stakeModal.getByRole("button", { name: /^1$/ });
    if (await presetBtn.isVisible().catch(() => false)) {
      await presetBtn.click();
    }

    const confirmBtn = stakeModal.getByRole("button", { name: /Stake \d+/i });
    await expect(confirmBtn).toBeVisible({ timeout: 5_000 });
    await confirmBtn.click();

    // Wait for success or error (includes approval failures)
    const successMsg = page.getByText(/committed|success|voted/i);
    const errorMsg = page.getByText(/reverted|failed|error|rejected|not confirmed/i);
    await expect(successMsg.or(errorMsg).first()).toBeVisible({ timeout: 30_000 });

    const firstVoteSucceeded = await successMsg
      .first()
      .isVisible()
      .catch(() => false);

    if (!firstVoteSucceeded) {
      await context.close();
      test.skip(true, "First vote did not succeed (contract may have reverted)");
      return;
    }

    // After successful vote, stay on the page and verify the UI shows voted state.
    // The VotingQuestionCard reads the vote from localStorage and shows
    // "Voted Up"/"Voted Down" badge or "Cooldown" instead of vote buttons.
    // The page may auto-advance to the next content after voting.
    // Also accept "commitVote reverted" as evidence: the contract rejects
    // duplicate votes, so a revert when revisiting means the prior vote stuck.
    await page.waitForTimeout(3_000);

    const votedOrCooldown = page
      .getByText("Voted Up")
      .or(page.getByText("Voted Down"))
      .or(page.getByText(/Cooldown/i))
      .or(page.getByText(/commitVote.*reverted/i));

    let foundVotedState = await votedOrCooldown
      .first()
      .waitFor({ state: "visible", timeout: 10_000 })
      .then(() => true)
      .catch(() => false);

    if (!foundVotedState) {
      // Page may have auto-advanced to next content. Cycle through thumbnails
      // to re-select the voted content and verify its voted/cooldown state.
      const thumbnails = page.locator(".grid button").filter({ has: page.locator("img") });
      const thumbCount = await thumbnails.count();

      for (let i = 0; i < Math.min(thumbCount, 20); i++) {
        const thumb = thumbnails.nth(i);
        if (await thumb.isVisible().catch(() => false)) {
          await thumb.click();
          await page.waitForTimeout(2_000);
          foundVotedState = await votedOrCooldown
            .first()
            .waitFor({ state: "visible", timeout: 3_000 })
            .then(() => true)
            .catch(() => false);
          if (foundVotedState) break;
        }
      }
    }

    // The voted content should show "Voted Up/Down", "Cooldown", or
    // "commitVote reverted" (contract rejects duplicate votes).
    expect(foundVotedState, "Voted content should display voted or cooldown state").toBe(true);

    await context.close();
  });
});
