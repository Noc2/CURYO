import { expect, test } from "../fixtures/wallet";
import { findVoteableContent, gotoWithRetry, waitForFeedLoaded } from "../helpers/wait-helpers";

// Device profile comes from Playwright project config (iPhone / Android / tablet).
// No manual setViewportSize() needed — the project device descriptor handles
// viewport, UA, touch emulation, and browser engine.
const PHONE_PROJECTS = new Set(["mobile-phone", "mobile-android"]);

test.describe("Mobile viewport (phone)", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(!PHONE_PROJECTS.has(testInfo.project.name), "Phone-only tests");
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

  test("vote page mobile chrome collapses with feed scroll and reclaims space", async ({ connectedPage: page }) => {
    await page.goto("/vote");
    await waitForFeedLoaded(page);

    const mobileHeader = page.locator('[data-mobile-header="true"]');
    const voteTopChrome = page.locator('[data-vote-mobile-top-chrome="true"]');
    await expect(mobileHeader).toHaveAttribute("data-visible", "true");
    await expect(voteTopChrome).toHaveAttribute("data-visible", "true");

    const canScroll = await page.evaluate(() => {
      const explicitScrollSource = document.querySelector<HTMLElement>('[data-mobile-header-scroll-source="true"]');
      const scrollSource = explicitScrollSource ?? document.scrollingElement;
      if (!scrollSource) return false;
      return scrollSource.scrollHeight > scrollSource.clientHeight + 200;
    });
    expect(canScroll).toBe(true);

    const readLayout = () =>
      page.evaluate(() => {
        const explicitScrollSource = document.querySelector<HTMLElement>('[data-mobile-header-scroll-source="true"]');
        const topChrome = document.querySelector<HTMLElement>('[data-vote-mobile-top-chrome="true"]');
        const feedSurface = document.querySelector<HTMLElement>('[data-testid="vote-feed-surface"]');

        return {
          documentScrollTop: document.scrollingElement?.scrollTop ?? 0,
          feedSurfaceTop: feedSurface?.getBoundingClientRect().top ?? 0,
          topChromeHeight: topChrome?.getBoundingClientRect().height ?? 0,
          voteScrollTop: explicitScrollSource?.scrollTop ?? 0,
        };
      });

    const expandedLayout = await readLayout();

    await page.evaluate(() => {
      const explicitScrollSource = document.querySelector<HTMLElement>('[data-mobile-header-scroll-source="true"]');
      if (explicitScrollSource) {
        explicitScrollSource.scrollTop = 900;
        explicitScrollSource.dispatchEvent(new Event("scroll"));
        return;
      }

      window.scrollTo(0, 900);
    });
    await expect(mobileHeader).toHaveAttribute("data-visible", "false");
    await expect(voteTopChrome).toHaveAttribute("data-visible", "false");
    await page.waitForFunction(() => {
      const topChrome = document.querySelector<HTMLElement>('[data-vote-mobile-top-chrome="true"]');
      return topChrome !== null && topChrome.getBoundingClientRect().height < 4;
    });

    const collapsedLayout = await readLayout();
    expect(collapsedLayout.documentScrollTop).toBe(0);
    expect(collapsedLayout.feedSurfaceTop).toBeLessThan(expandedLayout.feedSurfaceTop - 24);
    expect(collapsedLayout.topChromeHeight).toBeLessThan(4);
    expect(collapsedLayout.voteScrollTop).toBeGreaterThan(0);

    await page.evaluate(() => {
      const explicitScrollSource = document.querySelector<HTMLElement>('[data-mobile-header-scroll-source="true"]');
      if (explicitScrollSource) {
        explicitScrollSource.scrollTop = 320;
        explicitScrollSource.dispatchEvent(new Event("scroll"));
        return;
      }

      window.scrollTo(0, 320);
    });
    await expect(mobileHeader).toHaveAttribute("data-visible", "true");
    await expect(voteTopChrome).toHaveAttribute("data-visible", "true");
    await page.waitForFunction(() => {
      const topChrome = document.querySelector<HTMLElement>('[data-vote-mobile-top-chrome="true"]');
      return topChrome !== null && topChrome.getBoundingClientRect().height > 24;
    });

    const restoredLayout = await readLayout();
    expect(restoredLayout.feedSurfaceTop).toBeGreaterThan(collapsedLayout.feedSurfaceTop + 24);
  });

  test("mobile header still hides on scroll down and returns on scroll up on landing", async ({ connectedPage: page }) => {
    await page.goto("/?landing=1");
    await expect(page.getByText(/Human Reputation at Stake/i)).toBeVisible({ timeout: 10_000 });

    const mobileHeader = page.locator('[data-mobile-header="true"]');
    await expect(mobileHeader).toHaveAttribute("data-visible", "true");

    const canScroll = await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight + 200);
    expect(canScroll).toBe(true);

    await page.evaluate(() => window.scrollTo(0, 900));
    await expect(mobileHeader).toHaveAttribute("data-visible", "false");

    await page.evaluate(() => window.scrollTo(0, 320));
    await expect(mobileHeader).toHaveAttribute("data-visible", "true");
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

  test("preview clicks keep the user on /vote and emphasize the mobile dock", async ({ connectedPage: page }) => {
    await gotoWithRetry(page, "/vote?q=go-ethereum", { ensureWalletConnected: true, timeout: 45_000 });
    await waitForFeedLoaded(page, 30_000);

    const activeSurface = page.locator('[aria-current="true"] [data-testid="vote-content-surface"]').first();
    await expect(activeSurface).toBeVisible({ timeout: 10_000 });

    const popupPromise = page.context().waitForEvent("page", { timeout: 1_000 }).catch(() => null);
    await activeSurface.click();

    const popup = await popupPromise;
    expect(popup).toBeNull();
    await expect(page).toHaveURL(/\/vote\?.*q=go-ethereum.*content=/, { timeout: 10_000 });
    await expect(page.locator('[data-vote-attention="true"]').first()).toBeVisible({ timeout: 5_000 });
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

  test("governance page renders", async ({ connectedPage: page }) => {
    await page.goto("/governance");

    const main = page.locator("main");
    await expect(main).toBeVisible({ timeout: 10_000 });

    const governanceContent = main
      .getByRole("button", { name: /Profile|Leaderboard|Governance|Voter ID/ })
      .or(main.getByText(/Voting performance|Staked cREP|Checking Voter ID/i));
    await expect(governanceContent.first()).toBeVisible({ timeout: 15_000 });
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

  test("sidebar hidden on tablet width (xl breakpoint)", async ({ connectedPage: page }) => {
    await page.goto("/vote");
    await waitForFeedLoaded(page);

    // Sidebar uses xl:flex (1280px+). iPad Mini (768px) is below xl, so sidebar is hidden
    // and the hamburger menu is used instead.
    const sidebar = page.locator("aside");
    await expect(sidebar).toBeHidden({ timeout: 5_000 });

    const hamburger = page.getByLabel("Open menu");
    await expect(hamburger).toBeVisible({ timeout: 5_000 });
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
    const pages = ["/vote", "/submit", "/governance", "/docs"];

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
