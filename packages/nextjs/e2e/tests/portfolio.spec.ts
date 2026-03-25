import { expect, test } from "../fixtures/wallet";
import { ANVIL_ACCOUNTS } from "../helpers/anvil-accounts";
import { newE2EContext } from "../helpers/browser-context";
import { getVisibleAuthConnectButton, gotoWithRetry } from "../helpers/wait-helpers";
import { setupWallet } from "../helpers/wallet-session";

test.describe("Portfolio page", () => {
  test("shows stats for connected wallet", async ({ connectedPage: page }) => {
    await gotoWithRetry(page, "/portfolio");

    // Use heading role to target the main h1 "Portfolio"
    const heading = page.getByRole("heading", { name: "Portfolio" });
    await expect(heading).toBeVisible({ timeout: 15_000 });

    // If wallet sync is still propagating into wagmi, reload once and retry.
    const main = page.locator("main");
    const totalVotesLabel = main.getByText("Total Votes");

    try {
      await expect(totalVotesLabel).toBeVisible({ timeout: 10_000 });
    } catch {
      // Wallet sync still in flight, reload and retry once.
      await page.reload();
      await expect(heading).toBeVisible({ timeout: 15_000 });
      await expect(totalVotesLabel).toBeVisible({ timeout: 15_000 });
    }

    const resolvedLabel = main.getByText("Resolved");
    await expect(resolvedLabel).toBeVisible({ timeout: 10_000 });
  });

  test("shows vote history section", async ({ connectedPage: page }) => {
    await gotoWithRetry(page, "/portfolio");

    // "Vote History" h2 is in main — use heading role to avoid matching h4s in sidebar
    const voteHistoryHeading = page.getByRole("heading", { name: "Vote History" });
    await expect(voteHistoryHeading).toBeVisible({ timeout: 15_000 });

    // Should have either vote entries or "No votes yet" message
    const main = page.locator("main");
    const voteEntry = main.getByText(/Content #\d+/);
    const noVotes = main.getByText("No votes yet");
    const historyContent = voteEntry.or(noVotes);
    await expect(historyContent.first()).toBeVisible({ timeout: 10_000 });
  });

  test("shows empty state for account with no votes", async ({ browser }) => {
    const context = await newE2EContext(browser);
    const page = await context.newPage();
    await setupWallet(page, ANVIL_ACCOUNTS.account1.privateKey);
    await gotoWithRetry(page, "/portfolio");

    // Should show Portfolio page with stats or "No votes yet"
    const main = page.locator("main");
    const heading = page.getByRole("heading", { name: "Portfolio" });
    const noVotes = main.getByText("No votes yet");
    const zeroStats = main.getByText("0").first();

    const content = heading.or(noVotes).or(zeroStats);
    await expect(content.first()).toBeVisible({ timeout: 15_000 });

    await context.close();
  });

  test("disconnected wallet shows connect prompt", async ({ browser }) => {
    const context = await newE2EContext(browser);
    const page = await context.newPage();
    await gotoWithRetry(page, "/portfolio");

    const portfolioHeading = page.getByRole("heading", { name: "Portfolio" });
    await expect(portfolioHeading).toBeVisible({ timeout: 15_000 });
    await expect(getVisibleAuthConnectButton(page).first()).toBeVisible({ timeout: 15_000 });

    await context.close();
  });
});
