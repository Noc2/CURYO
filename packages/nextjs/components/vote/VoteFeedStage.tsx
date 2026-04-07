"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
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
  onLoadMore: () => void;
  onTrackActiveIndex: (targetIndex: number) => boolean;
  onSelectByIndex: (targetIndex: number) => boolean;
  onExternalOpen: (item: ContentItem) => void;
  onToggleWatch: (contentId: bigint) => void;
  onToggleFollow: (address: string) => void;
}

const ACTIVE_CARD_FOCUS_LINE_FRACTION = 0.34;

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

  const renderedCount = Math.max(loadedCount, activeSourceIndex + 1, primaryItem ? activeSourceIndex + 2 : loadedCount);
  const feedItems = useMemo(() => displayFeed.slice(0, renderedCount), [displayFeed, renderedCount]);

  useEffect(() => {
    const remainingLoadedItems = feedItems.length - (activeSourceIndex + 1);
    if (remainingLoadedItems < 3 && canLoadMore) {
      onLoadMore();
    }
  }, [activeSourceIndex, canLoadMore, feedItems.length, onLoadMore]);

  useEffect(() => {
    lastObservedActiveIndexRef.current = activeSourceIndex >= 0 ? activeSourceIndex : null;
  }, [activeSourceIndex]);

  const trackActiveCard = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const scrollerRect = scroller.getBoundingClientRect();
    const focusLine = scrollerRect.top + Math.min(scrollerRect.height * ACTIVE_CARD_FOCUS_LINE_FRACTION, 240);
    let bestIndex: number | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const [index, node] of cardElementsRef.current.entries()) {
      const rect = node.getBoundingClientRect();
      if (rect.bottom <= scrollerRect.top || rect.top >= scrollerRect.bottom) continue;

      const spansFocusLine = rect.top <= focusLine && rect.bottom >= focusLine;
      const distance = spansFocusLine ? 0 : Math.min(Math.abs(rect.top - focusLine), Math.abs(rect.bottom - focusLine));

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
  }, [onTrackActiveIndex]);

  useEffect(() => {
    const scroller = scrollerRef.current;
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
  }, [feedItems.length, trackActiveCard]);

  useEffect(() => {
    const scroller = scrollerRef.current;
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
  }, [canLoadMore, onLoadMore]);

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
      if (node) {
        lastObservedActiveIndexRef.current = targetIndex;
        node.scrollIntoView({ behavior: "smooth", block: "start" });
      }

      return onSelectByIndex(targetIndex);
    },
    [canLoadMore, displayFeed.length, feedItems.length, navigationLocked, onLoadMore, onSelectByIndex],
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
        className="scrollbar-hide flex min-h-0 flex-1 snap-y snap-mandatory flex-col gap-2.5 overflow-y-auto overscroll-contain pr-1 scroll-smooth xl:gap-3"
      >
        {feedItems.map((item, index) => {
          const canPrevious = index > 0 && !isCommitting && !navigationLocked;
          const canNext = index < displayFeed.length - 1 && !isCommitting && !navigationLocked;

          return (
            <div
              key={item.id.toString()}
              id={`vote-feed-card-${index}`}
              ref={node => setCardElement(index, node)}
              data-feed-card-index={index}
              className="snap-start"
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
            </div>
          );
        })}

        {canLoadMore ? (
          <div ref={loadMoreRef} className="flex justify-center py-8">
            <span className="loading loading-spinner loading-md text-primary"></span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
