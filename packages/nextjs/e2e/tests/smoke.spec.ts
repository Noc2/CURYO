import { ANVIL_ACCOUNTS } from "../helpers/anvil-accounts";
import { setupWallet } from "../helpers/wallet-session";
import { waitForFeedLoaded } from "../helpers/wait-helpers";
import { expect, test } from "@playwright/test";

test.describe("Smoke tests", () => {
  test("landing page loads without wallet", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Curyo/i);
  });

  test("wallet auto-connects via the localhost thirdweb test wallet", async ({ page }) => {
    await setupWallet(page, ANVIL_ACCOUNTS.account2.privateKey);
    await page.goto("/vote");
    await waitForFeedLoaded(page);

    // After feed loads, check for wallet connection indicators.
    // If the feed is empty ("No content submitted yet"), the sort dropdown still renders,
    // proving the wallet connected and the page loaded (just no content in Ponder yet).
    const voteUp = page.getByRole("button", { name: "Vote up" });
    const votedStatus = page.getByText(/Voted (Up|Down)/i);
    const ownContent = page.getByText("Your submission");
    const emptyFeed = page.getByText("No content submitted yet");
    const sortDropdown = page.locator("select").first();

    const connectedIndicator = voteUp.or(votedStatus).or(ownContent).or(emptyFeed).or(sortDropdown);
    // Use .first() to avoid strict mode violation when multiple indicators match
    await connectedIndicator.first().waitFor({ state: "visible", timeout: 15_000 });

    // Verify the main "Connect your wallet to submit" prompt is NOT visible
    // (that would mean the test wallet sync failed)
    const mainPrompt = page.getByText("Connect your wallet to submit", { exact: false });
    expect(await mainPrompt.isVisible().catch(() => false)).toBe(false);
  });

  test("navigation to submit page works", async ({ page }) => {
    await setupWallet(page, ANVIL_ACCOUNTS.account2.privateKey);
    await page.goto("/submit", { waitUntil: "domcontentloaded" });

    await expect(page).toHaveURL(/\/submit/);
    // Verify the submit page rendered (form, VoterID prompt, or connect wallet prompt)
    const heading = page.getByRole("heading", { name: /^Submit$|Submit Content|Voter ID Required/i });
    await expect(heading).toBeVisible({ timeout: 15_000 });
  });
});
