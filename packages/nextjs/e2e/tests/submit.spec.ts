import { expect, test } from "../fixtures/wallet";
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
    const categoryBtn = page.getByText("Select a category...");
    const noCategories = page.getByText("No categories available");
    const categoryOrEmpty = categoryBtn.or(noCategories);
    await expect(categoryOrEmpty).toBeVisible({ timeout: 10_000 });

    // Skip if categories haven't loaded (Ponder down + RPC not yet returned)
    const hasCategories = await categoryBtn.isVisible().catch(() => false);
    test.skip(!hasCategories, "Categories not loaded — Ponder and RPC fallback both unavailable");

    await categoryBtn.click();
    // Pick a seeded category from the dropdown options.
    const mediaOption = page.getByText("Media").first();
    await mediaOption.click();

    // 2. Enter a unique direct image URL
    const uniqueId = Date.now();
    const urlInput = page.locator("input[type='url']").first();
    await expect(urlInput).toBeVisible({ timeout: 5_000 });
    await urlInput.fill(`https://picsum.photos/seed/e2etest-${uniqueId}/1200/800.jpg`);

    // 3. Enter title/description
    const titleInput = page.getByPlaceholder("Ask something subjective that voters can rate");
    await expect(titleInput).toBeVisible({ timeout: 3_000 });
    await titleInput.fill(`E2E Test Title ${uniqueId}`);

    const descInput = page.locator("textarea").first();
    await expect(descInput).toBeVisible({ timeout: 3_000 });
    await descInput.fill(`E2E Test Content ${uniqueId}`);

    // 4. Select at least one subcategory tag
    // Subcategory buttons appear below "Select Categories" after a category is selected.
    // Use specific known Media subcategory names to avoid matching sidebar buttons.
    const tagLabel = page.getByText("Select Categories");
    await expect(tagLabel).toBeVisible({ timeout: 3_000 });
    // Try common Media subcategories in order — click the first visible one
    const subcatNames = ["Images", "YouTube", "Education", "Entertainment", "Photography", "Culture"];
    for (const name of subcatNames) {
      // Scope to the form area to avoid matching sidebar/navigation buttons
      const btn = page.locator("form button", { hasText: new RegExp(`^${name}$`) });
      if (await btn.isVisible({ timeout: 1_000 }).catch(() => false)) {
        await btn.click();
        break;
      }
    }

    // 5. Click Ask Question
    const submitBtn = page.getByRole("button", { name: /^Ask Question/i });
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
