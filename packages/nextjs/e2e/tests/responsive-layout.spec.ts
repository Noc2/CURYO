import { type Page, expect, test } from "../fixtures/wallet";
import { expectNoHorizontalOverflow, expectNoNextErrorOverlay } from "../helpers/layout";
import { findVoteableContent, gotoWithRetry, waitForFeedLoaded } from "../helpers/wait-helpers";

const VIEWPORTS = [
  { name: "small phone", width: 360, height: 640 },
  { name: "modern phone", width: 390, height: 844 },
  { name: "tablet portrait", width: 768, height: 1024 },
  { name: "tablet landscape", width: 1024, height: 768 },
  { name: "dense laptop", width: 1280, height: 800 },
  { name: "common laptop", width: 1366, height: 768 },
  { name: "desktop", width: 1440, height: 900 },
];

const ROUTES = ["/", "/vote", "/submit", "/governance", "/docs", "/legal"];
const VOTE_UP_BUTTON = /^Vote up\b/i;
const VOTE_DOWN_BUTTON = /^Vote down\b/i;

async function expectNavigationForViewport(page: Page, width: number): Promise<void> {
  const sidebar = page.locator("aside").first();
  const hamburger = page.getByLabel("Open menu").first();

  if (width >= 1280) {
    await expect(sidebar, "Desktop sidebar should be visible at xl widths").toBeVisible({ timeout: 5_000 });
    await expect(hamburger, "Mobile hamburger should be hidden at xl widths").toBeHidden({ timeout: 5_000 });
    return;
  }

  await expect(sidebar, "Desktop sidebar should be hidden below xl widths").toBeHidden({ timeout: 5_000 });
  await expect(hamburger, "Mobile hamburger should be visible below xl widths").toBeVisible({ timeout: 5_000 });
}

async function expectRouteControls(page: Page, path: string, width: number): Promise<void> {
  const main = page.locator("main");

  if (path === "/vote") {
    await waitForFeedLoaded(page, 30_000);
    await expectNavigationForViewport(page, width);
    await expect(
      page
        .getByRole("button", { name: VOTE_UP_BUTTON })
        .or(page.getByRole("button", { name: VOTE_DOWN_BUTTON }))
        .or(page.getByText(/No content submitted yet|No content found/i))
        .first(),
      "Vote route should keep its primary feed state visible",
    ).toBeVisible({ timeout: 15_000 });
    return;
  }

  if (path === "/submit") {
    const urlInput = main.getByPlaceholder(/paste/i).or(main.getByRole("textbox").first()).first();
    await expect(urlInput, "Submit URL input should stay visible").toBeVisible({ timeout: 15_000 });
    await urlInput.focus();
    await expect(urlInput).toBeFocused();
    return;
  }

  if (path === "/governance") {
    await expect(
      main
        .getByRole("button", { name: /Profile|Leaderboard|Governance|Voter ID/ })
        .or(main.getByText(/Voting performance|Staked cREP|Checking Voter ID/i))
        .first(),
      "Governance claim surface should stay visible",
    ).toBeVisible({ timeout: 15_000 });
    return;
  }

  if (path === "/docs") {
    await expect(main.getByRole("heading", { name: /^Introduction$/i }).first()).toBeVisible({ timeout: 15_000 });
    return;
  }

  if (path === "/legal") {
    await expect(main.getByRole("heading", { name: /^Legal$/i }).first()).toBeVisible({ timeout: 15_000 });
  }
}

