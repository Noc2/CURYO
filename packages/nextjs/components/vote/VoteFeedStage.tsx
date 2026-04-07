"use client";

import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FeedVoteCard } from "~~/components/vote/VoteFeedCards";
import type { ContentItem } from "~~/hooks/useContentFeed";
import type { SubmitterProfile } from "~~/hooks/useSubmitterProfiles";

interface VoteFeedStageProps {
  primaryItem: ContentItem | null;
  displayFeed: ContentItem[];
  activeSourceIndex: number;
  loadedCount: number;
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
const DESKTOP_WHEEL_STEP_THRESHOLD = 18;
const DESKTOP_WHEEL_STEP_RESET_MS = 180;
const DESKTOP_WHEEL_STEP_LOCK_MS = 320;
const MOBILE_DOCK_HEIGHT_PX = 140;
const MOBILE_STAGE_BOTTOM_GAP_PX = 12;
const MOBILE_MIN_SCROLLER_HEIGHT_PX = 320;

export function VoteFeedStage({
  primaryItem,
  displayFeed,
  activeSourceIndex,
  loadedCount,
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
  const wheelDeltaAccumulatorRef = useRef(0);
  const wheelLockTimeoutRef = useRef<number | null>(null);
  const wheelResetTimeoutRef = useRef<number | null>(null);
  const [mobileScrollerHeight, setMobileScrollerHeight] = useState<number | null>(null);
  const [desktopEndSpacerHeight, setDesktopEndSpacerHeight] = useState(0);
  const [isDesktopViewport, setIsDesktopViewport] = useState(false);

  const renderedCount = Math.max(loadedCount, activeSourceIndex + 1, primaryItem ? activeSourceIndex + 2 : loadedCount);
  const feedItems = useMemo(() => displayFeed.slice(0, renderedCount), [displayFeed, renderedCount]);
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
    const remainingLoadedItems = feedItems.length - (activeSourceIndex + 1);
    if (remainingLoadedItems < 3 && canLoadMore) {
      onLoadMore();
    }
  }, [activeSourceIndex, canLoadMore, feedItems.length, onLoadMore]);

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
      const availableHeight = Math.max(
        MOBILE_MIN_SCROLLER_HEIGHT_PX,
        Math.floor(window.innerHeight - topOffset - MOBILE_DOCK_HEIGHT_PX - MOBILE_STAGE_BOTTOM_GAP_PX),
      );

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
  }, [feedItems.length]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const desktopStageQuery = window.matchMedia(DESKTOP_STEP_MEDIA_QUERY);
    let frameId = 0;
    let observedLastNode: HTMLDivElement | null = null;
    let scrollerResizeObserver: ResizeObserver | null = null;
    let lastCardResizeObserver: ResizeObserver | null = null;

    const updateEndSpacerHeight = () => {
      const scroller = getActiveScroller();
      const lastIndex = feedItems.length - 1;
      const lastNode = lastIndex >= 0 ? (cardElementsRef.current.get(lastIndex) ?? null) : null;

      if (!scroller || !desktopStageQuery.matches || canLoadMore || !lastNode) {
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
      const lastIndex = feedItems.length - 1;
      const nextLastNode = lastIndex >= 0 ? (cardElementsRef.current.get(lastIndex) ?? null) : null;

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
  }, [canLoadMore, feedItems.length, getActiveScroller, mobileScrollerHeight]);

  useEffect(() => {
    lastObservedActiveIndexRef.current = activeSourceIndex >= 0 ? activeSourceIndex : null;
  }, [activeSourceIndex]);

  const trackActiveCard = useCallback(() => {
    const scroller = getActiveScroller();
    if (!scroller) return;
    const scrollerRect = scroller.getBoundingClientRect();
    const scrollerCenter = scrollerRect.top + scroller.clientHeight / 2;
    let bestIndex: number | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const [index, node] of cardElementsRef.current.entries()) {
      const cardRect = node.getBoundingClientRect();
      const cardCenter = cardRect.top + cardRect.height / 2;
      const distance = Math.abs(cardCenter - scrollerCenter);

      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }

    if (bestIndex === null || lastObservedActiveIndexRef.current === bestIndex) {
      return;
    }

    lastObservedActiveIndexRef.current = bestIndex;
    onTrackActiveIndex(bestIndex);
  }, [getActiveScroller, onTrackActiveIndex]);

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
  }, [canLoadMore, getActiveScroller, onLoadMore]);

  const setCardElement = useCallback((index: number, node: HTMLDivElement | null) => {
    if (!node) {
      cardElementsRef.current.delete(index);
      return;
    }

    cardElementsRef.current.set(index, node);
  }, []);

  const scrollToIndex = useCallback(
    (targetIndex: number) => {
      if (navigationLocked || targetIndex < 0 || targetIndex >= displayFeed.length) {
        return false;
      }

      if (targetIndex >= feedItems.length && canLoadMore) {
        onLoadMore();
      }

      const node = cardElementsRef.current.get(targetIndex);
      const scroller = getActiveScroller();
      if (node && scroller) {
        const scrollerRect = scroller.getBoundingClientRect();
        const nodeRect = node.getBoundingClientRect();
        lastObservedActiveIndexRef.current = targetIndex;
        scroller.scrollTo({ top: scroller.scrollTop + nodeRect.top - scrollerRect.top, behavior: "smooth" });
      }

      return onSelectByIndex(targetIndex);
    },
    [
      canLoadMore,
      displayFeed.length,
      feedItems.length,
      getActiveScroller,
      navigationLocked,
      onLoadMore,
      onSelectByIndex,
    ],
  );

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
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX) || Math.abs(event.deltaY) < 4) return;

      event.preventDefault();

      if (wheelLockTimeoutRef.current !== null) return;

      wheelDeltaAccumulatorRef.current += event.deltaY;
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

      scrollToIndex((activeSourceIndex >= 0 ? activeSourceIndex : 0) + direction);

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
        className="flex min-h-0 flex-1 snap-y snap-mandatory flex-col gap-3 overflow-y-auto overscroll-contain pb-[8.75rem] pr-1 scroll-pb-[8.75rem] scroll-smooth xl:flex-none xl:gap-4 xl:overflow-visible xl:overscroll-auto xl:pb-4 xl:pr-0 xl:scroll-pb-0"
        style={
          mobileScrollerHeight !== null
            ? { height: `${mobileScrollerHeight}px`, maxHeight: `${mobileScrollerHeight}px` }
            : undefined
        }
      >
        {feedItems.map((item, index) => {
          const canPrevious = index > 0 && !isCommitting && !navigationLocked;
          const canNext = index < displayFeed.length - 1 && !isCommitting && !navigationLocked;
          const isActiveCard = index === (activeSourceIndex >= 0 ? activeSourceIndex : 0);

          return (
            <div
              key={item.id.toString()}
              id={`vote-feed-card-${index}`}
              ref={node => setCardElement(index, node)}
              data-feed-card-index={index}
              aria-current={isActiveCard ? "true" : undefined}
              className={`relative shrink-0 snap-start snap-always transition-[opacity,filter,transform] duration-300 ease-out ${
                isActiveCard ? "opacity-100" : "pointer-events-none opacity-45 grayscale-[0.22] saturate-[0.72]"
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
                deferEmbedClientFetch={isMetadataPrefetchPending && index !== activeSourceIndex}
                onPrevious={canPrevious ? () => void scrollToIndex(index - 1) : undefined}
                onNext={canNext ? () => void scrollToIndex(index + 1) : undefined}
                canPrevious={canPrevious}
                canNext={canNext}
              />
              {!isActiveCard ? (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 rounded-[1.75rem] bg-[linear-gradient(180deg,rgba(16,16,18,0.08),rgba(16,16,18,0.28))]"
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
