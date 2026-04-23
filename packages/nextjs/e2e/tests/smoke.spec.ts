import { ANVIL_ACCOUNTS } from "../helpers/anvil-accounts";
import {
  getVisibleAuthConnectButton,
  gotoWithRetry,
  waitForFeedLoaded,
  waitForWalletConnected,
} from "../helpers/wait-helpers";
import { setupWallet } from "../helpers/wallet-session";
import { expect, test } from "@playwright/test";

test.describe("Smoke tests", () => {
  test("landing page loads without wallet", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Curyo/i);
  });

  test("wallet auto-connects via the localhost thirdweb test wallet", async ({ page }) => {
    await setupWallet(page, ANVIL_ACCOUNTS.account2.privateKey);
    await gotoWithRetry(page, "/rate", { ensureWalletConnected: true });
    await waitForWalletConnected(page);
    await waitForFeedLoaded(page, 30_000);

    // After feed loads, check for wallet connection indicators.
    // If the feed is empty ("No questions have been asked yet"), the sort dropdown still renders,
    // proving the wallet connected and the page loaded (just no content in Ponder yet).
    const voteUp = page.getByRole("button", { name: "Vote up" });
    const votedStatus = page.getByText(/Voted(?: hidden| Up| Down)?/i);
    const ownContent = page.getByText("Your question");
    const emptyFeed = page.getByText("No questions have been asked yet");
    const sortDropdown = page.locator("select").first();

    const connectedIndicator = voteUp.or(votedStatus).or(ownContent).or(emptyFeed).or(sortDropdown);
    // Use .first() to avoid strict mode violation when multiple indicators match
    await connectedIndicator.first().waitFor({ state: "visible", timeout: 15_000 });

    await expect(getVisibleAuthConnectButton(page)).toHaveCount(0);
  });

  test("brand link can reopen landing page without redirecting connected users back to rate", async ({ page }) => {
    await setupWallet(page, ANVIL_ACCOUNTS.account2.privateKey);
    await gotoWithRetry(page, "/rate", { ensureWalletConnected: true });
    await waitForWalletConnected(page);
    await waitForFeedLoaded(page, 30_000);

    await page.getByRole("link", { name: /CURYO \(BETA\)/i }).click();

    await expect(page.getByRole("heading", { name: /Human Reputation\s*at Stake/i }).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page).toHaveURL(/\/$/);
  });

  test("navigation to ask page works", async ({ page }) => {
    await setupWallet(page, ANVIL_ACCOUNTS.account2.privateKey);
    await gotoWithRetry(page, "/ask", { ensureWalletConnected: true });

    await expect(page).toHaveURL(/\/ask/);
    // Verify the ask page rendered (form, VoterID prompt, or connect wallet prompt)
    const heading = page.getByRole("heading", { name: /^Ask$|Ask Question|Voter ID Required/i });
    await expect(heading).toBeVisible({ timeout: 15_000 });
  });
});
