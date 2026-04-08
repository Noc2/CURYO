"use client";

import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, type PanInfo, type Variants, motion } from "framer-motion";
import { FeedQueueCard, FeedVoteCard, getVoteFeedThumbnailSrc } from "~~/components/vote/VoteFeedCards";
import type { ContentItem } from "~~/hooks/useContentFeed";
import { useQueueNavigation } from "~~/hooks/useQueueNavigation";
import type { SubmitterProfile } from "~~/hooks/useSubmitterProfiles";
import { useVoteQueueLayout } from "~~/hooks/useVoteQueueLayout";
import type { QueueCardStatus } from "~~/lib/vote/queueCardStatus";
import { resolveVoteQueueWindowItems } from "~~/lib/vote/queueLayout";

const CARD_SWIPE_THRESHOLD = 96;
const LOAD_MORE_OBSERVER_ROOT_MARGIN = "0px 0px 40vh 0px";
const VOTE_CARD_TRANSITION_EASE = [0.22, 1, 0.36, 1] as const;

const voteCardVariants: Variants = {
  enter: (direction: "previous" | "next") => ({
    opacity: 0.38,
    x: direction === "next" ? 22 : -22,
    y: 10,
    scale: 0.992,
  }),
  center: {
    opacity: 1,
    x: 0,
    y: 0,
    scale: 1,
  },
  exit: (direction: "previous" | "next") => ({
    opacity: 0.72,
    x: direction === "next" ? -14 : 14,
    y: 4,
    scale: 0.997,
  }),
};

type QueueAction = "previous" | "next" | "first" | "last";

function isKeyboardNavigationTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;

  return Boolean(
    target.closest(
      "a,button,input,textarea,select,label,summary,[contenteditable='true'],[role='button'],[role='textbox'],[role='searchbox'],[data-disable-queue-wheel='true']",
    ),
  );
}

interface VoteFeedStageProps {
  primaryItem: ContentItem | null;
  displayFeed: ContentItem[];
  queueSourceItems: ContentItem[];
  navigationDirection: "previous" | "next";
  activeSourceIndex: number;
  loadedCount: number;
  canLoadMore: boolean;
  queueStatusByContentId: Map<string, QueueCardStatus | null>;
  queuePositionMap: Map<string, number>;
  enrichedProfiles: Record<string, SubmitterProfile>;
  watchedContentIds: Set<string>;
  votedContentIds: Set<string>;
  followedWallets: Set<string>;
  normalizedAddress?: string;
  address?: string;
  isCommitting: boolean;
  voteError?: string | null;
  isFeedBusy: boolean;
  isMetadataPrefetchPending: boolean;
  primaryItemCooldownSeconds: number;
  navigationLocked: boolean;
  isWatchPending: (contentId: bigint) => boolean;
  isFollowPending: (address: string) => boolean;
  onLoadMore: () => void;
  onNavigateSelection: (direction: "previous" | "next") => boolean;
  onSelectByIndex: (targetIndex: number) => boolean;
  onSelectCard: (id: bigint) => void;
  onVote: (item: ContentItem, isUp: boolean) => void;
  onExternalOpen: (item: ContentItem) => void;
  onToggleWatch: (contentId: bigint) => void;
  onToggleFollow: (address: string) => void;
}

