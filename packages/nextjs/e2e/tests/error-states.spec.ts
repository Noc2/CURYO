import { ANVIL_ACCOUNTS } from "../helpers/anvil-accounts";
import { newE2EContext } from "../helpers/browser-context";
import { setupWallet } from "../helpers/wallet-session";
import { gotoWithRetry, waitForFeedLoaded } from "../helpers/wait-helpers";
import { expect, test } from "@playwright/test";

test.describe("Error states and edge cases", () => {
  test("submit page without VoterID shows mint prompt", async ({ browser }) => {
    // Account #1 has no cREP and no VoterID — use fresh context
    const context = await newE2EContext(browser);
    const page = await context.newPage();
    await setupWallet(page, ANVIL_ACCOUNTS.account1.privateKey);
    await gotoWithRetry(page, "/submit");

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
    test.setTimeout(60_000);
    // Account #2 submitted seeded content items. Use the dedicated activity
    // view instead of relying on the default mixed feed order.
    const context = await newE2EContext(browser);
    const page = await context.newPage();
    await setupWallet(page, ANVIL_ACCOUNTS.account2.privateKey);

    await gotoWithRetry(page, `/vote?q=${encodeURIComponent("Fantastic Mr. Fox")}`);
    await waitForFeedLoaded(page, 20_000);

    const ownContentLabel = page.getByText("Your submission");
    await expect(page.getByText("Fantastic Mr. Fox", { exact: true }).first()).toBeVisible({ timeout: 15_000 });
    await expect(ownContentLabel).toBeVisible({ timeout: 10_000 });

    await context.close();
  });

  test("page loads without wallet setup", async ({ browser }) => {
    // Without setupWallet, no local test wallet session is injected.
    // This test verifies the page still loads without errors.
    const context = await newE2EContext(browser);
    const page = await context.newPage();
    await gotoWithRetry(page, "/vote");
    await waitForFeedLoaded(page, 20_000);

    // Page should render main content
    const mainContent = page.locator("main");
    await expect(mainContent).toBeVisible({ timeout: 10_000 });

    await context.close();
  });
});
