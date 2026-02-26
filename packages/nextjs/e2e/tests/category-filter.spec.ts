import { expect, test } from "../fixtures/wallet";
import { waitForFeedLoaded } from "../helpers/wait-helpers";

test.describe("Category filter", () => {
  /**
   * Helper: find the first visible category pill that isn't "All".
   * Waits for the "All" button to appear, then finds sibling category buttons.
   * Returns { name, locator } or null if none found.
   */
  async function findVisibleCategoryPill(page: any) {
    // Wait for the "All" button to appear — this confirms the category bar is rendered
    const allButton = page.getByRole("button", { name: /^All$/i }).first();
    await allButton.waitFor({ state: "visible", timeout: 10_000 }).catch(() => null);

    // Known seeded categories — try each one
    const knownCategories = ["AI", "Books", "Crypto Tokens", "Games", "Movies", "Music"];
    for (const name of knownCategories) {
      const pill = page.getByRole("button", { name, exact: true }).first();
      const isVisible = await pill.isVisible().catch(() => false);
      if (isVisible) return { name, locator: pill };
    }

    // Fallback: find any button sibling of "All" that isn't "All" or "+N more"
    const pillContainer = allButton.locator("..");
    const pills = pillContainer.locator("> button");
    const count = await pills.count();
    for (let i = 0; i < count; i++) {
      const pill = pills.nth(i);
      const text = (await pill.textContent())?.trim() ?? "";
      if (!text || text === "All" || /^\+\d+ more/.test(text) || text.length < 2) continue;
      const isVisible = await pill.isVisible().catch(() => false);
      if (isVisible) return { name: text, locator: pill };
    }
    return null;
  }

  test("clicking category pill updates URL hash and filters feed", async ({ connectedPage: page }) => {
    await page.goto("/vote");
    await waitForFeedLoaded(page);

    // Find any visible category pill
    const pill = await findVisibleCategoryPill(page);
    expect(pill).toBeTruthy();

    await pill!.locator.click();
    const expectedHash = new RegExp(`#${pill!.name.toLowerCase().replace(/\s+/g, "-")}`, "i");
    await page.waitForURL(expectedHash, { timeout: 5_000 });

    await expect(page).toHaveURL(expectedHash);

    // Wait for feed to re-render after category change
    await page.waitForTimeout(1_000);

    // Feed should show content cards or empty state — not an error page
    const feedContent = page.getByRole("button", { name: /Vote up|Vote down/i });
    const emptyState = page.getByText(/No content found/i);
    const anyVisible = await feedContent
      .first()
      .or(emptyState)
      .waitFor({ state: "visible", timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
    expect(anyVisible).toBe(true);
  });

  test("clicking All clears URL hash", async ({ connectedPage: page }) => {
    // Start with a category hash
    await page.goto("/vote#youtube");
    await waitForFeedLoaded(page);

    // Click "All" pill
    const allPill = page.getByRole("button", { name: /^All$/i }).first();
    await expect(allPill).toBeVisible({ timeout: 10_000 });
    await allPill.click();
    await page.waitForFunction(() => !window.location.hash, { timeout: 5_000 });

    // Hash should be cleared
    const url = page.url();
    expect(url).not.toContain("#");
  });

  test("URL hash on load activates corresponding category", async ({ connectedPage: page }) => {
    // Find a visible category on the default page first
    await page.goto("/vote");
    await waitForFeedLoaded(page);

    const pill = await findVisibleCategoryPill(page);
    expect(pill).toBeTruthy();

    const hash = pill!.name.toLowerCase().replace(/\s+/g, "-");

    // Navigate with that hash
    await page.goto(`/vote#${hash}`);
    await waitForFeedLoaded(page);

    // The pill should have the active class
    const activePill = page.getByRole("button", { name: new RegExp(`^${pill!.name}$`, "i") }).first();
    await expect(activePill).toHaveClass(/pill-category/);
  });

  test("overflow dropdown opens with search", async ({ connectedPage: page }) => {
    await page.goto("/vote");
    await waitForFeedLoaded(page);

    // Narrow viewport to force category overflow
    await page.setViewportSize({ width: 800, height: 900 });
    await page.waitForTimeout(500);

    const moreButton = page.getByRole("button", { name: /^\+\d+ more$/i });
    const hasOverflow = await moreButton.isVisible({ timeout: 3_000 }).catch(() => false);
    test.skip(!hasOverflow, "All categories fit at 800px — no overflow");

    await moreButton.click();

    // Search input should appear with the correct aria-label
    const searchInput = page.getByRole("textbox", { name: "Search categories" });
    await expect(searchInput).toBeVisible({ timeout: 3_000 });

    // Scope to the dropdown container (absolute-positioned div with .menu inside)
    const dropdown = page.locator(".rounded-box .menu");
    await expect(dropdown).toBeVisible({ timeout: 3_000 });

    // Read a category that's actually in the overflow dropdown
    const overflowItems = dropdown.locator("button");
    const firstItem = overflowItems.first();
    const firstItemVisible = await firstItem.isVisible({ timeout: 2_000 }).catch(() => false);
    expect(firstItemVisible).toBe(true);

    const firstItemText = await firstItem.textContent();
    const trimmed = firstItemText?.trim();
    expect(trimmed).toBeTruthy();

    // Type part of the category name to filter
    const searchTerm = trimmed!.slice(0, 3).toLowerCase();
    await searchInput.fill(searchTerm);
    await page.waitForTimeout(500);

    // Should still show the matching category
    const matchingOption = dropdown.locator("button").filter({ hasText: trimmed! });
    const found = await matchingOption
      .first()
      .isVisible({ timeout: 3_000 })
      .catch(() => false);
    expect(found).toBe(true);
  });

  test("category filter shows content or empty state", async ({ connectedPage: page }) => {
    await page.goto("/vote");
    await waitForFeedLoaded(page);

    // Find any visible category pill
    const pill = await findVisibleCategoryPill(page);
    expect(pill).toBeTruthy();

    await pill!.locator.click();
    const expectedHash = new RegExp(`#${pill!.name.toLowerCase().replace(/\s+/g, "-")}`, "i");
    await page.waitForURL(expectedHash, { timeout: 5_000 });

    // Wait for feed to re-render after category change
    await page.waitForTimeout(1_000);

    // Should show content cards, vote buttons, loading state, or the empty state
    const thumbnailCards = page.locator(".grid button").filter({ has: page.locator("img") });
    const featuredCard = page.getByRole("button", { name: /Vote up|Vote down/i });
    const emptyState = page.getByText(/No content found/i);
    const sortDropdown = page.locator("select").first();

    const anyIndicator = featuredCard.first().or(thumbnailCards.first()).or(emptyState).or(sortDropdown);
    const anyVisible = await anyIndicator
      .first()
      .waitFor({ state: "visible", timeout: 10_000 })
      .then(() => true)
      .catch(() => false);

    expect(anyVisible).toBe(true);
  });
});
