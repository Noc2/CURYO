"use client";

import { type RefObject, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { QuestionReferenceContentSummary } from "~~/components/content/QuestionDescription";
import { FeedVoteCard } from "~~/components/vote/VoteFeedCards";
import { useMobileHeaderVisibility } from "~~/contexts/MobileHeaderVisibilityContext";
import type { ContentItem } from "~~/hooks/useContentFeed";
import type { SubmitterProfile } from "~~/hooks/useSubmitterProfiles";
import { resolveEndSpacerHeightForLastCardSnap } from "~~/lib/ui/feedScrollSpacer";

interface VoteFeedStageProps {
  displayFeed: ContentItem[];
  sessionKey?: string;
  activeSourceIndex: number;
  loadedCount: number;
  mobileDockReservedSpace?: number | null;
  mobileTopChromeHeight?: number;
  mobileTopChromeVisible?: boolean;
  canLoadMore: boolean;
  enrichedProfiles: Record<string, SubmitterProfile>;
  watchedContentIds: Set<string>;
  followedWallets: Set<string>;
  normalizedAddress?: string;
  referencedContentById?: ReadonlyMap<string, QuestionReferenceContentSummary>;
  isCommitting: boolean;
  isMetadataPrefetchPending: boolean;
  navigationLocked: boolean;
  isWatchPending: (contentId: bigint) => boolean;
  isFollowPending: (address: string) => boolean;
  scrollContainerRef?: RefObject<HTMLDivElement | null>;
  onLoadMore: () => void;
  onTrackActiveIndex: (targetIndex: number) => boolean;
  onSelectByIndex: (targetIndex: number) => boolean;
  onContentIntent: (item: ContentItem) => void;
  onOpenFeedback?: (item: ContentItem) => void;
  onSourceOpen: (item: ContentItem) => void;
  onToggleWatch: (contentId: bigint) => void;
  onToggleFollow: (address: string) => void;
}

const DESKTOP_STEP_MEDIA_QUERY = "(min-width: 1280px)";
const MOBILE_STAGE_MEDIA_QUERY = "(max-width: 767px)";
const MOBILE_DOCK_RESERVED_SPACE_PX = 152;
const MOBILE_MIN_SCROLLER_HEIGHT_PX = 320;
const MOBILE_CHROME_TRANSITION_MEASURE_MS = 260;
const MOBILE_CHROME_SETTLED_MEASURE_MS = MOBILE_CHROME_TRANSITION_MEASURE_MS + 40;
const MOBILE_CARD_TOP_SNAP_GUARD_PX = 12;
const MOBILE_HEADER_CARD_VISIBILITY_SETTLE_MS = 140;
const MOBILE_HEADER_SCROLL_SYNC_ATTRIBUTE = "data-mobile-header-scroll-sync";
const MOBILE_HEADER_SCROLL_SYNC_OFFSET_ATTRIBUTE = "data-mobile-header-scroll-sync-offset";
const MOBILE_HEADER_SCROLL_SYNC_MS = MOBILE_CHROME_TRANSITION_MEASURE_MS + 120;
const PROGRAMMATIC_SCROLL_RECOVERY_MS = 700;
const MIN_SCROLL_INDICATOR_HEIGHT_PX = 40;
const DESKTOP_SCROLL_SETTLE_MS = 140;
const DESKTOP_SCROLL_SNAP_TOLERANCE_PX = 16;
const MOBILE_SCROLL_INDICATOR_ACTIVE_MS = 900;

export function VoteFeedStage({
  displayFeed,
  sessionKey,
  activeSourceIndex,
  loadedCount,
  mobileDockReservedSpace,
  mobileTopChromeHeight = 0,
  mobileTopChromeVisible = true,
  canLoadMore,
  enrichedProfiles,
  watchedContentIds,
  followedWallets,
  normalizedAddress,
  referencedContentById,
  isCommitting,
  isMetadataPrefetchPending,
  navigationLocked,
  isWatchPending,
  isFollowPending,
  scrollContainerRef,
  onLoadMore,
  onTrackActiveIndex,
  onSelectByIndex,
  onContentIntent,
  onOpenFeedback,
  onSourceOpen,
  onToggleWatch,
  onToggleFollow,
}: VoteFeedStageProps) {
  const { setIsMobileHeaderVisible } = useMobileHeaderVisibility();
  const feedInstructionsId = useId();
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const cardElementsRef = useRef(new Map<number, HTMLElement>());
  const lastObservedActiveIndexRef = useRef<number | null>(null);
  const queuedNavigationTargetRef = useRef<number | null>(null);
  const pendingProgrammaticScrollTargetRef = useRef<number | null>(null);
  const pendingProgrammaticScrollStartedAtRef = useRef<number | null>(null);
  const lastProgrammaticScrollRequestRef = useRef<number | null>(null);
  const lastAutoPrefetchLoadedCountRef = useRef<number | null>(null);
  const previousSessionKeyRef = useRef(sessionKey);
  const mobileScrollIndicatorTimeoutRef = useRef<number | null>(null);
  const mobileHeaderVisibilityTimeoutRef = useRef<number | null>(null);
  const lastMobileHeadlineGuardStateRef = useRef({
    index: activeSourceIndex,
    topChromeHeight: mobileTopChromeHeight,
    topChromeVisible: mobileTopChromeVisible,
  });
  const [mobileScrollerHeight, setMobileScrollerHeight] = useState<number | null>(null);
  const [desktopEndSpacerHeight, setDesktopEndSpacerHeight] = useState(0);
  const [mobileEndSpacerHeight, setMobileEndSpacerHeight] = useState(0);
  const [isDesktopViewport, setIsDesktopViewport] = useState(false);
  const [isMobileScrollIndicatorActive, setIsMobileScrollIndicatorActive] = useState(false);
  const [scrollIndicatorState, setScrollIndicatorState] = useState<{
    isVisible: boolean;
    top: number;
    height: number;
    thumbOffset: number;
    thumbHeight: number;
  }>({
    isVisible: false,
    top: 0,
    height: 0,
    thumbOffset: 0,
    thumbHeight: MIN_SCROLL_INDICATOR_HEIGHT_PX,
  });

  const effectiveMobileDockReservedSpace = mobileDockReservedSpace ?? MOBILE_DOCK_RESERVED_SPACE_PX;
  const loadedItemCount = Math.min(Math.max(loadedCount, 0), displayFeed.length);
  const feedItems = useMemo(
    () => displayFeed.slice(0, loadedItemCount).map((item, actualIndex) => ({ actualIndex, item })),
    [displayFeed, loadedItemCount],
  );
  const renderedActiveIndex =
    activeSourceIndex >= 0 && activeSourceIndex < loadedItemCount
      ? activeSourceIndex
      : Math.min(Math.max(lastObservedActiveIndexRef.current ?? 0, 0), Math.max(loadedItemCount - 1, 0));
  const getActiveScroller = useCallback(() => {
    if (isDesktopViewport && scrollContainerRef?.current) {
      return scrollContainerRef.current;
    }
    return scrollerRef.current;
  }, [isDesktopViewport, scrollContainerRef]);

  const markMobileHeaderScrollSync = useCallback((scroller: HTMLElement, expectedScrollTop: number) => {
    if (typeof window === "undefined") return;

    const token = String(Date.now());
    scroller.setAttribute(MOBILE_HEADER_SCROLL_SYNC_ATTRIBUTE, token);
    scroller.setAttribute(MOBILE_HEADER_SCROLL_SYNC_OFFSET_ATTRIBUTE, String(expectedScrollTop));
    window.setTimeout(() => {
      if (scroller.getAttribute(MOBILE_HEADER_SCROLL_SYNC_ATTRIBUTE) === token) {
        scroller.removeAttribute(MOBILE_HEADER_SCROLL_SYNC_ATTRIBUTE);
        scroller.removeAttribute(MOBILE_HEADER_SCROLL_SYNC_OFFSET_ATTRIBUTE);
      }
    }, MOBILE_HEADER_SCROLL_SYNC_MS);
  }, []);

  const setMobileScrollerScrollTop = useCallback((scroller: HTMLElement, nextScrollTop: number) => {
    const previousScrollBehavior = scroller.style.scrollBehavior;

    scroller.style.scrollBehavior = "auto";
    scroller.scrollTop = nextScrollTop;
    scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
    scroller.style.scrollBehavior = previousScrollBehavior;
  }, []);

  const scheduleMobileHeaderVisibilityForCardChange = useCallback(
    (previousIndex: number | null, nextIndex: number) => {
      if (isDesktopViewport || previousIndex === null || previousIndex === nextIndex || typeof window === "undefined") {
        return;
      }

      const nextVisible = nextIndex <= 0 || nextIndex < previousIndex;

      if (mobileHeaderVisibilityTimeoutRef.current !== null) {
        window.clearTimeout(mobileHeaderVisibilityTimeoutRef.current);
      }

      mobileHeaderVisibilityTimeoutRef.current = window.setTimeout(() => {
        mobileHeaderVisibilityTimeoutRef.current = null;
        setIsMobileHeaderVisible(nextVisible);
      }, MOBILE_HEADER_CARD_VISIBILITY_SETTLE_MS);
    },
    [isDesktopViewport, setIsMobileHeaderVisible],
  );

  useEffect(() => {
    return () => {
      if (mobileHeaderVisibilityTimeoutRef.current !== null) {
        window.clearTimeout(mobileHeaderVisibilityTimeoutRef.current);
        mobileHeaderVisibilityTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (previousSessionKeyRef.current === sessionKey) {
      return;
    }

    previousSessionKeyRef.current = sessionKey;

    if (mobileHeaderVisibilityTimeoutRef.current !== null) {
      window.clearTimeout(mobileHeaderVisibilityTimeoutRef.current);
      mobileHeaderVisibilityTimeoutRef.current = null;
    }

    lastObservedActiveIndexRef.current = renderedActiveIndex >= 0 ? renderedActiveIndex : null;
    queuedNavigationTargetRef.current = null;
    pendingProgrammaticScrollTargetRef.current = null;
    pendingProgrammaticScrollStartedAtRef.current = null;
    lastProgrammaticScrollRequestRef.current = null;
    lastMobileHeadlineGuardStateRef.current = {
      index: renderedActiveIndex,
      topChromeHeight: mobileTopChromeHeight,
      topChromeVisible: true,
    };
    setIsMobileHeaderVisible(true);

    const scroller = scrollerRef.current;
    if (!scroller || isDesktopViewport) {
      return;
    }

    markMobileHeaderScrollSync(scroller, 0);
    setMobileScrollerScrollTop(scroller, 0);
  }, [
    isDesktopViewport,
    markMobileHeaderScrollSync,
    mobileTopChromeHeight,
    renderedActiveIndex,
    sessionKey,
    setIsMobileHeaderVisible,
    setMobileScrollerScrollTop,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const desktopStageQuery = window.matchMedia(DESKTOP_STEP_MEDIA_QUERY);
    const updateDesktopViewport = () => {
      setIsDesktopViewport(desktopStageQuery.matches);
    };

    updateDesktopViewport();

    if (typeof desktopStageQuery.addEventListener === "function") {
      desktopStageQuery.addEventListener("change", updateDesktopViewport);
      return () => {
        desktopStageQuery.removeEventListener("change", updateDesktopViewport);
      };
    }

    desktopStageQuery.addListener(updateDesktopViewport);
    return () => {
      desktopStageQuery.removeListener(updateDesktopViewport);
    };
  }, []);

  useEffect(() => {
    if (!canLoadMore) {
      lastAutoPrefetchLoadedCountRef.current = null;
      return;
    }

    const remainingLoadedItems = loadedItemCount - (activeSourceIndex + 1);
    if (remainingLoadedItems >= 3) {
      return;
    }

    if (lastAutoPrefetchLoadedCountRef.current === loadedItemCount) {
      return;
    }

    lastAutoPrefetchLoadedCountRef.current = loadedItemCount;
    onLoadMore();
  }, [activeSourceIndex, canLoadMore, loadedItemCount, onLoadMore]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mobileStageQuery = window.matchMedia(MOBILE_STAGE_MEDIA_QUERY);
    let frameId = 0;
    const transitionMeasurementTimeouts: number[] = [];
    const previousHeadlineGuardState = lastMobileHeadlineGuardStateRef.current;
    const didChromeVisibilityChange =
      previousHeadlineGuardState.topChromeVisible !== mobileTopChromeVisible ||
      Math.abs(previousHeadlineGuardState.topChromeHeight - mobileTopChromeHeight) >= 1;
    const shouldProtectActiveHeadline =
      didChromeVisibilityChange || previousHeadlineGuardState.index !== renderedActiveIndex;
    lastMobileHeadlineGuardStateRef.current = {
      index: renderedActiveIndex,
      topChromeHeight: mobileTopChromeHeight,
      topChromeVisible: mobileTopChromeVisible,
    };

    const keepActiveHeadlineInView = (scroller: HTMLDivElement) => {
      if (!shouldProtectActiveHeadline || !mobileStageQuery.matches) {
        return;
      }

      const activeNode = cardElementsRef.current.get(renderedActiveIndex);
      const activeTitleId = activeNode?.getAttribute("aria-labelledby");
      const activeTitle =
        (activeTitleId ? document.getElementById(activeTitleId) : null) ?? activeNode?.querySelector<HTMLElement>("h2");

      if (!activeTitle) {
        return;
      }

      const scrollerRect = scroller.getBoundingClientRect();
      const viewportTop = window.visualViewport?.offsetTop ?? 0;
      const scrollerTop = Math.max(scrollerRect.top, viewportTop) + MOBILE_CARD_TOP_SNAP_GUARD_PX;
      const titleTop = activeTitle.getBoundingClientRect().top;
      const hiddenByTopEdge = scrollerTop - titleTop;

      if (hiddenByTopEdge < 1) {
        return;
      }

      const maxScrollTop = Math.max(scroller.scrollHeight - scroller.clientHeight, 0);
      const nextScrollTop = Math.min(Math.max(scroller.scrollTop - hiddenByTopEdge, 0), maxScrollTop);

      if (Math.abs(nextScrollTop - scroller.scrollTop) < 0.5) {
        return;
      }

      markMobileHeaderScrollSync(scroller, nextScrollTop);
      setMobileScrollerScrollTop(scroller, nextScrollTop);
    };

    const measureScrollerHeight = () => {
      const scroller = scrollerRef.current;
      if (!scroller) return;

      if (!mobileStageQuery.matches) {
        setMobileScrollerHeight(current => (current === null ? current : null));
        return;
      }

      keepActiveHeadlineInView(scroller);
      const topOffset = scroller.getBoundingClientRect().top;
      const viewportHeight = Math.floor(window.visualViewport?.height ?? window.innerHeight);
      const availableHeight = Math.max(MOBILE_MIN_SCROLLER_HEIGHT_PX, Math.floor(viewportHeight - topOffset));

      setMobileScrollerHeight(current => (current === availableHeight ? current : availableHeight));
    };

    const requestMeasurement = () => {
      if (frameId !== 0) {
        window.cancelAnimationFrame(frameId);
      }

      frameId = window.requestAnimationFrame(() => {
        frameId = 0;
        measureScrollerHeight();
      });
    };

    if (didChromeVisibilityChange) {
      transitionMeasurementTimeouts.push(window.setTimeout(requestMeasurement, MOBILE_CHROME_SETTLED_MEASURE_MS));
    } else {
      requestMeasurement();
    }
    window.addEventListener("resize", requestMeasurement);

    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", requestMeasurement);
    }

    if (typeof mobileStageQuery.addEventListener === "function") {
      mobileStageQuery.addEventListener("change", requestMeasurement);
    } else {
      mobileStageQuery.addListener(requestMeasurement);
    }

    return () => {
      if (frameId !== 0) {
        window.cancelAnimationFrame(frameId);
      }
      transitionMeasurementTimeouts.forEach(timeoutId => window.clearTimeout(timeoutId));
      window.removeEventListener("resize", requestMeasurement);

      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", requestMeasurement);
      }

      if (typeof mobileStageQuery.addEventListener === "function") {
        mobileStageQuery.removeEventListener("change", requestMeasurement);
      } else {
        mobileStageQuery.removeListener(requestMeasurement);
      }
    };
  }, [
    effectiveMobileDockReservedSpace,
    loadedItemCount,
    markMobileHeaderScrollSync,
    mobileTopChromeHeight,
    mobileTopChromeVisible,
    renderedActiveIndex,
    setMobileScrollerScrollTop,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const desktopStageQuery = window.matchMedia(DESKTOP_STEP_MEDIA_QUERY);
    let frameId = 0;
    let observedLastNode: HTMLElement | null = null;
    let scrollerResizeObserver: ResizeObserver | null = null;
    let lastCardResizeObserver: ResizeObserver | null = null;
    const renderedLastIndex = feedItems.length > 0 ? (feedItems[feedItems.length - 1]?.actualIndex ?? -1) : -1;

    const updateEndSpacerHeight = () => {
      const scroller = getActiveScroller();
      const lastNode = renderedLastIndex >= 0 ? (cardElementsRef.current.get(renderedLastIndex) ?? null) : null;

      if (
        !scroller ||
        !desktopStageQuery.matches ||
        canLoadMore ||
        renderedLastIndex !== displayFeed.length - 1 ||
        !lastNode
      ) {
        setDesktopEndSpacerHeight(current => (current === 0 ? current : 0));
        return;
      }

      const nextHeight = resolveEndSpacerHeightForLastCardSnap({
        scrollerHeight: scroller.clientHeight,
        lastCardHeight: lastNode.offsetHeight,
      });
      setDesktopEndSpacerHeight(current => (current === nextHeight ? current : nextHeight));
    };

    const requestEndSpacerMeasurement = () => {
      if (frameId !== 0) {
        window.cancelAnimationFrame(frameId);
      }

      frameId = window.requestAnimationFrame(() => {
        frameId = 0;
        updateEndSpacerHeight();
      });
    };

    const syncObservedLastNode = () => {
      const nextLastNode = renderedLastIndex >= 0 ? (cardElementsRef.current.get(renderedLastIndex) ?? null) : null;

      if (observedLastNode === nextLastNode) {
        requestEndSpacerMeasurement();
        return;
      }

      lastCardResizeObserver?.disconnect();
      lastCardResizeObserver = null;
      observedLastNode = nextLastNode;

      if (observedLastNode && typeof ResizeObserver !== "undefined") {
        lastCardResizeObserver = new ResizeObserver(requestEndSpacerMeasurement);
        lastCardResizeObserver.observe(observedLastNode);
      }

      requestEndSpacerMeasurement();
    };

    const activeScroller = getActiveScroller();

    if (typeof ResizeObserver !== "undefined" && activeScroller) {
      scrollerResizeObserver = new ResizeObserver(syncObservedLastNode);
      scrollerResizeObserver.observe(activeScroller);
    }

    syncObservedLastNode();
    window.addEventListener("resize", syncObservedLastNode);

    if (typeof desktopStageQuery.addEventListener === "function") {
      desktopStageQuery.addEventListener("change", syncObservedLastNode);
    } else {
      desktopStageQuery.addListener(syncObservedLastNode);
    }

    return () => {
      if (frameId !== 0) {
        window.cancelAnimationFrame(frameId);
      }

      scrollerResizeObserver?.disconnect();
      lastCardResizeObserver?.disconnect();
      window.removeEventListener("resize", syncObservedLastNode);

      if (typeof desktopStageQuery.addEventListener === "function") {
        desktopStageQuery.removeEventListener("change", syncObservedLastNode);
      } else {
        desktopStageQuery.removeListener(syncObservedLastNode);
      }
    };
  }, [canLoadMore, displayFeed.length, feedItems, getActiveScroller, mobileScrollerHeight]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mobileStageQuery = window.matchMedia(MOBILE_STAGE_MEDIA_QUERY);
    let frameId = 0;
    let observedLastNode: HTMLElement | null = null;
    let scrollerResizeObserver: ResizeObserver | null = null;
    let lastCardResizeObserver: ResizeObserver | null = null;
    const renderedLastIndex = feedItems.length > 0 ? (feedItems[feedItems.length - 1]?.actualIndex ?? -1) : -1;

    const updateEndSpacerHeight = () => {
      const scroller = scrollerRef.current;
      const lastNode = renderedLastIndex >= 0 ? (cardElementsRef.current.get(renderedLastIndex) ?? null) : null;

      if (
        !scroller ||
        !mobileStageQuery.matches ||
        canLoadMore ||
        renderedLastIndex !== displayFeed.length - 1 ||
        !lastNode
      ) {
        setMobileEndSpacerHeight(current => (current === 0 ? current : 0));
        return;
      }

      const nextHeight = resolveEndSpacerHeightForLastCardSnap({
        scrollerHeight: scroller.clientHeight,
        lastCardHeight: lastNode.offsetHeight,
        reservedEndSpace: effectiveMobileDockReservedSpace,
        topSnapGuard: MOBILE_CARD_TOP_SNAP_GUARD_PX,
      });
      setMobileEndSpacerHeight(current => (current === nextHeight ? current : nextHeight));
    };

    const requestEndSpacerMeasurement = () => {
      if (frameId !== 0) {
        window.cancelAnimationFrame(frameId);
      }

      frameId = window.requestAnimationFrame(() => {
        frameId = 0;
        updateEndSpacerHeight();
      });
    };

    const syncObservedLastNode = () => {
      const nextLastNode = renderedLastIndex >= 0 ? (cardElementsRef.current.get(renderedLastIndex) ?? null) : null;

      if (observedLastNode === nextLastNode) {
        requestEndSpacerMeasurement();
        return;
      }

      lastCardResizeObserver?.disconnect();
      lastCardResizeObserver = null;
      observedLastNode = nextLastNode;

      if (observedLastNode && typeof ResizeObserver !== "undefined") {
        lastCardResizeObserver = new ResizeObserver(requestEndSpacerMeasurement);
        lastCardResizeObserver.observe(observedLastNode);
      }

      requestEndSpacerMeasurement();
    };

    const activeScroller = scrollerRef.current;

    if (typeof ResizeObserver !== "undefined" && activeScroller) {
      scrollerResizeObserver = new ResizeObserver(syncObservedLastNode);
      scrollerResizeObserver.observe(activeScroller);
    }

    syncObservedLastNode();
    window.addEventListener("resize", syncObservedLastNode);

    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", syncObservedLastNode);
    }

    if (typeof mobileStageQuery.addEventListener === "function") {
      mobileStageQuery.addEventListener("change", syncObservedLastNode);
    } else {
      mobileStageQuery.addListener(syncObservedLastNode);
    }

    return () => {
      if (frameId !== 0) {
        window.cancelAnimationFrame(frameId);
      }

      scrollerResizeObserver?.disconnect();
      lastCardResizeObserver?.disconnect();
      window.removeEventListener("resize", syncObservedLastNode);

      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", syncObservedLastNode);
      }

      if (typeof mobileStageQuery.addEventListener === "function") {
        mobileStageQuery.removeEventListener("change", syncObservedLastNode);
      } else {
        mobileStageQuery.removeListener(syncObservedLastNode);
      }
    };
  }, [canLoadMore, displayFeed.length, effectiveMobileDockReservedSpace, feedItems, mobileScrollerHeight]);

  const requestProgrammaticScroll = useCallback(
    (targetIndex: number) => {
      if (targetIndex < 0 || targetIndex >= displayFeed.length) {
        pendingProgrammaticScrollTargetRef.current = null;
        pendingProgrammaticScrollStartedAtRef.current = null;
        lastProgrammaticScrollRequestRef.current = null;
        return false;
      }

      const scroller = getActiveScroller();
      const node = cardElementsRef.current.get(targetIndex);
      if (!scroller || !node || lastProgrammaticScrollRequestRef.current === targetIndex) {
        return false;
      }

      const scrollerRect = scroller.getBoundingClientRect();
      const nodeRect = node.getBoundingClientRect();
      const topSnapGuard = isDesktopViewport ? 0 : MOBILE_CARD_TOP_SNAP_GUARD_PX;
      scroller.scrollTo({
        top: scroller.scrollTop + nodeRect.top - scrollerRect.top - topSnapGuard,
        behavior: "smooth",
      });
      pendingProgrammaticScrollTargetRef.current = targetIndex;
      pendingProgrammaticScrollStartedAtRef.current = Date.now();
      lastProgrammaticScrollRequestRef.current = targetIndex;
      return true;
    },
    [displayFeed.length, getActiveScroller, isDesktopViewport],
  );

  const resolveNearestCard = useCallback(() => {
    const scroller = getActiveScroller();
    if (!scroller) return null;

    const scrollerRect = scroller.getBoundingClientRect();
    const topSnapGuard = isDesktopViewport ? 0 : MOBILE_CARD_TOP_SNAP_GUARD_PX;
    let bestIndex: number | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    let bestTop = Number.POSITIVE_INFINITY;

    for (const [index, node] of cardElementsRef.current.entries()) {
      const cardRect = node.getBoundingClientRect();
      const relativeTop = cardRect.top - scrollerRect.top;
      const distance = Math.abs(relativeTop - topSnapGuard);

      if (distance < bestDistance || (distance === bestDistance && relativeTop < bestTop)) {
        bestDistance = distance;
        bestTop = relativeTop;
        bestIndex = index;
      }
    }

    if (bestIndex === null) {
      return null;
    }

    return {
      index: bestIndex,
      relativeTop: bestTop,
    };
  }, [getActiveScroller, isDesktopViewport]);

  const trackActiveCard = useCallback(() => {
    const nearestCard = resolveNearestCard();
    if (!nearestCard) {
      return;
    }

    const { index: bestIndex } = nearestCard;
    const previousObservedIndex = lastObservedActiveIndexRef.current;

    const pendingProgrammaticTarget = pendingProgrammaticScrollTargetRef.current;
    if (pendingProgrammaticTarget !== null) {
      if (bestIndex !== pendingProgrammaticTarget) {
        const pendingStartedAt = pendingProgrammaticScrollStartedAtRef.current;
        if (pendingStartedAt !== null && Date.now() - pendingStartedAt < PROGRAMMATIC_SCROLL_RECOVERY_MS) {
          return;
        }

        pendingProgrammaticScrollTargetRef.current = null;
        pendingProgrammaticScrollStartedAtRef.current = null;
        lastProgrammaticScrollRequestRef.current = null;
      } else {
        pendingProgrammaticScrollTargetRef.current = null;
        pendingProgrammaticScrollStartedAtRef.current = null;
        lastProgrammaticScrollRequestRef.current = null;
        scheduleMobileHeaderVisibilityForCardChange(previousObservedIndex, bestIndex);
        lastObservedActiveIndexRef.current = bestIndex;
        return;
      }
    }

    if (previousObservedIndex === bestIndex) {
      return;
    }

    scheduleMobileHeaderVisibilityForCardChange(previousObservedIndex, bestIndex);
    lastObservedActiveIndexRef.current = bestIndex;
    onTrackActiveIndex(bestIndex);
  }, [onTrackActiveIndex, resolveNearestCard, scheduleMobileHeaderVisibilityForCardChange]);

  useEffect(() => {
    if (activeSourceIndex < 0) {
      lastObservedActiveIndexRef.current = null;
      queuedNavigationTargetRef.current = null;
      pendingProgrammaticScrollTargetRef.current = null;
      pendingProgrammaticScrollStartedAtRef.current = null;
      lastProgrammaticScrollRequestRef.current = null;
      return;
    }

    const queuedNavigationTarget = queuedNavigationTargetRef.current;
    if (queuedNavigationTarget !== null) {
      if (queuedNavigationTarget >= loadedItemCount) {
        lastProgrammaticScrollRequestRef.current = null;
        if (canLoadMore) {
          onLoadMore();
        }
        return;
      }

      if (activeSourceIndex !== queuedNavigationTarget) {
        const didSelect = onSelectByIndex(queuedNavigationTarget);
        if (didSelect) {
          return;
        }
      }

      if (requestProgrammaticScroll(queuedNavigationTarget)) {
        queuedNavigationTargetRef.current = null;
      }
      return;
    }

    if (
      pendingProgrammaticScrollTargetRef.current === null &&
      lastObservedActiveIndexRef.current === activeSourceIndex
    ) {
      return;
    }

    if (lastObservedActiveIndexRef.current === null && activeSourceIndex === 0) {
      lastObservedActiveIndexRef.current = 0;
      return;
    }

    if (activeSourceIndex >= loadedItemCount) {
      queuedNavigationTargetRef.current = activeSourceIndex;
      lastProgrammaticScrollRequestRef.current = null;
      if (canLoadMore) {
        onLoadMore();
      }
      return;
    }

    requestProgrammaticScroll(activeSourceIndex);
  }, [activeSourceIndex, canLoadMore, loadedItemCount, onLoadMore, onSelectByIndex, requestProgrammaticScroll]);

  useEffect(() => {
    const scroller = getActiveScroller();
    if (!scroller || typeof window === "undefined") return;

    let frameId = 0;
    const requestTrack = () => {
      if (frameId !== 0) return;
      frameId = window.requestAnimationFrame(() => {
        frameId = 0;
        trackActiveCard();
      });
    };

    requestTrack();
    scroller.addEventListener("scroll", requestTrack, { passive: true });
    window.addEventListener("resize", requestTrack);

    return () => {
      if (frameId !== 0) {
        window.cancelAnimationFrame(frameId);
      }
      scroller.removeEventListener("scroll", requestTrack);
      window.removeEventListener("resize", requestTrack);
    };
  }, [feedItems.length, getActiveScroller, trackActiveCard]);

  useEffect(() => {
    if (!isDesktopViewport || typeof window === "undefined") return;

    const scroller = getActiveScroller();
    if (!scroller) return;

    let settleTimeoutId: number | null = null;

    const clearSettleTimeout = () => {
      if (settleTimeoutId !== null) {
        window.clearTimeout(settleTimeoutId);
        settleTimeoutId = null;
      }
    };

    const settleToNearestCard = () => {
      settleTimeoutId = null;

      if (navigationLocked || pendingProgrammaticScrollTargetRef.current !== null) {
        return;
      }

      const nearestCard = resolveNearestCard();
      if (!nearestCard) {
        return;
      }

      if (Math.abs(nearestCard.relativeTop) <= DESKTOP_SCROLL_SNAP_TOLERANCE_PX) {
        return;
      }

      requestProgrammaticScroll(nearestCard.index);
    };

    const scheduleSettle = () => {
      clearSettleTimeout();
      settleTimeoutId = window.setTimeout(settleToNearestCard, DESKTOP_SCROLL_SETTLE_MS);
    };

    scroller.addEventListener("scroll", scheduleSettle, { passive: true });

    return () => {
      scroller.removeEventListener("scroll", scheduleSettle);
      clearSettleTimeout();
    };
  }, [getActiveScroller, isDesktopViewport, navigationLocked, requestProgrammaticScroll, resolveNearestCard]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const scroller = getActiveScroller();
    if (!scroller || isDesktopViewport) {
      setIsMobileScrollIndicatorActive(false);
      if (mobileScrollIndicatorTimeoutRef.current !== null) {
        window.clearTimeout(mobileScrollIndicatorTimeoutRef.current);
        mobileScrollIndicatorTimeoutRef.current = null;
      }
      return;
    }

    const showMobileIndicator = () => {
      setIsMobileScrollIndicatorActive(true);

      if (mobileScrollIndicatorTimeoutRef.current !== null) {
        window.clearTimeout(mobileScrollIndicatorTimeoutRef.current);
      }

      mobileScrollIndicatorTimeoutRef.current = window.setTimeout(() => {
        mobileScrollIndicatorTimeoutRef.current = null;
        setIsMobileScrollIndicatorActive(false);
      }, MOBILE_SCROLL_INDICATOR_ACTIVE_MS);
    };

    scroller.addEventListener("scroll", showMobileIndicator, { passive: true });

    return () => {
      scroller.removeEventListener("scroll", showMobileIndicator);
      if (mobileScrollIndicatorTimeoutRef.current !== null) {
        window.clearTimeout(mobileScrollIndicatorTimeoutRef.current);
        mobileScrollIndicatorTimeoutRef.current = null;
      }
    };
  }, [getActiveScroller, isDesktopViewport]);

  useEffect(() => {
    if (isDesktopViewport) return;

    const scroller = getActiveScroller();
    if (!scroller) return;

    const observer = new IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting && canLoadMore) {
          onLoadMore();
        }
      },
      { root: scroller, threshold: 0.1 },
    );

    const currentRef = loadMoreRef.current;
    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
      observer.disconnect();
    };
  }, [canLoadMore, getActiveScroller, isDesktopViewport, onLoadMore]);

  const setCardElement = useCallback((index: number, node: HTMLElement | null) => {
    if (!node) {
      cardElementsRef.current.delete(index);
      return;
    }

    cardElementsRef.current.set(index, node);
  }, []);

  useEffect(() => {
    const activeIndex = renderedActiveIndex;

    for (const [index, node] of cardElementsRef.current.entries()) {
      node.inert = index !== activeIndex;
    }
  }, [feedItems.length, renderedActiveIndex]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let frameId = 0;
    let resizeObserver: ResizeObserver | null = null;
    const desktopStageQuery = window.matchMedia(DESKTOP_STEP_MEDIA_QUERY);
    let observedScroller: HTMLDivElement | null = null;

    const updateIndicator = () => {
      const scroller = getActiveScroller();
      if (!scroller) {
        setScrollIndicatorState(current => (current.isVisible ? { ...current, isVisible: false } : current));
        return;
      }

      const scrollerRect = scroller.getBoundingClientRect();
      const visibleTop = isDesktopViewport ? 0 : Math.max(scrollerRect.top, 0);
      const visibleBottom = isDesktopViewport ? window.innerHeight : Math.min(scrollerRect.bottom, window.innerHeight);
      const trackHeight = Math.max(visibleBottom - visibleTop, 0);
      const scrollRange = Math.max(scroller.scrollHeight - scroller.clientHeight, 0);

      if (trackHeight < MIN_SCROLL_INDICATOR_HEIGHT_PX || scrollRange <= 0) {
        setScrollIndicatorState(current => (current.isVisible ? { ...current, isVisible: false } : current));
        return;
      }

      const thumbHeight = Math.max(
        MIN_SCROLL_INDICATOR_HEIGHT_PX,
        Math.round((scroller.clientHeight / scroller.scrollHeight) * trackHeight),
      );
      const thumbTravel = Math.max(trackHeight - thumbHeight, 0);
      const thumbOffset = thumbTravel * (scroller.scrollTop / scrollRange);

      setScrollIndicatorState(current => {
        if (
          current.isVisible &&
          current.top === visibleTop &&
          current.height === trackHeight &&
          current.thumbHeight === thumbHeight &&
          Math.abs(current.thumbOffset - thumbOffset) < 1
        ) {
          return current;
        }

        return {
          isVisible: true,
          top: visibleTop,
          height: trackHeight,
          thumbOffset,
          thumbHeight,
        };
      });
    };

    const requestUpdate = () => {
      if (frameId !== 0) return;
      frameId = window.requestAnimationFrame(() => {
        frameId = 0;
        updateIndicator();
      });
    };

    const bindScroller = () => {
      const scroller = getActiveScroller();
      if (observedScroller === scroller) {
        requestUpdate();
        return;
      }

      if (observedScroller) {
        observedScroller.removeEventListener("scroll", requestUpdate);
      }

      resizeObserver?.disconnect();
      resizeObserver = null;
      observedScroller = scroller;

      if (observedScroller) {
        observedScroller.addEventListener("scroll", requestUpdate, { passive: true });
        if (typeof ResizeObserver !== "undefined") {
          resizeObserver = new ResizeObserver(requestUpdate);
          resizeObserver.observe(observedScroller);
        }
      }

      requestUpdate();
    };

    bindScroller();
    window.addEventListener("resize", bindScroller);

    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", bindScroller);
    }

    if (typeof desktopStageQuery.addEventListener === "function") {
      desktopStageQuery.addEventListener("change", bindScroller);
    } else {
      desktopStageQuery.addListener(bindScroller);
    }

    return () => {
      if (frameId !== 0) {
        window.cancelAnimationFrame(frameId);
      }
      if (observedScroller) {
        observedScroller.removeEventListener("scroll", requestUpdate);
      }
      resizeObserver?.disconnect();
      window.removeEventListener("resize", bindScroller);

      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", bindScroller);
      }

      if (typeof desktopStageQuery.addEventListener === "function") {
        desktopStageQuery.removeEventListener("change", bindScroller);
      } else {
        desktopStageQuery.removeListener(bindScroller);
      }
    };
  }, [
    desktopEndSpacerHeight,
    feedItems.length,
    getActiveScroller,
    isDesktopViewport,
    mobileEndSpacerHeight,
    mobileScrollerHeight,
  ]);

  const scrollToIndex = useCallback(
    (targetIndex: number) => {
      if (navigationLocked || targetIndex < 0 || targetIndex >= displayFeed.length) {
        return false;
      }

      queuedNavigationTargetRef.current = targetIndex;

      if (targetIndex >= loadedItemCount && canLoadMore) {
        lastProgrammaticScrollRequestRef.current = null;
        onLoadMore();
        return true;
      }

      if (targetIndex !== activeSourceIndex) {
        const didSelect = onSelectByIndex(targetIndex);
        if (!didSelect) {
          queuedNavigationTargetRef.current = null;
          return false;
        }
        return true;
      }

      if (requestProgrammaticScroll(targetIndex)) {
        queuedNavigationTargetRef.current = null;
        return true;
      }

      return false;
    },
    [
      activeSourceIndex,
      canLoadMore,
      displayFeed.length,
      loadedItemCount,
      navigationLocked,
      onLoadMore,
      onSelectByIndex,
      requestProgrammaticScroll,
    ],
  );

  useEffect(() => {
    if (typeof window === "undefined" || navigationLocked) return;

    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;

      const target = event.target as HTMLElement | null;
      if (
        target?.closest(
          "input,textarea,select,button,[contenteditable='true'],[role='textbox'],[role='searchbox'],[data-disable-queue-wheel='true']",
        )
      ) {
        return;
      }

      if (event.key === "ArrowDown" || event.key === "ArrowRight" || event.key === "PageDown") {
        event.preventDefault();
        scrollToIndex(activeSourceIndex + 1);
        return;
      }

      if (event.key === "ArrowUp" || event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        scrollToIndex(activeSourceIndex - 1);
        return;
      }

      if (event.key === "Home") {
        event.preventDefault();
        scrollToIndex(0);
        return;
      }

      if (event.key === "End") {
        event.preventDefault();
        scrollToIndex(displayFeed.length - 1);
      }
    };

    window.addEventListener("keydown", handleWindowKeyDown);
    return () => window.removeEventListener("keydown", handleWindowKeyDown);
  }, [activeSourceIndex, displayFeed.length, navigationLocked, scrollToIndex]);

  return (
    <div
      ref={scrollerRef}
      role="feed"
      aria-label="Content feed"
      aria-busy={isCommitting || isMetadataPrefetchPending}
      aria-describedby={feedInstructionsId}
      data-mobile-header-scroll-source="true"
      data-testid="vote-mobile-scroll-container"
      className="scrollbar-hide flex h-full min-h-0 snap-y snap-mandatory flex-col gap-3 overflow-y-auto overscroll-contain bg-[#000] xl:h-auto xl:flex-none xl:gap-4 xl:overflow-visible xl:overscroll-auto xl:pb-4 xl:pr-0 xl:scroll-pb-0"
      style={{
        height: mobileScrollerHeight !== null ? `${mobileScrollerHeight}px` : undefined,
        maxHeight: mobileScrollerHeight !== null ? `${mobileScrollerHeight}px` : undefined,
        paddingBottom: isDesktopViewport ? undefined : `${effectiveMobileDockReservedSpace}px`,
        scrollPaddingTop: isDesktopViewport ? undefined : `${MOBILE_CARD_TOP_SNAP_GUARD_PX}px`,
        scrollPaddingBottom: isDesktopViewport ? undefined : `${effectiveMobileDockReservedSpace}px`,
      }}
    >
      <p id={feedInstructionsId} className="sr-only">
        Use the arrow keys or Page Up and Page Down to move between items. Use Home or End to jump to the start or end
        of the loaded feed.
      </p>
      {isCommitting ? (
        <div className="flex shrink-0 items-center justify-center">
          <span className="text-base text-base-content/50">
            <span className="loading loading-spinner loading-xs mr-1.5"></span>
            Committing...
          </span>
        </div>
      ) : null}

      {feedItems.map(({ actualIndex, item }) => {
        const isActiveCard = actualIndex === renderedActiveIndex;
        const titleId = `vote-feed-title-${item.id.toString()}`;

        return (
          <article
            key={item.id.toString()}
            id={`vote-feed-card-${actualIndex}`}
            ref={node => setCardElement(actualIndex, node)}
            data-feed-card-index={actualIndex}
            aria-current={isActiveCard ? "true" : undefined}
            aria-labelledby={titleId}
            aria-posinset={actualIndex + 1}
            aria-setsize={canLoadMore ? -1 : displayFeed.length}
            aria-hidden={!isActiveCard}
            tabIndex={isActiveCard ? 0 : -1}
            className={`relative shrink-0 snap-start xl:snap-always transition-[opacity,filter,transform] duration-300 ease-out ${
              isActiveCard
                ? "opacity-100"
                : "pointer-events-none opacity-32 grayscale-[0.38] saturate-[0.46] brightness-[0.72]"
            }`}
          >
            <FeedVoteCard
              item={item}
              submitterProfile={enrichedProfiles[item.submitter.toLowerCase()]}
              titleId={titleId}
              isActive={isActiveCard}
              onContentIntent={contentItem => onContentIntent(contentItem)}
              onOpenFeedback={onOpenFeedback}
              onSourceOpen={contentItem => onSourceOpen(contentItem)}
              onToggleWatch={onToggleWatch}
              onToggleFollow={onToggleFollow}
              watched={watchedContentIds.has(item.id.toString())}
              watchPending={isWatchPending(item.id)}
              following={followedWallets.has(item.submitter.toLowerCase())}
              followPending={isFollowPending(item.submitter)}
              normalizedAddress={normalizedAddress}
              referencedContentById={referencedContentById}
            />
            {!isActiveCard ? (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 rounded-lg bg-[linear-gradient(180deg,rgba(0,0,0,0.18),rgba(0,0,0,0.46))]"
              />
            ) : null}
          </article>
        );
      })}

      {canLoadMore ? (
        <div ref={loadMoreRef} className="flex justify-center py-8">
          <span className="loading loading-spinner loading-md text-primary"></span>
        </div>
      ) : null}

      {!canLoadMore && mobileEndSpacerHeight > 0 ? (
        <div aria-hidden="true" className="shrink-0 xl:hidden" style={{ height: `${mobileEndSpacerHeight}px` }} />
      ) : null}

      {!canLoadMore && desktopEndSpacerHeight > 0 ? (
        <div
          aria-hidden="true"
          className="hidden shrink-0 xl:block"
          style={{ height: `${desktopEndSpacerHeight}px` }}
        />
      ) : null}

      {typeof document !== "undefined" &&
      scrollIndicatorState.isVisible &&
      (isDesktopViewport || isMobileScrollIndicatorActive)
        ? createPortal(
            <div
              aria-hidden="true"
              className="pointer-events-none fixed right-0 top-0 z-40 w-3"
              style={{ top: `${scrollIndicatorState.top}px`, height: `${scrollIndicatorState.height}px` }}
            >
              <div className="absolute inset-y-0 left-1/2 w-[3px] -translate-x-1/2 rounded-full bg-white/18" />
              <div
                className="absolute left-1/2 w-[3px] -translate-x-1/2 rounded-full bg-primary shadow-[0_0_18px_rgba(242,100,38,0.85)]"
                style={{
                  top: `${scrollIndicatorState.thumbOffset}px`,
                  height: `${scrollIndicatorState.thumbHeight}px`,
                }}
              />
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
