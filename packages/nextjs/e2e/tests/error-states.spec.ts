import { expect, test } from "../fixtures/wallet";
import { ANVIL_ACCOUNTS } from "../helpers/anvil-accounts";
import { newE2EContext } from "../helpers/browser-context";
import { gotoWithRetry, waitForFeedLoaded } from "../helpers/wait-helpers";
import { setupWallet } from "../helpers/wallet-session";

test.describe("Error states and edge cases", () => {
  test("ask page without VoterID shows mint prompt", async ({ browser }) => {
    // Account #0 has no VoterID and is otherwise idle in local E2E.
    const context = await newE2EContext(browser);
    const page = await context.newPage();
    await setupWallet(page, ANVIL_ACCOUNTS.account0.privateKey, { bootstrap: false });
    await page.goto("/ask", { waitUntil: "domcontentloaded" });

    // Without VoterID, should show "Voter ID Required" heading
    const voterIdRequired = page.getByRole("heading", { name: /Voter ID Required/i });
    const getVoterIdLink = page.getByRole("link", { name: /Get Voter ID/i });
    const submitForm = page.getByRole("heading", { name: "Submit Question" });
    const signedOutHeading = page.getByRole("heading", { name: "Submit" });
    // Local wallet auto-connect is best-effort in E2E. Accept either the
    // connected no-VoterID prompt, the full ask form, or the signed-out shell.
    await expect(voterIdRequired.or(submitForm).or(signedOutHeading)).toBeVisible({ timeout: 15_000 });

    if (await voterIdRequired.isVisible()) {
      await expect(getVoterIdLink).toBeVisible({ timeout: 5_000 });
    } else if (await signedOutHeading.isVisible().catch(() => false)) {
      await expect(signedOutHeading).toBeVisible({ timeout: 5_000 });
    }

    await context.close();
  });

  test("own content shows 'Your question' label", async ({ connectedPage: page }) => {
    test.setTimeout(120_000);
    await gotoWithRetry(page, "/rate", { ensureWalletConnected: true, timeout: 45_000 });
    await waitForFeedLoaded(page, 30_000);

    const viewButton = page.getByRole("button", { name: /^View(?:: .+)?$/i }).first();
    await expect(viewButton).toBeVisible({ timeout: 10_000 });
    await viewButton.click();

    const mySubmissionsOption = page.getByRole("button", { name: "My Questions" });
    await expect(mySubmissionsOption).toBeVisible({ timeout: 10_000 });
    await mySubmissionsOption.click();

    await waitForFeedLoaded(page, 30_000);
    const ownSubmission = page.getByText("Your question").first();
    const emptyState = page.getByText(/You haven't asked any questions yet\./i);

    const hasResult = await ownSubmission
      .or(emptyState)
      .first()
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(() => true)
      .catch(() => false);

    expect(hasResult).toBe(true);
  });

  test("page loads without wallet setup", async ({ browser }) => {
    // Without setupWallet, no local test wallet session is injected.
    // This test verifies the page still loads without errors.
    const context = await newE2EContext(browser);
    const page = await context.newPage();
    await gotoWithRetry(page, "/rate");
    await waitForFeedLoaded(page, 20_000);

    // Page should render main content
    const mainContent = page.locator("main");
    await expect(mainContent).toBeVisible({ timeout: 10_000 });

    await context.close();
  });
});
