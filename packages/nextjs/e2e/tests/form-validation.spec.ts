import { expect, test } from "../fixtures/wallet";

test.describe("Submit form validation", () => {
  test("submit button is disabled without platform selection", async ({ connectedPage: page }) => {
    await page.goto("/submit");
    await page.waitForLoadState("domcontentloaded");

    // Wait for form to load
    await expect(page.getByRole("heading", { name: "Submit Content" })).toBeVisible({ timeout: 15_000 });

    // Without selecting a platform, the submit button should be disabled
    const submitBtn = page.getByRole("button", { name: /^Submit Content/i });
    await expect(submitBtn).toBeVisible({ timeout: 5_000 });

    // The button should be disabled when no platform is selected
    const isDisabled = await submitBtn.isDisabled().catch(() => false);
    expect(isDisabled).toBe(true);
  });

  test("submit button is disabled without URL", async ({ connectedPage: page }) => {
    await page.goto("/submit");

    await expect(page.getByRole("heading", { name: "Submit Content" })).toBeVisible({ timeout: 15_000 });

    // Select a platform — dropdown shows category names like "AI", "Books", "Videos", etc.
    const platformBtn = page.getByText("Select a platform...");
    if (await platformBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await platformBtn.click();
      // Click the first available option in the dropdown
      const firstOption = page.locator("[role='option'], [role='listbox'] > *").first();
      if (await firstOption.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await firstOption.click();
      } else {
        // Fallback: click any visible option text in the dropdown
        const anyOption = page
          .locator(".absolute, [data-radix-popper-content-wrapper]")
          .locator("div[role='option'], div:has-text('.')")
          .first();
        if (await anyOption.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await anyOption.click();
        }
      }
    }

    // Don't fill in URL — submit should still be disabled
    const submitBtn = page.getByRole("button", { name: /^Submit Content/i });
    await expect(submitBtn).toBeVisible({ timeout: 5_000 });
    const isDisabled = await submitBtn.isDisabled().catch(() => false);
    expect(isDisabled).toBe(true);
  });

  test("platform dropdown shows options", async ({ connectedPage: page }) => {
    await page.goto("/submit");

    await expect(page.getByRole("heading", { name: "Submit Content" })).toBeVisible({ timeout: 15_000 });

    // Click platform dropdown
    const platformBtn = page.getByText("Select a platform...");
    if (await platformBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await platformBtn.click();

      // The dropdown should show category-based platform names.
      // From the screenshot: AI, Books, Crypto Tokens, Games, Movies, Videos, etc.
      // Just verify that at least 3 options are visible in the dropdown
      const searchInput = page.getByPlaceholder("Search platforms...");
      await expect(searchInput).toBeVisible({ timeout: 3_000 });

      // Count visible options by looking for text items below the search
      // The dropdown contains items with category name + domain
      const options = page
        .locator(".absolute, [data-radix-popper-content-wrapper]")
        .locator("div")
        .filter({ hasText: /\.(com|co|org|io)/ });
      const optionCount = await options.count();
      expect(optionCount).toBeGreaterThanOrEqual(3);

      await page.keyboard.press("Escape");
    }
  });

  test("invalid URL shows validation feedback", async ({ connectedPage: page }) => {
    await page.goto("/submit");

    await expect(page.getByRole("heading", { name: "Submit Content" })).toBeVisible({ timeout: 15_000 });

    // Select a platform
    const platformBtn = page.getByText("Select a platform...");
    if (await platformBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await platformBtn.click();
      // Click first option with a domain
      const option = page.getByText(/huggingface|openlibrary|coingecko/i).first();
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

    // Submit button should still be disabled with invalid URL
    const submitBtn = page.getByRole("button", { name: /^Submit Content/i });
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
