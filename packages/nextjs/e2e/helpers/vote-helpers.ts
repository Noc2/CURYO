import { gotoWithRetry, waitForFeedLoaded } from "./wait-helpers";
import type { Page } from "@playwright/test";

/**
 * Try to vote on content. If the featured content has cooldown/own-content/round-full,
 * click through thumbnail grid items until we find voteable content.
 *
 * Returns true if the vote was successfully placed, false otherwise.
 * Handles transaction reverts gracefully by returning false instead of throwing.
 */
export async function voteOnContent(page: Page, direction: "up" | "down"): Promise<boolean> {
  await gotoWithRetry(page, "/vote", { ensureWalletConnected: true });
  await waitForFeedLoaded(page);

  const ariaLabel = direction === "up" ? "Vote up" : "Vote down";
  const voteBtn = page.getByRole("button", { name: ariaLabel });

  // Check if vote button is visible on the featured content (waitFor actually waits, unlike isVisible)
  let canVote = await voteBtn
    .waitFor({ state: "visible", timeout: 5_000 })
    .then(() => true)
    .catch(() => false);

  // If not visible (cooldown, own content, round full), try clicking thumbnails
  if (!canVote) {
    const thumbnails = page.locator("[data-testid='content-thumbnail']");
    const thumbCount = await thumbnails.count();

    for (let i = 0; i < Math.min(thumbCount, 6); i++) {
      const thumb = thumbnails.nth(i);
      if (await thumb.isVisible().catch(() => false)) {
        await thumb.click();
        canVote = await voteBtn
          .waitFor({ state: "visible", timeout: 5_000 })
          .then(() => true)
          .catch(() => false);
        if (canVote) break;
      }
    }
  }

  if (!canVote) {
    return false;
  }

  // Click the vote button — retry if the element gets detached during a
  // React re-render (feed data polling can replace DOM nodes mid-click).
  let clicked = false;
  for (let retry = 0; retry < 2; retry++) {
    try {
      await voteBtn.waitFor({ state: "visible", timeout: 5_000 });
      await voteBtn.click({ timeout: 10_000 });
      clicked = true;
      break;
    } catch {
      // Element detached or not stable — retry
    }
  }
  if (!clicked) return false;

  // StakeSelector modal should appear (role="dialog")
  const stakeModal = page.locator("[role='dialog']").first();
  const modalVisible = await stakeModal
    .waitFor({ state: "visible", timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  if (!modalVisible) return false;

  // Click the "1" preset button (lowest stake)
  const presetBtn = stakeModal.getByRole("button", { name: /^1$/ });
  const presetVisible = await presetBtn
    .waitFor({ state: "visible", timeout: 3_000 })
    .then(() => true)
    .catch(() => false);
  if (presetVisible) {
    await presetBtn.click();
  }

  // Click the confirm/stake button — text is "Stake {N} cREP"
  const confirmBtn = stakeModal.getByRole("button", { name: /Stake \d+/i });
  const confirmVisible = await confirmBtn
    .waitFor({ state: "visible", timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  if (!confirmVisible) return false;
  await confirmBtn.click();

  // Wait for EITHER success OR error — the contract call may revert.
  // NOTE: Do NOT match /success/i — scaffold-eth fires a generic
  // "Transaction completed successfully!" toast for the approve tx,
  // which would match before the actual vote completes.
  const successIndicator = page.getByText(/voted/i);

  const errorIndicator = page
    .getByText(/reverted/i)
    .or(page.getByText(/failed/i))
    .or(page.getByText(/error/i))
    .or(page.getByText(/rejected/i))
    .or(page.getByText(/not confirmed/i));

  const outcome = successIndicator.or(errorIndicator);

  try {
    await outcome.first().waitFor({ state: "visible", timeout: 30_000 });
  } catch {
    // Timeout — no success or error indicator appeared
    return false;
  }

  // Check if it was a success or error
  const wasSuccess = await successIndicator
    .first()
    .isVisible()
    .catch(() => false);
  return wasSuccess;
}

/**
 * Vote on a specific content item by navigating to /vote?content={contentId}.
 * Same flow as voteOnContent but targets a known content ID.
 *
 * Returns true if the vote was successfully placed, false otherwise.
 */
export async function voteOnSpecificContent(
  page: Page,
  contentId: string | number,
  direction: "up" | "down",
): Promise<boolean> {
  await gotoWithRetry(page, `/vote?content=${contentId}`, { ensureWalletConnected: true });
  await waitForFeedLoaded(page);

  const ariaLabel = direction === "up" ? "Vote up" : "Vote down";
  const voteBtn = page.getByRole("button", { name: ariaLabel });

  const canVote = await voteBtn
    .waitFor({ state: "visible", timeout: 10_000 })
    .then(() => true)
    .catch(() => false);

  if (!canVote) return false;

  // Click with retry for React re-renders
  let clicked = false;
  for (let retry = 0; retry < 2; retry++) {
    try {
      await voteBtn.waitFor({ state: "visible", timeout: 5_000 });
      await voteBtn.click({ timeout: 10_000 });
      clicked = true;
      break;
    } catch {
      // Element detached — retry
    }
  }
  if (!clicked) return false;

  // StakeSelector modal
  const stakeModal = page.locator("[role='dialog']").first();
  const modalVisible = await stakeModal
    .waitFor({ state: "visible", timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  if (!modalVisible) return false;

  // Click "1" preset (lowest stake = 1 cREP)
  const presetBtn = stakeModal.getByRole("button", { name: /^1$/ });
  if (
    await presetBtn
      .waitFor({ state: "visible", timeout: 3_000 })
      .then(() => true)
      .catch(() => false)
  ) {
    await presetBtn.click();
  }

  // Confirm
  const confirmBtn = stakeModal.getByRole("button", { name: /Stake \d+/i });
  if (
    !(await confirmBtn
      .waitFor({ state: "visible", timeout: 5_000 })
      .then(() => true)
      .catch(() => false))
  ) {
    return false;
  }
  await confirmBtn.click();

  // Wait for outcome — avoid /success/i which matches the approve tx toast
  const successIndicator = page.getByText(/voted/i);

  const errorIndicator = page
    .getByText(/reverted/i)
    .or(page.getByText(/failed/i))
    .or(page.getByText(/error/i))
    .or(page.getByText(/rejected/i))
    .or(page.getByText(/not confirmed/i));

  try {
    await successIndicator.or(errorIndicator).first().waitFor({ state: "visible", timeout: 30_000 });
  } catch {
    return false;
  }

  return await successIndicator
    .first()
    .isVisible()
    .catch(() => false);
}
