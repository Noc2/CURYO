import { expect, test } from "../fixtures/wallet";
import { findVoteableContent, waitForFeedLoaded } from "../helpers/wait-helpers";

// Device profile comes from Playwright project config (iPhone 12 / iPad Mini).
// No manual setViewportSize() needed — the project device descriptor handles
// viewport, UA, touch emulation, and browser engine.

test.describe("Mobile viewport (phone)", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name === "mobile-tablet", "Phone-only tests");
  });

  test("sidebar hidden and hamburger visible", async ({ connectedPage: page }) => {
    await page.goto("/vote");
    await waitForFeedLoaded(page);

    const sidebar = page.locator("aside");
    await expect(sidebar).toBeHidden();

    const hamburger = page.getByLabel("Open menu");
    await expect(hamburger).toBeVisible({ timeout: 5_000 });
  });

  test("hamburger opens mobile menu with nav links", async ({ connectedPage: page }) => {
    await page.goto("/vote");
    await waitForFeedLoaded(page);

    await page.getByLabel("Open menu").click();

    const dropdown = page.locator(".dropdown-content");
    await expect(dropdown.getByRole("link", { name: /Discover/i })).toBeVisible({ timeout: 5_000 });
    await expect(dropdown.getByRole("link", { name: /Submit/i })).toBeVisible({ timeout: 3_000 });
    await expect(dropdown.getByRole("link", { name: /cREP/i })).toBeVisible({ timeout: 3_000 });
  });

  test("hamburger menu navigation works", async ({ connectedPage: page }) => {
    await page.goto("/vote");
    await waitForFeedLoaded(page);

    await page.getByLabel("Open menu").click();
    await page
      .locator(".dropdown-content")
      .getByRole("link", { name: /Submit/i })
      .waitFor({ state: "visible", timeout: 3_000 });
    await page
      .locator(".dropdown-content")
      .getByRole("link", { name: /Submit/i })
      .click();

    await expect(page).toHaveURL(/\/submit/, { timeout: 15_000 });
  });

  test("vote page loads and content visible without overflow", async ({ connectedPage: page }) => {
    await page.goto("/vote");
    await waitForFeedLoaded(page);

    const main = page.locator("main");
    await expect(main).toBeVisible({ timeout: 10_000 });

    const hasOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasOverflow).toBe(false);
  });

  test("StakeSelector dialog opens on mobile", async ({ connectedPage: page }) => {
    await page.goto("/vote");
    await waitForFeedLoaded(page);

    const canVote = await findVoteableContent(page);
    expect(canVote, "Should find at least one voteable content via thumbnail grid").toBeTruthy();

    await page.getByRole("button", { name: "Vote up" }).click();

    const dialog = page.locator("[role='dialog']").first();
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    const confirmBtn = dialog.getByRole("button", { name: /confirm|vote|stake/i });
    const hasConfirm = await confirmBtn
      .first()
      .isVisible({ timeout: 3_000 })
      .catch(() => false);
    expect(hasConfirm).toBe(true);

    await page.keyboard.press("Escape");
  });

  test("submit page form is usable", async ({ connectedPage: page }) => {
    await page.goto("/submit");

    const main = page.locator("main");
    await expect(main).toBeVisible({ timeout: 10_000 });

    // URL input should be visible and focusable
    const urlInput = page.getByPlaceholder(/paste/i).or(page.getByRole("textbox").first());
    await expect(urlInput.first()).toBeVisible({ timeout: 10_000 });

    // No horizontal overflow
    const hasOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasOverflow).toBe(false);
  });

  test("portfolio page renders", async ({ connectedPage: page }) => {
    await page.goto("/portfolio");

    const main = page.locator("main");
    await expect(main).toBeVisible({ timeout: 10_000 });

    // Portfolio should show tabs or content
    const portfolioContent = page
      .getByRole("tab")
      .first()
      .or(page.getByText(/portfolio/i).first())
      .or(page.getByText(/cREP/i).first());
    await expect(portfolioContent).toBeVisible({ timeout: 10_000 });
  });

  test("docs page renders without overflow", async ({ connectedPage: page }) => {
    await page.goto("/docs");

    const main = page.locator("main");
    await expect(main).toBeVisible({ timeout: 10_000 });

    const hasOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasOverflow).toBe(false);
  });
});

test.describe("Tablet viewport", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-tablet", "Tablet-only tests");
  });

  test("sidebar visible on tablet width", async ({ connectedPage: page }) => {
    await page.goto("/vote");
    await waitForFeedLoaded(page);

    // At 768px+ the sidebar should be visible (not hidden behind hamburger)
    const sidebar = page.locator("aside");
    await expect(sidebar).toBeVisible({ timeout: 5_000 });
  });

  test("vote page layout on tablet", async ({ connectedPage: page }) => {
    await page.goto("/vote");
    await waitForFeedLoaded(page);

    const main = page.locator("main");
    await expect(main).toBeVisible({ timeout: 10_000 });

    // Content card and thumbnail grid should both render
    const thumbnails = page.locator("[data-testid='content-thumbnail']");
    await expect(thumbnails.first()).toBeVisible({ timeout: 10_000 });
  });

  test("no horizontal overflow on key pages", async ({ connectedPage: page }) => {
    const pages = ["/vote", "/submit", "/portfolio", "/docs"];

    for (const path of pages) {
      await page.goto(path, { waitUntil: "domcontentloaded" });

      const main = page.locator("main");
      await expect(main).toBeVisible({ timeout: 10_000 });

      const hasOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });
      expect(hasOverflow, `Page ${path} should not have horizontal overflow on tablet`).toBe(false);
    }
  });
});
