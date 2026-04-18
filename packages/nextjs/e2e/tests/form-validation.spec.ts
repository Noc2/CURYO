import { expect, test, type Page } from "../fixtures/wallet";
import { continueToBountyStep, selectAskCategory, selectAskSubcategory } from "../helpers/ask-form";

async function fillRequiredQuestionFields(page: Page, contextUrl?: string): Promise<boolean> {
  const selectedCategory = await selectAskCategory(page);
  if (!selectedCategory) return false;

  const uniqueId = Date.now();
  await page.getByPlaceholder("Ask something subjective that voters can rate").fill(`Validation test ${uniqueId}`);
  await page.locator("textarea").first().fill(`Validation content ${uniqueId}`);

  const selectedSubcategory = await selectAskSubcategory(page);
  if (!selectedSubcategory) return false;

  if (contextUrl !== undefined) {
    await page.locator("input[type='url']").first().fill(contextUrl);
  }

  return true;
}

test.describe("Ask form validation", () => {
  test("ask shows a category validation error before asking", async ({ connectedPage: page }) => {
    await page.goto("/ask");
    await page.waitForLoadState("domcontentloaded");

    // Wait for form to load
    await expect(page.getByRole("heading", { name: "Ask Question" })).toBeVisible({ timeout: 15_000 });

    await continueToBountyStep(page);

    await expect(page.getByText("Select a category before asking.")).toBeVisible({ timeout: 5_000 });
  });

  test("ask shows a URL validation error before asking", async ({ connectedPage: page }) => {
    await page.goto("/ask");

    await expect(page.getByRole("heading", { name: "Ask Question" })).toBeVisible({ timeout: 15_000 });

    const formReady = await fillRequiredQuestionFields(page);
    test.skip(!formReady, "Categories not loaded for context URL validation");

    await continueToBountyStep(page);

    await expect(page.getByText("Add a context link before asking.")).toBeVisible({ timeout: 5_000 });
  });

  test("category dropdown shows options", async ({ connectedPage: page }) => {
    await page.goto("/ask");

    await expect(page.getByRole("heading", { name: "Ask Question" })).toBeVisible({ timeout: 15_000 });

    // Click category dropdown
    const form = page.locator("form").first();
    const categoryBtn = form.getByText("Select a category...");
    if (await categoryBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await categoryBtn.click();

      const searchInput = page.getByPlaceholder("Search categories...");
      await expect(searchInput).toBeVisible({ timeout: 3_000 });

      // Just verify that at least 3 category buttons are visible in the dropdown.
      const options = form
        .locator(".absolute")
        .locator("button")
        .filter({ hasText: /Products|Media|General|Apps/ });
      const optionCount = await options.count();
      expect(optionCount).toBeGreaterThanOrEqual(3);

      await page.keyboard.press("Escape");
    }
  });

  test("invalid URL shows validation feedback", async ({ connectedPage: page }) => {
    await page.goto("/ask");

    await expect(page.getByRole("heading", { name: "Ask Question" })).toBeVisible({ timeout: 15_000 });

    const formReady = await fillRequiredQuestionFields(page, "not-a-valid-url");
    test.skip(!formReady, "Categories not loaded for invalid URL validation");

    const urlInput = page.locator("input[type='url']").first();
    await urlInput.press("Tab");
    await continueToBountyStep(page);

    await expect(page.getByText(/Please enter a valid HTTPS URL/i)).toBeVisible({ timeout: 5_000 });
  });
});
