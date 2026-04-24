import { expect, test } from "../fixtures/wallet";
import { continueToBountyStep, selectAskCategory, selectAskSubcategory, selectBountyRewardAsset } from "../helpers/ask-form";
import { gotoWithRetry } from "../helpers/wait-helpers";

test.describe("Ask page", () => {
  test("ask page shows form when connected with VoterID", async ({ connectedPage: page }) => {
    await gotoWithRetry(page, "/ask", { ensureWalletConnected: true });
    // Account #2 has a VoterID — the form should render with "Ask Question" heading.
    await expect(page.getByRole("heading", { name: "Ask Question" })).toBeVisible({ timeout: 15_000 });
  });

  test("can ask a question", async ({ connectedPage: page }) => {
    await gotoWithRetry(page, "/ask", { ensureWalletConnected: true });

    // Wait for the form to appear (requires wallet + VoterID)
    await expect(page.getByRole("heading", { name: "Ask Question" })).toBeVisible({ timeout: 15_000 });

    // 1. Select category — click the category dropdown trigger
    // Categories load from Ponder (or RPC fallback). If neither is ready yet,
    // the page shows the category empty state instead of the dropdown.
    const hasCategories = await selectAskCategory(page);
    test.skip(!hasCategories, "Categories not loaded — Ponder and RPC fallback both unavailable");

    // 2. Enter a unique direct image URL
    const uniqueId = Date.now();
    const urlInput = page.locator("input[type='url']").first();
    await expect(urlInput).toBeVisible({ timeout: 5_000 });
    await urlInput.fill(`https://picsum.photos/seed/e2etest-${uniqueId}/1200/800.jpg`);

    // 3. Enter title and description.
    const titleInput = page.getByPlaceholder("Ask something subjective that voters can rate");
    await expect(titleInput).toBeVisible({ timeout: 3_000 });
    await titleInput.fill(`E2E Test Title ${uniqueId}`);
    await page.getByPlaceholder("Add context voters should consider").fill(`E2E test description ${uniqueId}`);

    // 4. Select at least one subcategory tag
    const hasSubcategory = await selectAskSubcategory(page);
    test.skip(!hasSubcategory, "No seeded subcategory available for ask submission");

    // 5. Continue to bounty details, then ask
    await continueToBountyStep(page);
    await expect(page.getByRole("heading", { name: "Bounty" })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByPlaceholder("Ask something subjective that voters can rate")).toBeHidden();
    await selectBountyRewardAsset(page, "hrep");

    const submitBtn = page.getByRole("button", { name: /^Submit/i });
    await expect(submitBtn).toBeVisible({ timeout: 5_000 });
    await expect(submitBtn).toBeEnabled({ timeout: 5_000 });
    await submitBtn.click();

    // 6. Wait for the share modal to confirm success
    const successDialog = page.getByRole("dialog", { name: /Question asked/i });
    await expect(successDialog).toBeVisible({ timeout: 60_000 });
    await expect(successDialog.getByRole("heading", { name: /Question Asked!/i })).toBeVisible();
    await page.waitForTimeout(1_500);
    await expect(successDialog).toBeVisible();
  });
});