test.describe("Responsive layout", () => {
  for (const viewport of VIEWPORTS) {
    test(`key routes stay usable without horizontal overflow at ${viewport.name}`, async ({ connectedPage: page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      for (const path of ROUTES) {
        await gotoWithRetry(page, path, { ensureWalletConnected: true, timeout: 45_000 });
        await expectNoNextErrorOverlay(page);

        const main = page.locator("main");
        await expect(main, `${path} should keep visible main content at ${viewport.name}`).toBeVisible({
          timeout: 15_000,
        });
        await expectRouteControls(page, path, viewport.width);
        await expectNoHorizontalOverflow(page, `${path} at ${viewport.name} (${viewport.width}x${viewport.height})`);
      }
    });
  }

  test("stake selector dialog fits inside a phone viewport", async ({ connectedPage: page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoWithRetry(page, "/vote", { ensureWalletConnected: true, timeout: 45_000 });
    await waitForFeedLoaded(page, 30_000);

    const canVote = await findVoteableContent(page);
    expect(canVote, "Should find at least one voteable content before checking dialog layout").toBeTruthy();

    await page.getByRole("button", { name: VOTE_UP_BUTTON }).click();

    const dialog = page.getByRole("dialog").first();
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    const box = await dialog.boundingBox();
    expect(box, "Stake selector dialog should have a layout box").not.toBeNull();
    if (!box) return;

    const viewport = page.viewportSize();
    expect(viewport, "Viewport should be available").not.toBeNull();
    if (!viewport) return;

    expect(box.x, "Dialog should not overflow left").toBeGreaterThanOrEqual(-1);
    expect(box.y, "Dialog should not overflow top").toBeGreaterThanOrEqual(-1);
    expect(box.x + box.width, "Dialog should not overflow right").toBeLessThanOrEqual(viewport.width + 1);
    expect(box.y + box.height, "Dialog should not overflow bottom").toBeLessThanOrEqual(viewport.height + 1);
    await expectNoHorizontalOverflow(page, "Stake selector dialog at phone width");

    await page.keyboard.press("Escape");
  });

  test("desktop vote side padding remains inside the feed scroll hit area", async ({ connectedPage: page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await gotoWithRetry(page, "/vote", { ensureWalletConnected: true, timeout: 45_000 });
    await waitForFeedLoaded(page, 30_000);

    const metrics = await page.evaluate(() => {
      const scroller = document.querySelector<HTMLElement>('[data-testid="vote-desktop-scroll-container"]');
      const frame = document.querySelector<HTMLElement>('[data-testid="vote-desktop-scroll-frame"]');
      const surface = document.querySelector<HTMLElement>('[data-testid="vote-feed-surface"]');

      if (!scroller || !frame) return null;
      if (!surface) return { hasSurface: false as const };

      scroller.scrollTop = 0;
      scroller.dispatchEvent(new Event("scroll"));

      const frameRect = frame.getBoundingClientRect();
      const surfaceRect = surface.getBoundingClientRect();
      const scrollerRect = scroller.getBoundingClientRect();
      const leftPadding = surfaceRect.left - frameRect.left;

      return {
        hasSurface: true as const,
        canScroll: scroller.scrollHeight > scroller.clientHeight + 48,
        leftPadding,
        wheelX: frameRect.left + leftPadding / 2,
        wheelY: Math.min(Math.max(surfaceRect.top + 48, scrollerRect.top + 48), scrollerRect.bottom - 48),
      };
    });

    expect(metrics, "Vote desktop feed should expose the scroll frame and surface").not.toBeNull();
    if (!metrics) return;

    if (!metrics.hasSurface) {
      test.skip(true, "Vote feed did not render a card surface to verify side padding");
      return;
    }

    expect(metrics.leftPadding, "Desktop feed should keep visible side padding around the card").toBeGreaterThanOrEqual(
      12,
    );

    test.skip(!metrics.canScroll, "Vote feed is not tall enough to verify wheel scrolling from the side padding");

    await page.mouse.move(metrics.wheelX, metrics.wheelY);
    await page.mouse.wheel(0, 420);

    await expect
      .poll(
        () =>
          page.evaluate(() => {
            return document.querySelector<HTMLElement>('[data-testid="vote-desktop-scroll-container"]')?.scrollTop ?? 0;
          }),
        { timeout: 3_000 },
      )
      .toBeGreaterThan(0);
  });
});
