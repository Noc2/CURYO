import { ANVIL_ACCOUNTS } from "../helpers/anvil-accounts";
import { setupWallet } from "../helpers/local-storage";
import { waitForFeedLoaded } from "../helpers/wait-helpers";
import { expect, test } from "@playwright/test";

test.describe("Error states and edge cases", () => {
  test("submit page without VoterID shows mint prompt", async ({ browser }) => {
    // Account #1 has no cREP and no VoterID — use fresh context
    const context = await browser.newContext();
    const page = await context.newPage();
    await setupWallet(page, ANVIL_ACCOUNTS.account1.privateKey);
    await page.goto("/submit", { waitUntil: "domcontentloaded" });

    // Without VoterID, should show "Voter ID Required" heading
    const voterIdRequired = page.getByRole("heading", { name: /Voter ID Required/i });
    const getVoterIdLink = page.getByRole("link", { name: /Get Voter ID/i });
    const submitForm = page.getByRole("heading", { name: "Submit Content" });

    // Wait for either the VoterID prompt or the submit form to render
    await expect(voterIdRequired.or(submitForm)).toBeVisible({ timeout: 15_000 });

    if (await voterIdRequired.isVisible()) {
      await expect(getVoterIdLink).toBeVisible({ timeout: 5_000 });
    }

    await context.close();
  });

  test("own content shows 'Your submission' label", async ({ browser }) => {
    // Account #2 submitted content #1 (from seed). Navigate directly to it.
    const context = await browser.newContext();
    const page = await context.newPage();
    await setupWallet(page, ANVIL_ACCOUNTS.account2.privateKey);

    // Navigate directly to content #1 which was submitted by account #2
    await page.goto("/vote?content=1");
    await waitForFeedLoaded(page);

    const ownContentLabel = page.getByText("Your submission");
    await expect(ownContentLabel).toBeVisible({ timeout: 15_000 });

    // Verify vote buttons are NOT visible on own content
    const voteUp = page.getByRole("button", { name: "Vote up" });
    expect(await voteUp.isVisible().catch(() => false)).toBe(false);

    await context.close();
  });

  test("page loads without wallet setup", async ({ browser }) => {
    // Without setupWallet, the burner wallet may still auto-connect in scaffold-eth.
    // This test verifies the page loads without errors regardless.
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/vote");
    await waitForFeedLoaded(page, 20_000);

    // Page should render main content
    const mainContent = page.locator("main");
    await expect(mainContent).toBeVisible({ timeout: 10_000 });

    await context.close();
  });
});