export function VoteFeedStage({
  primaryItem,
  displayFeed,
  queueSourceItems,
  navigationDirection,
  activeSourceIndex,
  loadedCount,
  canLoadMore,
  queueStatusByContentId,
  queuePositionMap,
  enrichedProfiles,
  watchedContentIds,
  votedContentIds,
  followedWallets,
  normalizedAddress,
  address,
  isCommitting,
  voteError,
  isFeedBusy,
  isMetadataPrefetchPending,
  primaryItemCooldownSeconds,
  navigationLocked,
  isWatchPending,
  isFollowPending,
  onLoadMore,
  onNavigateSelection,
  onSelectByIndex,
  onSelectCard,
  onVote,
  onExternalOpen,
  onToggleWatch,
  onToggleFollow,
}: VoteFeedStageProps) {
  const feedInstructionsId = useId();
  const [supportsTouchNavigation, setSupportsTouchNavigation] = useState(false);
  const activeArticleRef = useRef<HTMLElement | null>(null);
  const queueRailRef = useRef<HTMLDivElement | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const lastLoadMoreRequestCountRef = useRef<number | null>(null);
  const lastPreloadedThumbnailRef = useRef<string | null>(null);
  const shouldFocusActiveArticleRef = useRef(false);
  const [queueSectionElement, setQueueSectionElement] = useState<HTMLElement | null>(null);
  const queueLayout = useVoteQueueLayout(queueSectionElement);
  const hasVisibleQueue = queueLayout.rows > 0;
  const hasMultiRowQueue = queueLayout.rows > 1;
  const activeArticleId = primaryItem?.id ?? null;
  const activeArticleTitleId = activeArticleId !== null ? `vote-feed-title-${activeArticleId.toString()}` : undefined;
  const activeArticlePosition = activeSourceIndex >= 0 ? activeSourceIndex + 1 : undefined;
  const activeArticleSetSize = canLoadMore ? -1 : displayFeed.length;
  const queueVisibleItems = useMemo(() => {
    return resolveVoteQueueWindowItems(queueSourceItems, activeSourceIndex, queueLayout);
  }, [activeSourceIndex, queueLayout, queueSourceItems]);

  const queueGridTemplateColumns = useMemo(() => {
    if (queueLayout.rows <= 1) return undefined;
    return `repeat(${queueLayout.columns}, minmax(0, 1fr))`;
  }, [queueLayout.columns, queueLayout.rows]);

  const nextThumbnailSrc = useMemo(() => {
    const selectedNextItem = activeSourceIndex >= 0 ? (displayFeed[activeSourceIndex + 1] ?? null) : null;
    return selectedNextItem ? getVoteFeedThumbnailSrc(selectedNextItem) : null;
  }, [activeSourceIndex, displayFeed]);

  const scrollQueueThumbnailIntoView = useCallback(
    (contentId: bigint | null, behavior: ScrollBehavior = "smooth") => {
      if (contentId === null || queueLayout.rows !== 1) return;

      const rail = queueRailRef.current;
      if (!rail) return;

      const thumbnail = rail.querySelector<HTMLElement>(`[data-thumbnail-id="${contentId.toString()}"]`);
      if (!thumbnail) return;

      const railRect = rail.getBoundingClientRect();
      const thumbnailRect = thumbnail.getBoundingClientRect();
      const centeredScrollLeft =
        rail.scrollLeft + (thumbnailRect.left - railRect.left) - (rail.clientWidth - thumbnailRect.width) / 2;
      const maxScrollLeft = Math.max(0, rail.scrollWidth - rail.clientWidth);
      const nextScrollLeft = Math.min(Math.max(0, centeredScrollLeft), maxScrollLeft);

      rail.scrollTo({ left: nextScrollLeft, behavior });
    },
    [queueLayout.rows],
  );

  const focusQueueThumbnail = useCallback(
    (contentId: bigint | null) => {
      if (contentId === null || typeof window === "undefined") return;

      window.requestAnimationFrame(() => {
        const rail = queueRailRef.current;
        if (!rail) return;

        scrollQueueThumbnailIntoView(contentId, "auto");
        const thumbnail = rail.querySelector<HTMLElement>(`[data-thumbnail-id="${contentId.toString()}"]`);
        thumbnail?.focus({ preventScroll: true });
      });
    },
    [scrollQueueThumbnailIntoView],
  );

  useEffect(() => {
    if (!primaryItem || queueLayout.rows !== 1) return;
    scrollQueueThumbnailIntoView(primaryItem.id);
  }, [primaryItem, queueLayout.rows, scrollQueueThumbnailIntoView]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;

    const mediaQuery = window.matchMedia("(pointer: coarse), (hover: none)");
    const updatePointerMode = () => {
      setSupportsTouchNavigation(mediaQuery.matches);
    };

    updatePointerMode();
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", updatePointerMode);
      return () => {
        mediaQuery.removeEventListener("change", updatePointerMode);
      };
    }

    mediaQuery.addListener(updatePointerMode);
    return () => {
      mediaQuery.removeListener(updatePointerMode);
    };
  }, []);

  useEffect(() => {
    const remainingLoadedItems = displayFeed.length - (activeSourceIndex + 1);
    const shouldPrefetchQueue = remainingLoadedItems < 8 && canLoadMore;

    if (!shouldPrefetchQueue) {
      lastLoadMoreRequestCountRef.current = null;
      return;
    }

    if (lastLoadMoreRequestCountRef.current === loadedCount) {
      return;
    }

    lastLoadMoreRequestCountRef.current = loadedCount;
    onLoadMore();
  }, [activeSourceIndex, canLoadMore, displayFeed.length, loadedCount, onLoadMore]);

  useEffect(() => {
    if (!nextThumbnailSrc || typeof window === "undefined") return;
    if (lastPreloadedThumbnailRef.current === nextThumbnailSrc) return;

    lastPreloadedThumbnailRef.current = nextThumbnailSrc;
    const image = new window.Image();
    image.decoding = "async";
    image.src = nextThumbnailSrc;
  }, [nextThumbnailSrc]);

  useEffect(() => {
    if (!canLoadMore) {
      lastLoadMoreRequestCountRef.current = null;
    }
  }, [canLoadMore]);

  useEffect(() => {
    if (!canLoadMore) return;

    const observer = new IntersectionObserver(
      entries => {
        const entry = entries[0];
        if (!entry?.isIntersecting || !canLoadMore) return;
        if (lastLoadMoreRequestCountRef.current === loadedCount) return;

        lastLoadMoreRequestCountRef.current = loadedCount;
        onLoadMore();
      },
      {
        threshold: 0,
        rootMargin: LOAD_MORE_OBSERVER_ROOT_MARGIN,
      },
    );

    const currentRef = loadMoreRef.current;
    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, [canLoadMore, loadedCount, onLoadMore]);

  const handleSelectPrevious = useCallback(() => {
    if (onNavigateSelection("previous")) {
      shouldFocusActiveArticleRef.current = true;
    }
  }, [onNavigateSelection]);

  const handleSelectNext = useCallback(() => {
    if (onNavigateSelection("next")) {
      shouldFocusActiveArticleRef.current = true;
    }
  }, [onNavigateSelection]);

  const handleQueueKeyboardNavigate = useCallback(
    (action: QueueAction, currentId: bigint) => {
      if (displayFeed.length === 0) return;

      if (action === "first") {
        if (onSelectByIndex(0)) {
          focusQueueThumbnail(displayFeed[0]?.id ?? null);
        }
        return;
      }

      if (action === "last") {
        const lastIndex = displayFeed.length - 1;
        if (onSelectByIndex(lastIndex)) {
          focusQueueThumbnail(displayFeed[lastIndex]?.id ?? null);
        }
        return;
      }

      const currentIndex = displayFeed.findIndex(item => item.id === currentId);
      if (currentIndex === -1) return;

      const nextIndex = Math.min(Math.max(currentIndex + (action === "next" ? 1 : -1), 0), displayFeed.length - 1);
      if (onSelectByIndex(nextIndex)) {
        focusQueueThumbnail(displayFeed[nextIndex]?.id ?? null);
      }
    },
    [displayFeed, focusQueueThumbnail, onSelectByIndex],
  );

  useEffect(() => {
    if (activeArticleId === null || !shouldFocusActiveArticleRef.current || typeof window === "undefined") return;

    shouldFocusActiveArticleRef.current = false;
    const frameId = window.requestAnimationFrame(() => {
      activeArticleRef.current?.focus({ preventScroll: true });
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [activeArticleId]);

  const canNavigateCards = displayFeed.length > 1 && !isCommitting && !navigationLocked;
  const canSwipeNavigate = supportsTouchNavigation && canNavigateCards;
  const canWheelNavigate = !supportsTouchNavigation && canNavigateCards;

  const activeCardRegionRef = useQueueNavigation<HTMLDivElement>({
    enabled: Boolean(primaryItem && canNavigateCards),
    enableWheel: canWheelNavigate,
    onNavigate: onNavigateSelection,
  });

  const handleSelectCard = useCallback(
    (id: bigint) => {
      shouldFocusActiveArticleRef.current = true;
      onSelectCard(id);
    },
    [onSelectCard],
  );

  const handleActiveCardKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      if (navigationLocked || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      if (isKeyboardNavigationTarget(event.target)) return;

      if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        if (onNavigateSelection("previous")) {
          shouldFocusActiveArticleRef.current = true;
        }
        return;
      }

      if (event.key === "ArrowRight" || event.key === "PageDown") {
        event.preventDefault();
        if (onNavigateSelection("next")) {
          shouldFocusActiveArticleRef.current = true;
        }
        return;
      }

      if (event.key === "Home") {
        event.preventDefault();
        if (onSelectByIndex(0)) {
          shouldFocusActiveArticleRef.current = true;
        }
        return;
      }

      if (event.key === "End") {
        event.preventDefault();
        if (onSelectByIndex(displayFeed.length - 1)) {
          shouldFocusActiveArticleRef.current = true;
        }
      }
    },
    [displayFeed.length, navigationLocked, onNavigateSelection, onSelectByIndex],
  );

  const handleCardDragEnd = useCallback(
    (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      if (!canSwipeNavigate) return;

      const offsetX = info.offset.x;
      const velocityX = info.velocity.x;

      if (offsetX <= -CARD_SWIPE_THRESHOLD || velocityX <= -500) {
        onNavigateSelection("next");
        return;
      }

      if (offsetX >= CARD_SWIPE_THRESHOLD || velocityX >= 500) {
        onNavigateSelection("previous");
      }
    },
    [canSwipeNavigate, onNavigateSelection],
  );

  const handleQueueRailRef = useCallback((node: HTMLDivElement | null) => {
    queueRailRef.current = node;
  }, []);

  const handleQueueSectionRef = useCallback((node: HTMLElement | null) => {
    setQueueSectionElement(node);
  }, []);

  return (
    <div
      ref={activeCardRegionRef}
      role="feed"
      aria-label="Content feed"
      aria-busy={isFeedBusy || isCommitting}
      aria-describedby={feedInstructionsId}
      className="flex min-h-0 flex-col gap-3 xl:gap-2.5"
    >
      <p id={feedInstructionsId} className="sr-only">
        Use Left and Right Arrow keys or Page Up and Page Down to move between items. Use Home or End to jump to the
        first or last loaded item.
      </p>

      {isCommitting ? (
        <div className="flex shrink-0 items-center justify-center">
          <span className="text-base text-base-content/50">
            <span className="loading loading-spinner loading-xs mr-1.5"></span>
            Committing...
          </span>
        </div>
      ) : null}

      {primaryItem ? (
        <div className="min-h-0">
          <AnimatePresence initial={false} mode="wait" custom={navigationDirection}>
            <motion.article
              ref={activeArticleRef}
              key={primaryItem.id.toString()}
              custom={navigationDirection}
              className="touch-pan-y rounded-[1.75rem] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-base-100"
              tabIndex={navigationLocked ? -1 : 0}
              aria-current="true"
              aria-labelledby={activeArticleTitleId}
              aria-posinset={activeArticlePosition}
              aria-setsize={activeArticleSetSize}
              variants={voteCardVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{
                duration: 0.24,
                ease: VOTE_CARD_TRANSITION_EASE,
              }}
              drag={canSwipeNavigate ? "x" : false}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.12}
              dragMomentum={false}
              onKeyDown={handleActiveCardKeyDown}
              onDragEnd={handleCardDragEnd}
            >
              <FeedVoteCard
                item={primaryItem}
                submitterProfile={enrichedProfiles[primaryItem.submitter.toLowerCase()]}
                titleId={activeArticleTitleId}
                onExternalOpen={item => onExternalOpen(item)}
                onVote={onVote}
                onToggleWatch={onToggleWatch}
                onToggleFollow={onToggleFollow}
                watched={watchedContentIds.has(primaryItem.id.toString())}
                watchPending={isWatchPending(primaryItem.id)}
                following={followedWallets.has(primaryItem.submitter.toLowerCase())}
                followPending={isFollowPending(primaryItem.submitter)}
                normalizedAddress={normalizedAddress}
                isCommitting={isCommitting}
                voteError={voteError}
                deferEmbedClientFetch={isMetadataPrefetchPending}
                cooldownSecondsRemaining={primaryItemCooldownSeconds}
                address={address}
                onPrevious={handleSelectPrevious}
                onNext={handleSelectNext}
                canPrevious={activeSourceIndex > 0}
                canNext={activeSourceIndex >= 0 && activeSourceIndex < displayFeed.length - 1}
              />
            </motion.article>
          </AnimatePresence>
        </div>
      ) : null}

      {queueSourceItems.length > 0 ? (
        <motion.section
          ref={handleQueueSectionRef}
          key={primaryItem?.id.toString() ?? "queue-empty"}
          className={hasVisibleQueue ? "shrink-0" : "h-0 overflow-hidden"}
          aria-label="Up next queue"
          initial={{ opacity: 0.82, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, ease: VOTE_CARD_TRANSITION_EASE }}
        >
          {hasVisibleQueue ? (
            hasMultiRowQueue ? (
              <div
                className="grid w-full content-start"
                style={{
                  gridTemplateColumns: queueGridTemplateColumns,
                  gap: queueLayout.gapPx,
                }}
                aria-label="Content queue"
              >
                {queueVisibleItems.map(item => (
                  <FeedQueueCard
                    key={item.id.toString()}
                    item={item}
                    onSelect={handleSelectCard}
                    onNavigate={handleQueueKeyboardNavigate}
                    queuePosition={queuePositionMap.get(item.id.toString()) ?? 0}
                    queueStatus={queueStatusByContentId.get(item.id.toString()) ?? null}
                    hasVoted={votedContentIds.has(item.id.toString())}
                    fluidWidth
                    selected={item.id === primaryItem?.id}
                  />
                ))}
              </div>
            ) : (
              <div
                ref={handleQueueRailRef}
                data-disable-queue-wheel="true"
                className="scrollbar-hide flex min-w-0 items-stretch gap-3 overflow-x-auto snap-x snap-mandatory xl:gap-2.5"
                aria-label="Content queue"
              >
                {queueVisibleItems.map(item => (
                  <FeedQueueCard
                    key={item.id.toString()}
                    item={item}
                    onSelect={handleSelectCard}
                    onNavigate={handleQueueKeyboardNavigate}
                    queuePosition={queuePositionMap.get(item.id.toString()) ?? 0}
                    queueStatus={queueStatusByContentId.get(item.id.toString()) ?? null}
                    hasVoted={votedContentIds.has(item.id.toString())}
                    selected={item.id === primaryItem?.id}
                  />
                ))}
              </div>
            )
          ) : null}
        </motion.section>
      ) : null}

      {canLoadMore ? (
        <div ref={loadMoreRef} className="flex justify-center py-8 xl:hidden">
          <span className="loading loading-spinner loading-md text-primary"></span>
        </div>
      ) : null}
    </div>
  );
}
