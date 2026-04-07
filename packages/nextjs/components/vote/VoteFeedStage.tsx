"use client";

import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FeedVoteCard } from "~~/components/vote/VoteFeedCards";
import type { ContentItem } from "~~/hooks/useContentFeed";
import type { SubmitterProfile } from "~~/hooks/useSubmitterProfiles";

interface VoteFeedStageProps {
  displayFeed: ContentItem[];
  activeSourceIndex: number;
  loadedCount: number;
  mobileDockReservedSpace?: number | null;
  canLoadMore: boolean;
  enrichedProfiles: Record<string, SubmitterProfile>;
  watchedContentIds: Set<string>;
  followedWallets: Set<string>;
  normalizedAddress?: string;
  isCommitting: boolean;
  isMetadataPrefetchPending: boolean;
  navigationLocked: boolean;
  isWatchPending: (contentId: bigint) => boolean;
  isFollowPending: (address: string) => boolean;
  scrollContainerRef?: RefObject<HTMLDivElement | null>;
  onLoadMore: () => void;
  onTrackActiveIndex: (targetIndex: number) => boolean;
  onSelectByIndex: (targetIndex: number) => boolean;
  onExternalOpen: (item: ContentItem) => void;
  onToggleWatch: (contentId: bigint) => void;
  onToggleFollow: (address: string) => void;
}

const DESKTOP_STEP_MEDIA_QUERY = "(min-width: 1280px)";
const MOBILE_STAGE_MEDIA_QUERY = "(max-width: 767px)";
const DESKTOP_WHEEL_STEP_THRESHOLD = 10;
const DESKTOP_WHEEL_STEP_RESET_MS = 260;
const DESKTOP_WHEEL_STEP_LOCK_MS = 260;
const MOBILE_DOCK_RESERVED_SPACE_PX = 152;
const MOBILE_MIN_SCROLLER_HEIGHT_PX = 320;
const PROGRAMMATIC_SCROLL_RECOVERY_MS = 700;

