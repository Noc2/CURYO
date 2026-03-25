import { expect, test } from "../fixtures/wallet";
import { gotoWithRetry } from "../helpers/wait-helpers";

test.describe("Content submission", () => {
  test("submit page shows form when connected with VoterID", async ({ connectedPage: page }) => {
    await gotoWithRetry(page, "/submit");
    // Account #2 has a VoterID — the form should render with "Submit Content" heading
    await expect(page.getByRole("heading", { name: "Submit Content" })).toBeVisible({ timeout: 15_000 });
  });

  test("can fill out and submit content", async ({ connectedPage: page }) => {
    await gotoWithRetry(page, "/submit");

    // Wait for the form to appear (requires wallet + VoterID)
    await expect(page.getByRole("heading", { name: "Submit Content" })).toBeVisible({ timeout: 15_000 });

    // 1. Select platform — click the platform dropdown trigger
    // Categories load from Ponder (or RPC fallback). If neither is ready yet,
    // the page shows "No platforms available. Propose one!" instead of the dropdown.
    const platformBtn = page.getByText("Select a platform...");
    const noPlatforms = page.getByText("No platforms available");
    const platformOrEmpty = platformBtn.or(noPlatforms);
    await expect(platformOrEmpty).toBeVisible({ timeout: 10_000 });

    // Skip if categories haven't loaded (Ponder down + RPC not yet returned)
    const hasPlatforms = await platformBtn.isVisible().catch(() => false);
    test.skip(!hasPlatforms, "Categories not loaded — Ponder and RPC fallback both unavailable");

    await platformBtn.click();
    // Pick "YouTube" from the dropdown options
    const youtubeOption = page.getByText("YouTube").first();
    await youtubeOption.click();

    // 2. Enter a unique URL
    const uniqueId = Date.now();
    const urlInput = page.locator("input[type='url']").first();
    await expect(urlInput).toBeVisible({ timeout: 5_000 });
    await urlInput.fill(`https://www.youtube.com/watch?v=e2etest${uniqueId}`);

    // 3. Enter title/description
    const titleInput = page.getByPlaceholder("Add a short title for this content");
    await expect(titleInput).toBeVisible({ timeout: 3_000 });
    await titleInput.fill(`E2E Test Title ${uniqueId}`);

    const descInput = page.locator("textarea").first();
    await expect(descInput).toBeVisible({ timeout: 3_000 });
    await descInput.fill(`E2E Test Content ${uniqueId}`);

    // 4. Select at least one subcategory tag
    // Subcategory buttons appear below "Select Categories" after a platform is selected.
    // Use specific known YouTube subcategory names to avoid matching sidebar buttons.
    const tagLabel = page.getByText("Select Categories");
    await expect(tagLabel).toBeVisible({ timeout: 3_000 });
    // Try common YouTube subcategories in order — click the first visible one
    const subcatNames = ["Education", "Entertainment", "Music", "Technology", "Science", "Gaming"];
    for (const name of subcatNames) {
      // Scope to the form area to avoid matching sidebar/navigation buttons
      const btn = page.locator("form button", { hasText: new RegExp(`^${name}$`) });
      if (await btn.isVisible({ timeout: 1_000 }).catch(() => false)) {
        await btn.click();
        break;
      }
    }

    // 5. Click Submit Content
    const submitBtn = page.getByRole("button", { name: /^Submit Content/i });
    await expect(submitBtn).toBeEnabled({ timeout: 5_000 });
    await submitBtn.click();

    // 6. Wait for the submission share modal to confirm success
    const successDialog = page.getByRole("dialog", { name: /Content submitted/i });
    await expect(successDialog).toBeVisible({ timeout: 60_000 });
    await expect(successDialog.getByRole("heading", { name: /Content Submitted!/i })).toBeVisible();
  });
});
