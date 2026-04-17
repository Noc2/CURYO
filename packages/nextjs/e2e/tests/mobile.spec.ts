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
    await page.goto("/rate");
    await waitForFeedLoaded(page);

    const sidebar = page.locator("aside");
    await expect(sidebar).toBeHidden();

    const hamburger = page.getByLabel("Open menu");
    await expect(hamburger).toBeVisible({ timeout: 5_000 });
  });

  test("hamburger opens mobile menu with nav links", async ({ connectedPage: page }) => {
    await page.goto("/rate");
    await waitForFeedLoaded(page);

    await page.getByLabel("Open menu").click();

    const dropdown = page.locator(".dropdown-content");
    await expect(dropdown.getByRole("link", { name: /Rate/i })).toBeVisible({ timeout: 5_000 });
    await expect(dropdown.getByRole("link", { name: /Ask/i })).toBeVisible({ timeout: 3_000 });
    await expect(dropdown.getByRole("link", { name: /cREP/i })).toBeVisible({ timeout: 3_000 });
    const voteTopChrome = page.locator('[data-vote-mobile-top-chrome="true"]');
    await expect(voteTopChrome).toHaveAttribute("data-visible", "false");
    await expect(voteTopChrome).toHaveAttribute("inert", "");
  });

  test("vote page mobile chrome collapses with feed scroll and reclaims space", async ({ connectedPage: page }) => {
    await gotoWithRetry(page, "/rate", { ensureWalletConnected: true });
    await waitForFeedLoaded(page);

    const mobileHeader = page.locator('[data-mobile-header="true"]');
    const voteTopChrome = page.locator('[data-vote-mobile-top-chrome="true"]');
    const categoryButton = voteTopChrome.getByRole("button", { name: /^Category:/ }).first();
    const viewButton = voteTopChrome.getByRole("button", { name: /^View(?:$|:)/ }).first();
    await expect(mobileHeader).toHaveAttribute("data-visible", "true");
    await expect(voteTopChrome).toHaveAttribute("data-visible", "true");
    await expect(categoryButton).toBeVisible();
    await expect(viewButton).toBeVisible();

    const readCanScroll = () =>
      page.evaluate(() => {
        const explicitScrollSource = document.querySelector<HTMLElement>('[data-mobile-header-scroll-source="true"]');
        const scrollSource = explicitScrollSource ?? document.scrollingElement;
        if (!scrollSource) return false;
        return scrollSource.scrollHeight > scrollSource.clientHeight + 200;
      });
    await expect.poll(readCanScroll, { timeout: 15_000 }).toBe(true);

    const readLayout = () =>
      page.evaluate(() => {
        const explicitScrollSource = document.querySelector<HTMLElement>('[data-mobile-header-scroll-source="true"]');
        const topChrome = document.querySelector<HTMLElement>('[data-vote-mobile-top-chrome="true"]');
        const mobileHeader = document.querySelector<HTMLElement>('[data-mobile-header="true"]');
        const mobileHeaderNavbar = document.querySelector<HTMLElement>('[data-mobile-header-navbar="true"]');
        const feedSurface = document.querySelector<HTMLElement>('[data-testid="vote-feed-surface"]');
        const mobileScrollContainer = document.querySelector<HTMLElement>(
          '[data-testid="vote-mobile-scroll-container"]',
        );
        const activeArticle = document.querySelector<HTMLElement>('article[aria-current="true"]');
        const activeTitle = document.querySelector<HTMLElement>('article[aria-current="true"] h2');
        const activeContentCardShell = activeArticle?.querySelector<HTMLElement>(
          '[data-testid="vote-content-card-shell"]',
        );
        const activeContentHeader = activeArticle?.querySelector<HTMLElement>('[data-testid="vote-content-header"]');
        const activeMoreButton = activeArticle?.querySelector<HTMLElement>(
          'button[aria-label="Expand details"], button[aria-label="Collapse details"]',
        );
        const categoryButton = topChrome?.querySelector<HTMLElement>('button[aria-label^="Category:"]');
        const viewButton = topChrome?.querySelector<HTMLElement>(
          'button[aria-label="View"], button[aria-label^="View:"]',
        );

        const scrollerRect = explicitScrollSource?.getBoundingClientRect() ?? null;
        const mobileHeaderRect = mobileHeader?.getBoundingClientRect() ?? null;
        const mobileHeaderNavbarRect = mobileHeaderNavbar?.getBoundingClientRect() ?? null;
        const topChromeRect = topChrome?.getBoundingClientRect() ?? null;
        const mobileScrollContainerRect = mobileScrollContainer?.getBoundingClientRect() ?? null;
        const activeArticleRect = activeArticle?.getBoundingClientRect() ?? null;
        const activeTitleRect = activeTitle?.getBoundingClientRect() ?? null;
        const activeMoreButtonRect = activeMoreButton?.getBoundingClientRect() ?? null;
        const categoryButtonRect = categoryButton?.getBoundingClientRect() ?? null;
        const viewButtonRect = viewButton?.getBoundingClientRect() ?? null;
        const leftGutterWidth =
          activeArticleRect && mobileScrollContainerRect ? activeArticleRect.left - mobileScrollContainerRect.left : 0;
        const rightGutterWidth =
          activeArticleRect && mobileScrollContainerRect
            ? mobileScrollContainerRect.right - activeArticleRect.right
            : 0;

        return {
          activeMoreControlFits:
            !activeArticleRect || !activeMoreButtonRect
              ? true
              : activeMoreButtonRect.left >= activeArticleRect.left - 1 &&
                activeMoreButtonRect.right <= activeArticleRect.right + 1,
          activeMoreControlVisible:
            !activeMoreButtonRect || (activeMoreButtonRect.width > 0 && activeMoreButtonRect.height > 0),
          activeContentCardShellBackground: activeContentCardShell
            ? getComputedStyle(activeContentCardShell).backgroundColor
            : "",
          activeContentHeaderBackground: activeContentHeader
            ? getComputedStyle(activeContentHeader).backgroundColor
            : "",
          activeIndex: Number(activeArticle?.getAttribute("data-feed-card-index") ?? -1),
          activeTop: activeArticleRect?.top ?? 0,
          activeBottom: activeArticleRect?.bottom ?? 0,
          activeTitleBottom: activeTitleRect?.bottom ?? 0,
          activeTitleTop: activeTitleRect?.top ?? 0,
          categoryButtonHeight: categoryButtonRect?.height ?? 0,
          categoryButtonTop: categoryButtonRect?.top ?? 0,
          documentScrollTop: document.scrollingElement?.scrollTop ?? 0,
          feedSurfaceBackground: feedSurface ? getComputedStyle(feedSurface).backgroundColor : "",
          feedSurfacePaddingTop: feedSurface ? getComputedStyle(feedSurface).paddingTop : "",
          feedSurfaceTop: feedSurface?.getBoundingClientRect().top ?? 0,
          scrollContainerBackground: mobileScrollContainer
            ? getComputedStyle(mobileScrollContainer).backgroundColor
            : "",
          scrollWheelX: activeArticleRect
            ? activeArticleRect.left + Math.min(24, activeArticleRect.width / 2)
            : scrollerRect
              ? scrollerRect.left + 16
              : 0,
          scrollWheelY: scrollerRect
            ? Math.min(
                Math.max(scrollerRect.top + 80, 80),
                Math.min(scrollerRect.bottom - 80, window.innerHeight - 160),
              )
            : 0,
          leftGutterWidth,
          mobileHeaderBottom: mobileHeaderRect?.bottom ?? 0,
          mobileHeaderHeight: mobileHeaderRect?.height ?? 0,
          mobileHeaderNavbarBottom: mobileHeaderNavbarRect?.bottom ?? 0,
          rightGutterWidth,
          scrollerBottom: scrollerRect?.bottom ?? 0,
          scrollerTop: scrollerRect?.top ?? 0,
          topChromeBottom: topChromeRect?.bottom ?? 0,
          topChromeHeight: topChromeRect?.height ?? 0,
          topChromeTop: topChromeRect?.top ?? 0,
          viewButtonHeight: viewButtonRect?.height ?? 0,
          voteScrollTop: explicitScrollSource?.scrollTop ?? 0,
        };
      });
    const setFeedScrollTop = (targetScrollTop: number) =>
      page.evaluate(scrollTop => {
        const explicitScrollSource = document.querySelector<HTMLElement>('[data-mobile-header-scroll-source="true"]');
        if (!explicitScrollSource) {
          window.scrollTo(0, scrollTop);
          return;
        }

        const previousScrollBehavior = explicitScrollSource.style.scrollBehavior;
        explicitScrollSource.style.scrollBehavior = "auto";
        explicitScrollSource.scrollTop = scrollTop;
        explicitScrollSource.dispatchEvent(new Event("scroll", { bubbles: true }));
        explicitScrollSource.style.scrollBehavior = previousScrollBehavior;
      }, targetScrollTop);
    const browserSnapScrollOneCard = async (direction: "down" | "up") => {
      const scrollIntent = await page.evaluate(direction => {
        const explicitScrollSource = document.querySelector<HTMLElement>('[data-mobile-header-scroll-source="true"]');
        const activeArticle = document.querySelector<HTMLElement>('article[aria-current="true"]');
        if (!explicitScrollSource || !activeArticle) {
          throw new Error("Missing mobile feed scroller or active article");
        }

        const currentIndex = Number(activeArticle.getAttribute("data-feed-card-index") ?? -1);
        const targetIndex = currentIndex + (direction === "down" ? 1 : -1);
        const targetArticle = document.querySelector<HTMLElement>(`article[data-feed-card-index="${targetIndex}"]`);
        if (!targetArticle) {
          throw new Error(`Missing target article ${targetIndex}`);
        }

        const activeRect = activeArticle.getBoundingClientRect();
        const targetRect = targetArticle.getBoundingClientRect();

        return {
          currentIndex,
          targetIndex,
          deltaY: targetRect.top - activeRect.top + (direction === "down" ? 24 : -24),
        };
      }, direction);

      await page.evaluate(({ deltaY }) => {
        const explicitScrollSource = document.querySelector<HTMLElement>('[data-mobile-header-scroll-source="true"]');
        explicitScrollSource?.scrollBy({ top: deltaY, behavior: "smooth" });
      }, scrollIntent);
      await expect
        .poll(async () => (await readLayout()).activeIndex, { timeout: 3_000 })
        .toBe(scrollIntent.targetIndex);

      return scrollIntent;
    };
    const forceDocumentScrollLeak = (targetScrollTop: number) =>
      page.evaluate(scrollTop => {
        document.querySelector('[data-root-scroll-recovery-spacer="true"]')?.remove();

        const spacer = document.createElement("div");
        spacer.setAttribute("data-root-scroll-recovery-spacer", "true");
        spacer.setAttribute("aria-hidden", "true");
        spacer.style.height = "1200px";
        spacer.style.width = "1px";
        spacer.style.opacity = "0";
        spacer.style.pointerEvents = "none";
        document.body.appendChild(spacer);

        window.scrollTo(0, scrollTop);
        window.dispatchEvent(new Event("scroll"));
      }, targetScrollTop);
    const removeDocumentScrollLeakSpacer = () =>
      page.evaluate(() => {
        document.querySelector('[data-root-scroll-recovery-spacer="true"]')?.remove();
        window.scrollTo(0, 0);
      });
    const waitForMobileHeaderScrollSyncIdle = () =>
      page.waitForFunction(() => {
        const explicitScrollSource = document.querySelector<HTMLElement>('[data-mobile-header-scroll-source="true"]');
        return !explicitScrollSource?.hasAttribute("data-mobile-header-scroll-sync");
      });
    const startMobileChromeChangeCapture = () =>
      page.evaluate(() => {
        type ChromeChange = { target: "header" | "tabs"; visible: string; at: number };
        type ChromeCaptureWindow = Window & {
          __curyoMobileChromeChanges?: ChromeChange[];
          __curyoMobileChromeObservers?: MutationObserver[];
        };
        const captureWindow = window as ChromeCaptureWindow;
        captureWindow.__curyoMobileChromeObservers?.forEach(observer => observer.disconnect());
        captureWindow.__curyoMobileChromeChanges = [];

        const observeVisibility = (target: "header" | "tabs", node: HTMLElement | null) => {
          if (!node) return null;

          const observer = new MutationObserver(() => {
            captureWindow.__curyoMobileChromeChanges?.push({
              target,
              visible: node.getAttribute("data-visible") ?? "",
              at: Math.round(performance.now()),
            });
          });
          observer.observe(node, { attributeFilter: ["data-visible"] });
          return observer;
        };

        captureWindow.__curyoMobileChromeObservers = [
          observeVisibility("header", document.querySelector<HTMLElement>('[data-mobile-header="true"]')),
          observeVisibility("tabs", document.querySelector<HTMLElement>('[data-vote-mobile-top-chrome="true"]')),
        ].filter((observer): observer is MutationObserver => observer !== null);
      });
    const stopMobileChromeChangeCapture = () =>
      page.evaluate(() => {
        type ChromeChange = { target: "header" | "tabs"; visible: string; at: number };
        type ChromeCaptureWindow = Window & {
          __curyoMobileChromeChanges?: ChromeChange[];
          __curyoMobileChromeObservers?: MutationObserver[];
        };
        const captureWindow = window as ChromeCaptureWindow;
        const changes = captureWindow.__curyoMobileChromeChanges ?? [];
        captureWindow.__curyoMobileChromeObservers?.forEach(observer => observer.disconnect());
        captureWindow.__curyoMobileChromeObservers = [];
        captureWindow.__curyoMobileChromeChanges = [];
        return changes;
      });

    const initialLayout = await readLayout();
    expect(initialLayout.leftGutterWidth).toBeLessThanOrEqual(1);
    expect(initialLayout.rightGutterWidth).toBeLessThanOrEqual(1);
    expect(initialLayout.feedSurfaceBackground).toBe("rgb(0, 0, 0)");
    expect(initialLayout.feedSurfacePaddingTop).toBe("6px");
    expect(initialLayout.scrollContainerBackground).toBe("rgb(0, 0, 0)");
    expect(initialLayout.activeContentCardShellBackground).toBe("rgb(23, 22, 26)");
    expect(initialLayout.activeContentHeaderBackground).toBe("rgb(23, 22, 26)");
    expect(initialLayout.activeMoreControlVisible).toBe(true);
    expect(initialLayout.activeMoreControlFits).toBe(true);

    await page.evaluate(() => {
      const explicitScrollSource = document.querySelector<HTMLElement>('[data-mobile-header-scroll-source="true"]');
      if (explicitScrollSource) {
        explicitScrollSource.style.scrollSnapType = "none";
      }
    });
    const sameCardScrollStart = await readLayout();
    await startMobileChromeChangeCapture();
    await setFeedScrollTop(sameCardScrollStart.voteScrollTop + 96);
    await expect.poll(async () => (await readLayout()).activeIndex).toBe(sameCardScrollStart.activeIndex);
    await expect(mobileHeader).toHaveAttribute("data-visible", "false");
    await expect(voteTopChrome).toHaveAttribute("data-visible", "false");

    const sameCardCollapsedLayout = await readLayout();
    const sameCardChromeChanges = await stopMobileChromeChangeCapture();
    expect(sameCardCollapsedLayout.activeIndex).toBe(sameCardScrollStart.activeIndex);
    expect(sameCardCollapsedLayout.voteScrollTop).toBeGreaterThan(sameCardScrollStart.voteScrollTop);
    expect(sameCardChromeChanges.filter(change => change.target === "header").map(change => change.visible)).toEqual([
      "false",
    ]);
    expect(sameCardChromeChanges.filter(change => change.target === "tabs").map(change => change.visible)).toEqual([
      "false",
    ]);

    await page.evaluate(() => {
      const explicitScrollSource = document.querySelector<HTMLElement>('[data-mobile-header-scroll-source="true"]');
      if (explicitScrollSource) {
        explicitScrollSource.style.scrollSnapType = "";
      }
    });
    await setFeedScrollTop(0);
    await expect(mobileHeader).toHaveAttribute("data-visible", "true");
    await expect(voteTopChrome).toHaveAttribute("data-visible", "true");

    await page.evaluate(() => {
      const explicitScrollSource = document.querySelector<HTMLElement>('[data-mobile-header-scroll-source="true"]');
      explicitScrollSource?.scrollBy({ top: 900, behavior: "smooth" });
    });
    await expect.poll(async () => (await readLayout()).voteScrollTop).toBeGreaterThan(initialLayout.voteScrollTop);
    const afterScrollWheel = await readLayout();
    expect(afterScrollWheel.documentScrollTop).toBe(0);

    await setFeedScrollTop(0);
    await expect.poll(async () => (await readLayout()).activeIndex).toBe(0);
    await expect(mobileHeader).toHaveAttribute("data-visible", "true");
    await expect(voteTopChrome).toHaveAttribute("data-visible", "true");

    const beforeRootScrollLeak = await readLayout();
    expect(beforeRootScrollLeak.voteScrollTop).toBeLessThan(2);
    await forceDocumentScrollLeak(64);
    await expect.poll(async () => (await readLayout()).documentScrollTop).toBe(0);
    await expect.poll(async () => (await readLayout()).voteScrollTop).toBeGreaterThan(48);

    const afterRootScrollLeak = await readLayout();
    expect(afterRootScrollLeak.topChromeTop).toBeGreaterThanOrEqual(afterRootScrollLeak.mobileHeaderNavbarBottom - 1);
    expect(afterRootScrollLeak.topChromeBottom).toBeLessThanOrEqual(afterRootScrollLeak.mobileHeaderBottom + 1);
    await removeDocumentScrollLeakSpacer();
    await setFeedScrollTop(0);
    await expect(mobileHeader).toHaveAttribute("data-visible", "true");
    await expect(voteTopChrome).toHaveAttribute("data-visible", "true");

    const expandedLayout = await readLayout();
    expect(expandedLayout.topChromeTop).toBeGreaterThanOrEqual(expandedLayout.mobileHeaderNavbarBottom - 1);
    expect(expandedLayout.topChromeBottom).toBeLessThanOrEqual(expandedLayout.mobileHeaderBottom + 1);
    expect(expandedLayout.activeTitleTop).toBeGreaterThanOrEqual(expandedLayout.mobileHeaderBottom - 1);
    await waitForMobileHeaderScrollSyncIdle();

    const beforeFirstNativeScroll = await readLayout();
    await startMobileChromeChangeCapture();
    await browserSnapScrollOneCard("down");
    await expect(mobileHeader).toHaveAttribute("data-visible", "false");
    await expect(voteTopChrome).toHaveAttribute("data-visible", "false");
    await page.waitForFunction(() => {
      const mobileHeader = document.querySelector<HTMLElement>('[data-mobile-header="true"]');
      return mobileHeader !== null && mobileHeader.getBoundingClientRect().height < 4;
    });

    const collapsedLayout = await readLayout();
    const collapseChromeChanges = await stopMobileChromeChangeCapture();
    expect(collapseChromeChanges.filter(change => change.target === "header").map(change => change.visible)).toEqual([
      "false",
    ]);
    expect(collapseChromeChanges.filter(change => change.target === "tabs").map(change => change.visible)).toEqual([
      "false",
    ]);
    expect(collapsedLayout.documentScrollTop).toBe(0);
    expect(collapsedLayout.activeIndex).toBe(beforeFirstNativeScroll.activeIndex + 1);
    expect(collapsedLayout.feedSurfaceTop).toBeLessThan(expandedLayout.feedSurfaceTop - 24);
    expect(collapsedLayout.mobileHeaderHeight).toBeLessThan(4);
    expect(collapsedLayout.voteScrollTop).toBeGreaterThan(0);
    expect(collapsedLayout.voteScrollTop).toBeGreaterThan(beforeFirstNativeScroll.voteScrollTop);
    expect(Math.abs(collapsedLayout.activeTop - collapsedLayout.scrollerTop - 12)).toBeLessThanOrEqual(18);
    expect(collapsedLayout.activeTitleTop).toBeGreaterThanOrEqual(collapsedLayout.scrollerTop - 1);
    expect(collapsedLayout.activeTitleBottom).toBeLessThanOrEqual(collapsedLayout.scrollerBottom + 1);

    const beforeNativeScrollUp = await readLayout();
    await startMobileChromeChangeCapture();
    await browserSnapScrollOneCard("up");
    await expect(mobileHeader).toHaveAttribute("data-visible", "true");
    await expect(voteTopChrome).toHaveAttribute("data-visible", "true");
    await expect(categoryButton).toBeVisible();
    await expect(viewButton).toBeVisible();
    await page.waitForFunction(() => {
      const topChrome = document.querySelector<HTMLElement>('[data-vote-mobile-top-chrome="true"]');
      return topChrome !== null && topChrome.getBoundingClientRect().height > 24;
    });

    const restoredLayout = await readLayout();
    const restoreChromeChanges = await stopMobileChromeChangeCapture();
    expect(restoreChromeChanges.filter(change => change.target === "header").map(change => change.visible)).toEqual([
      "true",
    ]);
    expect(restoreChromeChanges.filter(change => change.target === "tabs").map(change => change.visible)).toEqual([
      "true",
    ]);
    expect(restoredLayout.activeIndex).toBe(beforeNativeScrollUp.activeIndex - 1);
    expect(restoredLayout.feedSurfaceTop).toBeGreaterThan(collapsedLayout.feedSurfaceTop + 24);
    expect(restoredLayout.topChromeTop).toBeGreaterThanOrEqual(restoredLayout.mobileHeaderNavbarBottom - 1);
    expect(restoredLayout.topChromeBottom).toBeLessThanOrEqual(restoredLayout.mobileHeaderBottom + 1);
    expect(restoredLayout.categoryButtonTop).toBeGreaterThanOrEqual(restoredLayout.mobileHeaderNavbarBottom - 1);
    expect(restoredLayout.categoryButtonHeight).toBeGreaterThan(20);
    expect(restoredLayout.viewButtonHeight).toBeGreaterThan(20);
    expect(restoredLayout.activeTitleTop).toBeGreaterThanOrEqual(restoredLayout.mobileHeaderBottom - 1);
    expect(restoredLayout.activeTitleTop).toBeGreaterThanOrEqual(restoredLayout.scrollerTop - 1);
    expect(restoredLayout.activeTitleBottom).toBeLessThanOrEqual(restoredLayout.scrollerBottom + 1);
  });

  test("last category card snaps above the mobile dock and shows context", async ({ connectedPage: page }) => {
    await gotoWithRetry(page, "/rate#media", { ensureWalletConnected: true });
    await waitForFeedLoaded(page);

    await expect(page.getByRole("button", { name: /^Category: Media$/ }).first()).toBeVisible({
      timeout: 10_000,
    });

    const lastIndex = await page.evaluate(() => {
      const articles = Array.from(document.querySelectorAll<HTMLElement>("article[data-feed-card-index]"));
      if (articles.length < 2) {
        throw new Error("Expected multiple Media cards in the mobile feed");
      }

      return Number(articles.at(-1)?.getAttribute("data-feed-card-index") ?? -1);
    });

    await page.evaluate(() => {
      const explicitScrollSource = document.querySelector<HTMLElement>('[data-mobile-header-scroll-source="true"]');
      if (!explicitScrollSource) {
        throw new Error("Missing mobile feed scroller");
      }

      const previousScrollBehavior = explicitScrollSource.style.scrollBehavior;
      explicitScrollSource.style.scrollBehavior = "auto";
      explicitScrollSource.scrollTop = explicitScrollSource.scrollHeight;
      explicitScrollSource.dispatchEvent(new Event("scroll", { bubbles: true }));
      explicitScrollSource.style.scrollBehavior = previousScrollBehavior;
    });

    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const activeArticle = document.querySelector<HTMLElement>('article[aria-current="true"]');
            return Number(activeArticle?.getAttribute("data-feed-card-index") ?? -1);
          }),
        { timeout: 3_000 },
      )
      .toBe(lastIndex);

    const activeContextLink = page.locator('article[aria-current="true"] [data-testid="content-source-link"]').first();
    await expect(activeContextLink).toBeVisible({ timeout: 5_000 });

    const layout = await activeContextLink.evaluate(link => {
      const scroller = document.querySelector<HTMLElement>('[data-mobile-header-scroll-source="true"]');
      const activeArticle = document.querySelector<HTMLElement>('article[aria-current="true"]');
      const mobileDock = document.querySelector<HTMLElement>('[data-testid="vote-mobile-dock"]');

      if (!scroller || !activeArticle || !mobileDock) {
        throw new Error("Missing mobile feed layout elements");
      }

      const scrollerRect = scroller.getBoundingClientRect();
      const activeArticleRect = activeArticle.getBoundingClientRect();
      const linkRect = link.getBoundingClientRect();
      const dockRect = mobileDock.getBoundingClientRect();
      const topElement = document.elementFromPoint(
        linkRect.left + linkRect.width / 2,
        linkRect.top + linkRect.height / 2,
      );

      return {
        activeContextBottom: linkRect.bottom,
        activeContextCenterTopmost: topElement === link || link.contains(topElement),
        activeTop: activeArticleRect.top,
        dockTop: dockRect.top,
        scrollerTop: scrollerRect.top,
      };
    });

    expect(Math.abs(layout.activeTop - layout.scrollerTop - 12)).toBeLessThanOrEqual(24);
    expect(layout.activeContextBottom).toBeLessThanOrEqual(layout.dockTop - 1);
    expect(layout.activeContextCenterTopmost).toBe(true);
  });

  test("mobile voting dock keeps rating orb raised above equal action circles", async ({ connectedPage: page }) => {
    await gotoWithRetry(page, "/rate", { ensureWalletConnected: true });
    await waitForFeedLoaded(page);

    const canVote = await findVoteableContent(page);
    expect(canVote, "Should find at least one voteable content with dock vote controls").toBeTruthy();

    const dock = page.locator('[data-testid="vote-mobile-dock"]');
    await expect(dock).toBeVisible({ timeout: 5_000 });

    const layout = await dock.evaluate(node => {
      const dockElement = node as HTMLElement;
      const ratingOrb = dockElement.querySelector<HTMLElement>(
        '[data-mobile-dock-rating-orb="true"] [role="img"][aria-label^="Community rating"]',
      );
      const shell = dockElement.querySelector<HTMLElement>('[data-mobile-dock-shell="true"]');
      const actionControls = [
        dockElement.querySelector<HTMLElement>('[aria-label^="Bounty:"]'),
        dockElement.querySelector<HTMLElement>('button[aria-label="Vote up and raise the score"]'),
        dockElement.querySelector<HTMLElement>('button[aria-label="Vote down and lower the score"]'),
        dockElement.querySelector<HTMLElement>(
          'button[aria-label="Expand details"], button[aria-label="Collapse details"]',
        ),
      ];

      if (!ratingOrb || !shell || actionControls.some(control => !control)) {
        throw new Error("Missing mobile dock rating orb, shell, or action controls");
      }

      const toRect = (element: HTMLElement) => {
        const rect = element.getBoundingClientRect();
        return {
          bottom: rect.bottom,
          height: rect.height,
          left: rect.left,
          right: rect.right,
          top: rect.top,
          width: rect.width,
        };
      };
      const dockRect = toRect(dockElement);
      const ratingRect = toRect(ratingOrb);
      const controlRects = actionControls.map(control => toRect(control as HTMLElement));
      const shellStyle = getComputedStyle(shell);

      return {
        controlRects,
        dockCenterX: dockRect.left + dockRect.width / 2,
        maskImage: shellStyle.maskImage,
        ratingRect,
        webkitMaskImage: shellStyle.getPropertyValue("-webkit-mask-image"),
      };
    });

    const firstControl = layout.controlRects[0];
    for (const control of layout.controlRects.slice(1)) {
      expect(Math.abs(control.width - firstControl.width)).toBeLessThanOrEqual(1);
      expect(Math.abs(control.height - firstControl.height)).toBeLessThanOrEqual(1);
      expect(Math.abs(control.top - firstControl.top)).toBeLessThanOrEqual(1);
    }

    const highestControlTop = Math.min(...layout.controlRects.map(rect => rect.top));
    expect(layout.ratingRect.width).toBeGreaterThan(firstControl.width + 30);
    expect(layout.ratingRect.height).toBeGreaterThan(firstControl.height + 30);
    expect(layout.ratingRect.top).toBeLessThan(highestControlTop - 8);
    expect(Math.abs(layout.ratingRect.left + layout.ratingRect.width / 2 - layout.dockCenterX)).toBeLessThanOrEqual(2);
    expect(`${layout.maskImage} ${layout.webkitMaskImage}`).toContain("radial-gradient");
  });

  test("category switches keep the mobile feed controls visible", async ({ connectedPage: page }) => {
    await gotoWithRetry(page, "/rate#products", { ensureWalletConnected: true });
    await waitForFeedLoaded(page);

    const voteTopChrome = page.locator('[data-vote-mobile-top-chrome="true"]');
    const mobileHeader = page.locator('[data-mobile-header="true"]');
    const readHeaderTabsLayout = () =>
      page.evaluate(() => {
        const mobileHeader = document.querySelector<HTMLElement>('[data-mobile-header="true"]');
        const mobileHeaderNavbar = document.querySelector<HTMLElement>('[data-mobile-header-navbar="true"]');
        const topChrome = document.querySelector<HTMLElement>('[data-vote-mobile-top-chrome="true"]');
        const activeTitle = document.querySelector<HTMLElement>('article[aria-current="true"] h2');
        const mobileHeaderRect = mobileHeader?.getBoundingClientRect() ?? null;
        const mobileHeaderNavbarRect = mobileHeaderNavbar?.getBoundingClientRect() ?? null;
        const topChromeRect = topChrome?.getBoundingClientRect() ?? null;
        const activeTitleRect = activeTitle?.getBoundingClientRect() ?? null;

        return {
          activeTitleTop: activeTitleRect?.top ?? 0,
          documentScrollTop: document.scrollingElement?.scrollTop ?? 0,
          mobileHeaderBottom: mobileHeaderRect?.bottom ?? 0,
          mobileHeaderNavbarBottom: mobileHeaderNavbarRect?.bottom ?? 0,
          topChromeBottom: topChromeRect?.bottom ?? 0,
          topChromeTop: topChromeRect?.top ?? 0,
        };
      });
    const expectHeaderTabsStable = async () => {
      await expect(mobileHeader).toHaveAttribute("data-visible", "true");
      await expect(voteTopChrome).toHaveAttribute("data-visible", "true");
      await expect
        .poll(async () => {
          const layout = await readHeaderTabsLayout();
          return (
            layout.documentScrollTop === 0 &&
            layout.topChromeTop >= layout.mobileHeaderNavbarBottom - 1 &&
            layout.topChromeBottom <= layout.mobileHeaderBottom + 1 &&
            layout.activeTitleTop >= layout.mobileHeaderBottom - 1
          );
        })
        .toBe(true);
    };

    await expect(voteTopChrome).toHaveAttribute("data-visible", "true");

    const categoryButton = voteTopChrome.getByRole("button", { name: /^Category: Products$/ }).first();
    await expect(categoryButton).toBeVisible({ timeout: 10_000 });
    await expectHeaderTabsStable();

    await categoryButton.click();
    const categoryDialog = page.getByRole("dialog", { name: "Category options" });
    await expect(categoryDialog).toBeVisible({ timeout: 5_000 });
    await categoryDialog.getByRole("button", { name: "Media" }).click();

    await expect(page).toHaveURL(/#media$/, { timeout: 5_000 });
    await expectHeaderTabsStable();
    await expect(voteTopChrome.getByRole("button", { name: /^Category: Media$/ }).first()).toBeVisible({
      timeout: 5_000,
    });
    const viewButton = voteTopChrome.getByRole("button", { name: /^View(?:$|:)/ }).first();
    await expect(viewButton).toBeVisible();

    await viewButton.click();
    const viewDialog = page.getByRole("dialog", { name: "View options" });
    await expect(viewDialog).toBeVisible({ timeout: 5_000 });
    await viewDialog.getByRole("button", { name: "Latest" }).click();

    await expect(voteTopChrome.getByRole("button", { name: /^View: Latest$/ }).first()).toBeVisible({
      timeout: 5_000,
    });
    await expectHeaderTabsStable();
  });

  test("mobile header still hides on scroll down and returns on scroll up on landing", async ({
    connectedPage: page,
  }) => {
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
    await page.goto("/rate");
    await waitForFeedLoaded(page);

    await page.getByLabel("Open menu").click();
    await page
      .locator(".dropdown-content")
      .getByRole("link", { name: /Ask/i })
      .waitFor({ state: "visible", timeout: 3_000 });
    await page.locator(".dropdown-content").getByRole("link", { name: /Ask/i }).click();

    await expect(page).toHaveURL(/\/ask/, { timeout: 15_000 });
  });

  test("vote page loads and content visible without overflow", async ({ connectedPage: page }) => {
    await page.goto("/rate");
    await waitForFeedLoaded(page);

    const main = page.locator("main");
    await expect(main).toBeVisible({ timeout: 10_000 });

    const hasOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasOverflow).toBe(false);
  });

  test("view filter sheet opens above the vote feed", async ({ connectedPage: page }) => {
    await page.goto("/rate");
    await waitForFeedLoaded(page);

    const viewButton = page.getByRole("button", { name: /^View$/i }).first();
    await expect(viewButton).toBeVisible({ timeout: 10_000 });
    await viewButton.click();

    const dialog = page.getByRole("dialog", { name: "View options" });
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    const isDialogTopmost = await dialog.evaluate(node => {
      const rect = node.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = Math.min(rect.bottom - 24, rect.top + rect.height / 2);
      const topElement = document.elementFromPoint(x, y);

      return topElement === node || node.contains(topElement);
    });

    expect(isDialogTopmost).toBe(true);

    await dialog.getByRole("button", { name: "Close feed options" }).click();
    await expect(dialog).toBeHidden();
  });

  test("StakeSelector dialog opens on mobile", async ({ connectedPage: page }) => {
    await page.goto("/rate");
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

  test("preview clicks keep the user on /rate and emphasize the mobile dock", async ({ connectedPage: page }) => {
    await gotoWithRetry(page, "/rate?q=workspace", { ensureWalletConnected: true, timeout: 45_000 });
    await waitForFeedLoaded(page, 30_000);

    const activeSurface = page.locator('[aria-current="true"] [data-testid="vote-content-surface"]').first();
    await expect(activeSurface).toBeVisible({ timeout: 10_000 });

    const popupPromise = page
      .context()
      .waitForEvent("page", { timeout: 1_000 })
      .catch(() => null);
    await activeSurface.click();

    const popup = await popupPromise;
    expect(popup).toBeNull();
    await expect(page).toHaveURL(/\/rate\?.*q=workspace.*content=/, { timeout: 10_000 });
    await expect(page.locator('[data-vote-attention="true"]').first()).toBeVisible({ timeout: 5_000 });
  });

  test("ask page form is usable", async ({ connectedPage: page }) => {
    await page.goto("/ask");

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
    await page.goto("/rate");
    await waitForFeedLoaded(page);

    // Sidebar uses xl:flex (1280px+). iPad Mini (768px) is below xl, so sidebar is hidden
    // and the hamburger menu is used instead.
    const sidebar = page.locator("aside");
    await expect(sidebar).toBeHidden({ timeout: 5_000 });

    const hamburger = page.getByLabel("Open menu");
    await expect(hamburger).toBeVisible({ timeout: 5_000 });
  });

  test("vote page layout on tablet", async ({ connectedPage: page }) => {
    await page.goto("/rate");
    await waitForFeedLoaded(page);

    const main = page.locator("main");
    await expect(main).toBeVisible({ timeout: 10_000 });

    // Content card and thumbnail grid should both render
    const thumbnails = page.locator("[data-testid='content-thumbnail']");
    await expect(thumbnails.first()).toBeVisible({ timeout: 10_000 });
  });

  test("collapsing vote chrome does not aria-hide a focused pill", async ({ connectedPage: page }) => {
    const blockedAriaHiddenMessages: string[] = [];
    page.on("console", message => {
      const text = message.text();
      if (text.includes("Blocked aria-hidden")) {
        blockedAriaHiddenMessages.push(text);
      }
    });

    await page.goto("/rate");
    await waitForFeedLoaded(page);

    const voteTopChrome = page.locator('[data-vote-mobile-top-chrome="true"]');
    await expect(voteTopChrome).toHaveAttribute("data-visible", "true");

    const focusedPill = voteTopChrome.getByRole("button").first();
    await focusedPill.focus();
    await expect(focusedPill).toBeFocused();
    await expect(voteTopChrome).not.toHaveAttribute("inert");

    await page.evaluate(
      async ({ targetScrollTop, stepSize }) => {
        const explicitScrollSource = document.querySelector<HTMLElement>('[data-mobile-header-scroll-source="true"]');
        if (!explicitScrollSource) {
          window.scrollTo(0, targetScrollTop);
          return;
        }

        const previousScrollBehavior = explicitScrollSource.style.scrollBehavior;
        const direction = targetScrollTop >= explicitScrollSource.scrollTop ? 1 : -1;
        const step = Math.max(1, Math.abs(stepSize));
        let remainingSteps = 400;

        explicitScrollSource.style.scrollBehavior = "auto";

        while (remainingSteps > 0 && Math.abs(targetScrollTop - explicitScrollSource.scrollTop) > 0.5) {
          explicitScrollSource.scrollTop =
            direction > 0
              ? Math.min(explicitScrollSource.scrollTop + step, targetScrollTop)
              : Math.max(explicitScrollSource.scrollTop - step, targetScrollTop);
          explicitScrollSource.dispatchEvent(new Event("scroll", { bubbles: true }));
          remainingSteps -= 1;

          await new Promise<void>(resolve => {
            window.requestAnimationFrame(() => resolve());
          });
        }

        explicitScrollSource.style.scrollBehavior = previousScrollBehavior;
      },
      { targetScrollTop: 900, stepSize: 8 },
    );

    await expect(voteTopChrome).toHaveAttribute("data-visible", "false");
    await expect(voteTopChrome).toHaveAttribute("inert", "");
    await expect(voteTopChrome).not.toHaveAttribute("aria-hidden");

    const collapsedChromeStillHasFocus = await page.evaluate(() => {
      const topChrome = document.querySelector<HTMLElement>('[data-vote-mobile-top-chrome="true"]');
      return topChrome?.contains(document.activeElement) ?? false;
    });
    expect(collapsedChromeStillHasFocus).toBe(false);
    expect(blockedAriaHiddenMessages).toEqual([]);
  });

  test("no horizontal overflow on key pages", async ({ connectedPage: page }) => {
    const pages = ["/rate", "/ask", "/governance", "/docs"];

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