export function VoteFeedStage({
  displayFeed,
  activeSourceIndex,
  loadedCount,
  mobileDockReservedSpace,
  canLoadMore,
  enrichedProfiles,
  watchedContentIds,
  followedWallets,
  normalizedAddress,
  isCommitting,
  isMetadataPrefetchPending,
  navigationLocked,
  isWatchPending,
  isFollowPending,
  scrollContainerRef,
  onLoadMore,
  onTrackActiveIndex,
  onSelectByIndex,
  onExternalOpen,
  onToggleWatch,
  onToggleFollow,
}: VoteFeedStageProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const cardElementsRef = useRef(new Map<number, HTMLDivElement>());
  const lastObservedActiveIndexRef = useRef<number | null>(null);
  const queuedNavigationTargetRef = useRef<number | null>(null);
  const pendingProgrammaticScrollTargetRef = useRef<number | null>(null);
  const pendingProgrammaticScrollStartedAtRef = useRef<number | null>(null);
  const lastProgrammaticScrollRequestRef = useRef<number | null>(null);
  const wheelDeltaAccumulatorRef = useRef(0);
  const wheelLockTimeoutRef = useRef<number | null>(null);
  const wheelResetTimeoutRef = useRef<number | null>(null);
  const lastAutoPrefetchLoadedCountRef = useRef<number | null>(null);
  const [mobileScrollerHeight, setMobileScrollerHeight] = useState<number | null>(null);
  const [desktopEndSpacerHeight, setDesktopEndSpacerHeight] = useState(0);
  const [isDesktopViewport, setIsDesktopViewport] = useState(false);

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

    const measureScrollerHeight = () => {
      const scroller = scrollerRef.current;
      if (!scroller) return;

      if (!mobileStageQuery.matches) {
        setMobileScrollerHeight(current => (current === null ? current : null));
        return;
      }

      const topOffset = scroller.getBoundingClientRect().top;
      const availableHeight = Math.max(MOBILE_MIN_SCROLLER_HEIGHT_PX, Math.floor(window.innerHeight - topOffset));

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

    requestMeasurement();
    window.addEventListener("resize", requestMeasurement);

    if (typeof mobileStageQuery.addEventListener === "function") {
      mobileStageQuery.addEventListener("change", requestMeasurement);
    } else {
      mobileStageQuery.addListener(requestMeasurement);
    }

    return () => {
      if (frameId !== 0) {
        window.cancelAnimationFrame(frameId);
      }
      window.removeEventListener("resize", requestMeasurement);

      if (typeof mobileStageQuery.addEventListener === "function") {
        mobileStageQuery.removeEventListener("change", requestMeasurement);
      } else {
        mobileStageQuery.removeListener(requestMeasurement);
      }
    };
  }, [effectiveMobileDockReservedSpace, loadedItemCount]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const desktopStageQuery = window.matchMedia(DESKTOP_STEP_MEDIA_QUERY);
    let frameId = 0;
    let observedLastNode: HTMLDivElement | null = null;
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

      const nextHeight = Math.max(scroller.clientHeight - lastNode.offsetHeight, 0);
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
      scroller.scrollTo({ top: scroller.scrollTop + nodeRect.top - scrollerRect.top, behavior: "smooth" });
      pendingProgrammaticScrollTargetRef.current = targetIndex;
      pendingProgrammaticScrollStartedAtRef.current = Date.now();
      lastProgrammaticScrollRequestRef.current = targetIndex;
      return true;
    },
    [displayFeed.length, getActiveScroller],
  );

  const trackActiveCard = useCallback(() => {
    const scroller = getActiveScroller();
    if (!scroller) return;
    const scrollerRect = scroller.getBoundingClientRect();
    let bestIndex: number | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    let bestTop = Number.POSITIVE_INFINITY;

    for (const [index, node] of cardElementsRef.current.entries()) {
      const cardRect = node.getBoundingClientRect();
      const relativeTop = cardRect.top - scrollerRect.top;
      const distance = Math.abs(relativeTop);
      if (distance < bestDistance || (distance === bestDistance && relativeTop < bestTop)) {
        bestDistance = distance;
        bestTop = relativeTop;
        bestIndex = index;
      }
    }

    if (bestIndex === null) {
      return;
    }

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
        lastObservedActiveIndexRef.current = bestIndex;
        return;
      }
    }

    if (lastObservedActiveIndexRef.current === bestIndex) {
      return;
    }

    lastObservedActiveIndexRef.current = bestIndex;
    onTrackActiveIndex(bestIndex);
  }, [getActiveScroller, onTrackActiveIndex]);

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

  const setCardElement = useCallback((index: number, node: HTMLDivElement | null) => {
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

  useEffect(() => {
    const scroller = getActiveScroller();
    if (!scroller || typeof window === "undefined") return;

    const desktopStepQuery = window.matchMedia(DESKTOP_STEP_MEDIA_QUERY);

    const clearWheelResetTimer = () => {
      if (wheelResetTimeoutRef.current !== null) {
        window.clearTimeout(wheelResetTimeoutRef.current);
        wheelResetTimeoutRef.current = null;
      }
    };

    const clearWheelLockTimer = () => {
      if (wheelLockTimeoutRef.current !== null) {
        window.clearTimeout(wheelLockTimeoutRef.current);
        wheelLockTimeoutRef.current = null;
      }
    };

    const handleWheel = (event: WheelEvent) => {
      if (!desktopStepQuery.matches || navigationLocked) return;
      const deltaY = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaY * 16 : event.deltaY;
      if (Math.abs(deltaY) <= Math.abs(event.deltaX) || Math.abs(deltaY) < 1) return;

      if (wheelLockTimeoutRef.current !== null) return;

      wheelDeltaAccumulatorRef.current += deltaY;
      clearWheelResetTimer();
      wheelResetTimeoutRef.current = window.setTimeout(() => {
        wheelDeltaAccumulatorRef.current = 0;
        wheelResetTimeoutRef.current = null;
      }, DESKTOP_WHEEL_STEP_RESET_MS);

      if (Math.abs(wheelDeltaAccumulatorRef.current) < DESKTOP_WHEEL_STEP_THRESHOLD) {
        return;
      }

      const direction = wheelDeltaAccumulatorRef.current > 0 ? 1 : -1;
      wheelDeltaAccumulatorRef.current = 0;
      clearWheelResetTimer();

      const didAdvance = scrollToIndex((activeSourceIndex >= 0 ? activeSourceIndex : 0) + direction);
      if (!didAdvance) {
        return;
      }

      event.preventDefault();

      wheelLockTimeoutRef.current = window.setTimeout(() => {
        wheelLockTimeoutRef.current = null;
      }, DESKTOP_WHEEL_STEP_LOCK_MS);
    };

    scroller.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      scroller.removeEventListener("wheel", handleWheel);
      clearWheelResetTimer();
      clearWheelLockTimer();
      wheelDeltaAccumulatorRef.current = 0;
    };
  }, [activeSourceIndex, getActiveScroller, navigationLocked, scrollToIndex]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {isCommitting ? (
        <div className="flex shrink-0 items-center justify-center">
          <span className="text-base text-base-content/50">
            <span className="loading loading-spinner loading-xs mr-1.5"></span>
            Committing...
          </span>
        </div>
      ) : null}

      <div
        ref={scrollerRef}
        className="flex min-h-0 flex-1 snap-y snap-mandatory flex-col gap-3 overflow-y-auto overscroll-contain pr-1 scroll-smooth xl:flex-none xl:gap-4 xl:overflow-visible xl:overscroll-auto xl:pb-4 xl:pr-0 xl:scroll-pb-0"
        style={{
          height: mobileScrollerHeight !== null ? `${mobileScrollerHeight}px` : undefined,
          maxHeight: mobileScrollerHeight !== null ? `${mobileScrollerHeight}px` : undefined,
          paddingBottom: isDesktopViewport ? undefined : `${effectiveMobileDockReservedSpace}px`,
          scrollPaddingBottom: isDesktopViewport ? undefined : `${effectiveMobileDockReservedSpace}px`,
        }}
      >
        {feedItems.map(({ actualIndex, item }) => {
          const canPrevious = actualIndex > 0 && !isCommitting && !navigationLocked;
          const canNext = actualIndex < displayFeed.length - 1 && !isCommitting && !navigationLocked;
          const isActiveCard = actualIndex === renderedActiveIndex;

          return (
            <div
              key={item.id.toString()}
              id={`vote-feed-card-${actualIndex}`}
              ref={node => setCardElement(actualIndex, node)}
              data-feed-card-index={actualIndex}
              aria-current={isActiveCard ? "true" : undefined}
              aria-hidden={!isActiveCard}
              className={`relative shrink-0 snap-start snap-always transition-[opacity,filter,transform] duration-300 ease-out ${
                isActiveCard
                  ? "opacity-100"
                  : "pointer-events-none opacity-32 grayscale-[0.38] saturate-[0.46] brightness-[0.72]"
              }`}
            >
              <FeedVoteCard
                item={item}
                submitterProfile={enrichedProfiles[item.submitter.toLowerCase()]}
                onExternalOpen={contentItem => onExternalOpen(contentItem)}
                onToggleWatch={onToggleWatch}
                onToggleFollow={onToggleFollow}
                watched={watchedContentIds.has(item.id.toString())}
                watchPending={isWatchPending(item.id)}
                following={followedWallets.has(item.submitter.toLowerCase())}
                followPending={isFollowPending(item.submitter)}
                normalizedAddress={normalizedAddress}
                deferEmbedClientFetch={isMetadataPrefetchPending && actualIndex !== renderedActiveIndex}
                onPrevious={canPrevious ? () => void scrollToIndex(actualIndex - 1) : undefined}
                onNext={canNext ? () => void scrollToIndex(actualIndex + 1) : undefined}
                canPrevious={canPrevious}
                canNext={canNext}
              />
              {!isActiveCard ? (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 rounded-[1.75rem] bg-[linear-gradient(180deg,rgba(10,10,12,0.18),rgba(10,10,12,0.46))]"
                />
              ) : null}
            </div>
          );
        })}

        {canLoadMore ? (
          <div ref={loadMoreRef} className="flex justify-center py-8">
            <span className="loading loading-spinner loading-md text-primary"></span>
          </div>
        ) : null}

        {!canLoadMore && desktopEndSpacerHeight > 0 ? (
          <div
            aria-hidden="true"
            className="hidden shrink-0 xl:block"
            style={{ height: `${desktopEndSpacerHeight}px` }}
          />
        ) : null}
      </div>
    </div>
  );
}
