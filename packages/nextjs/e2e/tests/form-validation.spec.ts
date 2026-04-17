import { expect, test } from "../fixtures/wallet";

test.describe("Ask form validation", () => {
  test("ask shows a category validation error before asking", async ({ connectedPage: page }) => {
    await page.goto("/ask");
    await page.waitForLoadState("domcontentloaded");

    // Wait for form to load
    await expect(page.getByRole("heading", { name: "Ask Question" })).toBeVisible({ timeout: 15_000 });

    const submitBtn = page.getByRole("button", { name: /^Ask Question/i });
    await expect(submitBtn).toBeVisible({ timeout: 5_000 });
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    await expect(page.getByText("Select a category before asking.")).toBeVisible({ timeout: 5_000 });
  });

  test("ask shows a URL validation error before asking", async ({ connectedPage: page }) => {
    await page.goto("/ask");

    await expect(page.getByRole("heading", { name: "Ask Question" })).toBeVisible({ timeout: 15_000 });

    // Select a category.
    const categoryBtn = page.getByText("Select a category...");
    if (await categoryBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await categoryBtn.click();
      await page.getByText("Media").first().click();
    }

    // Leave the URL blank and submit to trigger inline validation
    const submitBtn = page.getByRole("button", { name: /^Ask Question/i });
    await expect(submitBtn).toBeVisible({ timeout: 5_000 });
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    await expect(page.getByText("Add at least one image URL before asking.")).toBeVisible({ timeout: 5_000 });
  });

  test("category dropdown shows options", async ({ connectedPage: page }) => {
    await page.goto("/ask");

    await expect(page.getByRole("heading", { name: "Ask Question" })).toBeVisible({ timeout: 15_000 });

    // Click category dropdown
    const categoryBtn = page.getByText("Select a category...");
    if (await categoryBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await categoryBtn.click();

      const searchInput = page.getByPlaceholder("Search categories...");
      await expect(searchInput).toBeVisible({ timeout: 3_000 });

      // Just verify that at least 3 category buttons are visible in the dropdown.
      const options = page
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

    // Select a category.
    const categoryBtn = page.getByText("Select a category...");
    if (await categoryBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await categoryBtn.click();
      const option = page.getByText(/Media|General|Apps/i).first();
      if (await option.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await option.click();
      }
    }

    // Enter an invalid URL
    const urlInput = page.locator("input[type='url']").first();
    await expect(urlInput).toBeVisible({ timeout: 5_000 });
    await urlInput.fill("not-a-valid-url");

    // Tab away to trigger validation
    await urlInput.press("Tab");

    // Ask button should still be disabled with invalid URL
    const submitBtn = page.getByRole("button", { name: /^Ask Question/i });
    await expect(submitBtn).toBeVisible({ timeout: 5_000 });
    const isDisabled = await submitBtn.isDisabled().catch(() => false);
    // Either the button is disabled or there's a validation error visible
    const hasError = await page
      .getByText(/invalid|error|valid url/i)
      .isVisible({ timeout: 2_000 })
      .catch(() => false);
    expect(isDisabled || hasError).toBe(true);
  });
});
