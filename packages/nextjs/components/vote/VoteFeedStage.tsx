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
  address?: string;
  isCommitting: boolean;
  voteError?: string | null;
  isMetadataPrefetchPending: boolean;
  navigationLocked: boolean;
  isWatchPending: (contentId: bigint) => boolean;
  isFollowPending: (address: string) => boolean;
  getCooldownSeconds: (contentId: bigint) => number;
  onLoadMore: () => void;
  onSelectByIndex: (targetIndex: number) => boolean;
  onVote: (item: ContentItem, isUp: boolean) => void;
  onExternalOpen: (item: ContentItem) => void;
  onToggleWatch: (contentId: bigint) => void;
  onToggleFollow: (address: string) => void;
}

const ACTIVE_CARD_MIN_RATIO = 0.18;

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
  address,
  isCommitting,
  voteError,
  isMetadataPrefetchPending,
  navigationLocked,
  isWatchPending,
  isFollowPending,
  getCooldownSeconds,
  onLoadMore,
  onSelectByIndex,
  onVote,
  onExternalOpen,
  onToggleWatch,
  onToggleFollow,
}: VoteFeedStageProps) {
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const cardElementsRef = useRef(new Map<number, HTMLDivElement>());
  const intersectionRatiosRef = useRef(new Map<number, number>());
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

  useEffect(() => {
    if (typeof window === "undefined") return;

    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          const index = Number((entry.target as HTMLElement).dataset.feedCardIndex);
          if (!Number.isFinite(index)) continue;
          intersectionRatiosRef.current.set(index, entry.isIntersecting ? entry.intersectionRatio : 0);
        }

        let bestIndex: number | null = null;
        let bestRatio = 0;

        for (const [index, ratio] of intersectionRatiosRef.current.entries()) {
          if (ratio <= bestRatio) continue;
          bestRatio = ratio;
          bestIndex = index;
        }

        if (
          bestIndex === null ||
          bestRatio < ACTIVE_CARD_MIN_RATIO ||
          lastObservedActiveIndexRef.current === bestIndex
        ) {
          return;
        }

        lastObservedActiveIndexRef.current = bestIndex;
        onSelectByIndex(bestIndex);
      },
      {
        threshold: [0, 0.2, 0.4, 0.6, 0.8],
        rootMargin: "-8% 0px -34% 0px",
      },
    );

    const nodes = Array.from(cardElementsRef.current.values());
    for (const node of nodes) {
      observer.observe(node);
    }

    return () => observer.disconnect();
  }, [activeSourceIndex, feedItems, onSelectByIndex]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting && canLoadMore) {
          onLoadMore();
        }
      },
      { threshold: 0.1 },
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
      intersectionRatiosRef.current.delete(index);
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
    <div className="flex min-h-0 flex-col gap-4 xl:gap-5">
      {isCommitting ? (
        <div className="flex shrink-0 items-center justify-center">
          <span className="text-base text-base-content/50">
            <span className="loading loading-spinner loading-xs mr-1.5"></span>
            Committing...
          </span>
        </div>
      ) : null}

      {feedItems.map((item, index) => {
        const canPrevious = index > 0 && !isCommitting && !navigationLocked;
        const canNext = index < displayFeed.length - 1 && !isCommitting && !navigationLocked;

        return (
          <div
            key={item.id.toString()}
            id={`vote-feed-card-${index}`}
            ref={node => setCardElement(index, node)}
            data-feed-card-index={index}
            className="scroll-mt-4 xl:scroll-mt-5"
          >
            <FeedVoteCard
              item={item}
              submitterProfile={enrichedProfiles[item.submitter.toLowerCase()]}
              onExternalOpen={contentItem => onExternalOpen(contentItem)}
              onVote={onVote}
              onToggleWatch={onToggleWatch}
              onToggleFollow={onToggleFollow}
              watched={watchedContentIds.has(item.id.toString())}
              watchPending={isWatchPending(item.id)}
              following={followedWallets.has(item.submitter.toLowerCase())}
              followPending={isFollowPending(item.submitter)}
              normalizedAddress={normalizedAddress}
              isCommitting={isCommitting}
              voteError={item.id === primaryItem?.id ? voteError : null}
              deferEmbedClientFetch={isMetadataPrefetchPending && index !== activeSourceIndex}
              cooldownSecondsRemaining={getCooldownSeconds(item.id)}
              address={address}
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
  );
}
