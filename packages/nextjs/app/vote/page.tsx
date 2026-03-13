"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { AnimatePresence, type PanInfo, type Variants, motion } from "framer-motion";
import type { NextPage } from "next";
import { useAccount } from "wagmi";
import { CategoryFilter } from "~~/components/CategoryFilter";
import { VotingGuide } from "~~/components/onboarding/VotingGuide";
import { AppPageShell } from "~~/components/shared/AppPageShell";
import { StreakCounter } from "~~/components/shared/StreakCounter";
import { FeedScopeFilter } from "~~/components/vote/FeedScopeFilter";
import { FeedQueueCard, FeedVoteCard, getVoteFeedThumbnailSrc } from "~~/components/vote/VoteFeedCards";
import { useCategoryPopularity } from "~~/hooks/useCategoryPopularity";
import { useCategoryRegistry } from "~~/hooks/useCategoryRegistry";
import type { ContentItem } from "~~/hooks/useContentFeed";
import { useContentFeed } from "~~/hooks/useContentFeed";
import { useDiscoverSignals } from "~~/hooks/useDiscoverSignals";
import { useFollowedProfiles } from "~~/hooks/useFollowedProfiles";
import { useOnboarding } from "~~/hooks/useOnboarding";
import { useQueueNavigation } from "~~/hooks/useQueueNavigation";
import { useRoundVote } from "~~/hooks/useRoundVote";
import { SubmitterProfile, useSubmitterProfiles } from "~~/hooks/useSubmitterProfiles";
import { useUserPreferences } from "~~/hooks/useUserPreferences";
import { useVoteFeedStage } from "~~/hooks/useVoteFeedStage";
import { useVoteHistory } from "~~/hooks/useVoteHistory";
import { useVoteQueueLayout } from "~~/hooks/useVoteQueueLayout";
import { useVoterAccuracyBatch } from "~~/hooks/useVoterAccuracyBatch";
import { useWatchedContent } from "~~/hooks/useWatchedContent";
import { chunkVoteQueueItems } from "~~/lib/vote/queueLayout";
import { trackContentClick } from "~~/utils/clickTracker";
import { isContentItemBlocked } from "~~/utils/contentFilter";
import { notification } from "~~/utils/scaffold-eth";

const StakeSelector = dynamic(() => import("~~/components/swipe/StakeSelector").then(m => m.StakeSelector), {
  loading: () => (
    <div className="flex items-center justify-center h-96">
      <span className="loading loading-spinner loading-lg"></span>
    </div>
  ),
});

const ALL_FILTER = "All";
const BROKEN_FILTER = "Broken";
const slugify = (name: string) => name.toLowerCase().replace(/\s+/g, "-");
type SortOption = "for_you" | "newest" | "oldest" | "highest_rated" | "lowest_rated";
type SearchSortOption = Exclude<SortOption, "for_you">;
type ScopeOption = "all" | "watched" | "my_votes" | "my_submissions" | "settling_soon" | "followed_curators";

const SEARCH_SORT_OPTIONS: { value: SearchSortOption; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "highest_rated", label: "Highest Rated" },
  { value: "lowest_rated", label: "Lowest Rated" },
];

const FEED_PAGE_SIZE = 20;
const FEED_PREFETCH_BUFFER = 20;
const CARD_SWIPE_THRESHOLD = 96;
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

const SCOPE_OPTIONS: { value: ScopeOption; label: string }[] = [
  { value: "all", label: "All" },
  { value: "watched", label: "Watched" },
  { value: "my_votes", label: "My Votes" },
  { value: "my_submissions", label: "My Submissions" },
  { value: "settling_soon", label: "Settling Soon" },
  { value: "followed_curators", label: "Curators You Follow" },
];

const HomeInner = () => {
  const searchParams = useSearchParams();
  const searchQuery = searchParams?.get("q") ?? "";
  const contentParam = searchParams?.get("content");

  const { address } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { isFirstVote, markVoteCompleted } = useOnboarding();
  const [activeCategory, setActiveCategory] = useState<string>(ALL_FILTER);
  const [scope, setScope] = useState<ScopeOption>("all");
  const [sortBy, setSortBy] = useState<SortOption>("for_you");
  const [visibleCount, setVisibleCount] = useState(FEED_PAGE_SIZE);
  const [navigationDirection, setNavigationDirection] = useState<"previous" | "next">("next");
  const [supportsTouchNavigation, setSupportsTouchNavigation] = useState(false);
  const isSearchMode = searchQuery.trim().length > 0;
  const effectiveSearchSortBy: SearchSortOption = sortBy === "for_you" ? "newest" : sortBy;
  const { categories: websiteCategories, categoryNameToId, isLoading: categoriesLoading } = useCategoryRegistry();
  const { votes, isLoading: votesLoading } = useVoteHistory(address);
  const {
    watchedItems,
    watchedContentIds,
    isLoading: watchedLoading,
    toggleWatch,
    requestReadAccess: requestWatchReadAccess,
    isPending: isWatchPending,
  } = useWatchedContent(address, { autoRead: false });
  const {
    followedItems,
    followedWallets,
    isLoading: followedProfilesLoading,
    toggleFollow,
    requestReadAccess: requestFollowReadAccess,
    isPending: isFollowPending,
  } = useFollowedProfiles(address, { autoRead: false });
  const { discoverSignals, isLoading: discoverSignalsLoading } = useDiscoverSignals(address, {
    watchedItems,
    followedItems,
  });

  const feedRequestLimit = contentParam
    ? undefined
    : Math.max(FEED_PAGE_SIZE * 2, visibleCount + FEED_PREFETCH_BUFFER + 1);

  const watchedContentOrder = useMemo(() => {
    const seen = new Set<string>();
    const ids: bigint[] = [];
    for (const item of watchedItems) {
      if (seen.has(item.contentId)) continue;
      seen.add(item.contentId);
      ids.push(BigInt(item.contentId));
    }
    return ids;
  }, [watchedItems]);

  const votedContentOrder = useMemo(() => {
    const seen = new Set<string>();
    const ids: bigint[] = [];
    for (const vote of votes) {
      const contentId = vote.contentId.toString();
      if (seen.has(contentId)) continue;
      seen.add(contentId);
      ids.push(vote.contentId);
    }
    return ids;
  }, [votes]);

  const settlingSoonContentOrder = useMemo(() => {
    const seen = new Set<string>();
    const ids: bigint[] = [];
    for (const item of discoverSignals.settlingSoon) {
      if (seen.has(item.contentId)) continue;
      seen.add(item.contentId);
      ids.push(BigInt(item.contentId));
    }
    return ids;
  }, [discoverSignals.settlingSoon]);

  const followedCuratorContentOrder = useMemo(() => {
    const seen = new Set<string>();
    const ids: bigint[] = [];
    for (const item of discoverSignals.followedSubmissions) {
      if (seen.has(item.contentId)) continue;
      seen.add(item.contentId);
      ids.push(BigInt(item.contentId));
    }
    return ids;
  }, [discoverSignals.followedSubmissions]);

  const activeCategoryId = useMemo(() => {
    if (activeCategory === ALL_FILTER || activeCategory === BROKEN_FILTER) {
      return undefined;
    }
    return categoryNameToId.get(activeCategory);
  }, [activeCategory, categoryNameToId]);

  const scopedContentIds = useMemo(() => {
    switch (scope) {
      case "watched":
        return watchedContentOrder;
      case "my_votes":
        return votedContentOrder;
      case "settling_soon":
        return settlingSoonContentOrder;
      case "followed_curators":
        return followedCuratorContentOrder;
      default:
        return undefined;
    }
  }, [followedCuratorContentOrder, scope, settlingSoonContentOrder, votedContentOrder, watchedContentOrder]);

  const feedContentIds = useMemo(() => {
    if (!scopedContentIds) return undefined;
    if (feedRequestLimit === undefined) return scopedContentIds;
    return scopedContentIds.slice(0, feedRequestLimit);
  }, [scopedContentIds, feedRequestLimit]);

  const {
    feed,
    isLoading,
    totalContent: serverTotalContent,
    hasMore: serverHasMoreFeed,
  } = useContentFeed(address, {
    categoryId: activeCategoryId,
    contentIds: feedContentIds,
    limit: feedRequestLimit,
    searchQuery: searchQuery.trim() || undefined,
    sortBy: isSearchMode ? effectiveSearchSortBy : "newest",
    submitter: scope === "my_submissions" ? address : undefined,
  });
  const totalContent = scopedContentIds?.length ?? serverTotalContent;
  const hasMoreFeed = scopedContentIds ? feed.length < totalContent : serverHasMoreFeed;
  const { categoryScores, hasPreferences } = useUserPreferences(feed, address);
  const voteCounts = useCategoryPopularity(feed);

  // Filter & sort state
  const votedContentIds = useMemo(() => new Set(votes.map(vote => vote.contentId.toString())), [votes]);
  const watchedOrderMap = useMemo(() => {
    const order = new Map<string, number>();
    watchedItems.forEach((item, index) => {
      if (!order.has(item.contentId)) {
        order.set(item.contentId, index);
      }
    });
    return order;
  }, [watchedItems]);
  const voteOrderMap = useMemo(() => {
    const order = new Map<string, number>();
    votes.forEach((vote, index) => {
      const contentId = vote.contentId.toString();
      if (!order.has(contentId)) {
        order.set(contentId, index);
      }
    });
    return order;
  }, [votes]);
  const settlingSoonOrderMap = useMemo(() => {
    const order = new Map<string, number>();
    discoverSignals.settlingSoon.forEach((item, index) => {
      const contentId = item.contentId.toString();
      if (!order.has(contentId)) {
        order.set(contentId, index);
      }
    });
    return order;
  }, [discoverSignals.settlingSoon]);
  const followedCuratorOrderMap = useMemo(() => {
    const order = new Map<string, number>();
    discoverSignals.followedSubmissions.forEach((item, index) => {
      const contentId = item.contentId.toString();
      if (!order.has(contentId)) {
        order.set(contentId, index);
      }
    });
    return order;
  }, [discoverSignals.followedSubmissions]);
  const settlingSoonContentIds = useMemo(
    () => new Set(discoverSignals.settlingSoon.map(item => item.contentId.toString())),
    [discoverSignals.settlingSoon],
  );
  const followedCuratorContentIds = useMemo(
    () => new Set(discoverSignals.followedSubmissions.map(item => item.contentId.toString())),
    [discoverSignals.followedSubmissions],
  );
  const scopeLoading =
    (scope === "watched" && !!address && watchedLoading) ||
    (scope === "my_votes" && !!address && votesLoading) ||
    ((scope === "settling_soon" || scope === "followed_curators") && !!address && discoverSignalsLoading) ||
    (scope === "followed_curators" && !!address && followedProfilesLoading);
  const normalizedAddress = address?.toLowerCase();

  useEffect(() => {
    if (!address && scope !== "all") {
      setScope("all");
    }
  }, [address, scope]);

  // Sync category selection with URL hash (e.g. /#books, /#board-games)
  const selectCategory = useCallback((name: string) => {
    setActiveCategory(name);
    const hash = name === ALL_FILTER ? "" : `#${slugify(name)}`;
    history.replaceState(null, "", hash || window.location.pathname + window.location.search);
  }, []);

  const requestedActiveId = useMemo(() => {
    if (!contentParam) return null;
    try {
      return BigInt(contentParam);
    } catch {
      return null;
    }
  }, [contentParam]);

  const loadMoreRef = useRef<HTMLDivElement>(null);
  const queueRailRef = useRef<HTMLDivElement>(null);

  // Voting state
  const [stakeModal, setStakeModal] = useState<{
    isOpen: boolean;
    isUp: boolean;
    contentId: bigint;
    categoryId: bigint;
  }>({ isOpen: false, isUp: false, contentId: 0n, categoryId: 0n });
  const { commitVote, isCommitting, error: voteError } = useRoundVote();
  // Apply search, category filter, and scope before sorting
  const filteredFeed = useMemo(() => {
    let items = feed.filter(item => !isContentItemBlocked(item));

    // Broken URL filter: show only broken when selected, exclude broken otherwise
    if (activeCategory === BROKEN_FILTER) {
      items = items.filter(item => item.isValidUrl === false);
    } else {
      items = items.filter(item => item.isValidUrl !== false);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter(
        item =>
          item.title.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q) ||
          item.url.toLowerCase().includes(q) ||
          item.tags.some(tag => tag.toLowerCase().includes(q)),
      );
    }

    if (activeCategory !== ALL_FILTER && activeCategory !== BROKEN_FILTER && activeCategoryId === undefined) {
      items = items.filter(item => item.tags.includes(activeCategory));
    }

    switch (scope) {
      case "watched":
        items = items.filter(item => watchedContentIds.has(item.id.toString()));
        break;
      case "my_votes":
        items = items.filter(item => votedContentIds.has(item.id.toString()));
        break;
      case "my_submissions":
        items = items.filter(item => item.isOwnContent);
        break;
      case "settling_soon":
        items = items.filter(item => settlingSoonContentIds.has(item.id.toString()));
        break;
      case "followed_curators":
        items = items.filter(item => followedCuratorContentIds.has(item.id.toString()));
        break;
      default:
        break;
    }

    return items;
  }, [
    feed,
    searchQuery,
    activeCategory,
    activeCategoryId,
    scope,
    watchedContentIds,
    votedContentIds,
    settlingSoonContentIds,
    followedCuratorContentIds,
  ]);

  const displayFeed = useMemo(() => {
    const items = [...filteredFeed];

    if (isSearchMode) {
      switch (effectiveSearchSortBy) {
        case "newest":
          items.sort((a, b) => Number(b.id - a.id));
          break;
        case "oldest":
          items.sort((a, b) => Number(a.id - b.id));
          break;
        case "highest_rated":
        case "lowest_rated":
          return items;
      }
      return items;
    }

    switch (scope) {
      case "watched":
        items.sort((a, b) => {
          const indexA = watchedOrderMap.get(a.id.toString()) ?? Number.MAX_SAFE_INTEGER;
          const indexB = watchedOrderMap.get(b.id.toString()) ?? Number.MAX_SAFE_INTEGER;
          return indexA - indexB;
        });
        break;
      case "my_votes":
        items.sort((a, b) => {
          const indexA = voteOrderMap.get(a.id.toString()) ?? Number.MAX_SAFE_INTEGER;
          const indexB = voteOrderMap.get(b.id.toString()) ?? Number.MAX_SAFE_INTEGER;
          return indexA - indexB;
        });
        break;
      case "my_submissions":
        items.sort((a, b) => Number(b.id - a.id));
        break;
      case "settling_soon":
        items.sort((a, b) => {
          const indexA = settlingSoonOrderMap.get(a.id.toString()) ?? Number.MAX_SAFE_INTEGER;
          const indexB = settlingSoonOrderMap.get(b.id.toString()) ?? Number.MAX_SAFE_INTEGER;
          return indexA - indexB;
        });
        break;
      case "followed_curators":
        items.sort((a, b) => {
          const indexA = followedCuratorOrderMap.get(a.id.toString()) ?? Number.MAX_SAFE_INTEGER;
          const indexB = followedCuratorOrderMap.get(b.id.toString()) ?? Number.MAX_SAFE_INTEGER;
          return indexA - indexB;
        });
        break;
      default:
        if (hasPreferences && activeCategory === ALL_FILTER) {
          items.sort((a, b) => {
            const scoreA = categoryScores.get(a.categoryId.toString()) ?? 0;
            const scoreB = categoryScores.get(b.categoryId.toString()) ?? 0;
            if (scoreA !== scoreB) return scoreB - scoreA;
            return Number(b.id - a.id);
          });
        } else {
          items.sort((a, b) => Number(b.id - a.id));
        }
        break;
    }

    return items;
  }, [
    filteredFeed,
    isSearchMode,
    activeCategory,
    effectiveSearchSortBy,
    categoryScores,
    hasPreferences,
    scope,
    watchedOrderMap,
    voteOrderMap,
    settlingSoonOrderMap,
    followedCuratorOrderMap,
  ]);

  const {
    activeItem: primaryItem,
    activeSourceIndex,
    selectContent,
    visibleItems: visibleFeedItems,
  } = useVoteFeedStage(displayFeed, {
    visibleCount,
    requestedActiveId,
    windowSize: 7,
  });

  const submitterAddresses = useMemo(() => {
    return visibleFeedItems.map(item => item.submitter);
  }, [visibleFeedItems]);
  const queuePositionMap = useMemo(() => {
    const positions = new Map<string, number>();
    displayFeed.forEach((item, index) => {
      positions.set(item.id.toString(), index);
    });
    return positions;
  }, [displayFeed]);
  const queueLayout = useVoteQueueLayout(queueRailRef);
  const queuePages = useMemo(() => {
    if (queueLayout.rows === 1) {
      return [visibleFeedItems];
    }

    return chunkVoteQueueItems(visibleFeedItems, queueLayout.pageSize);
  }, [queueLayout.pageSize, queueLayout.rows, visibleFeedItems]);
  const queueGridTemplateColumns = useMemo(() => {
    if (queueLayout.rows !== 2) return undefined;
    return `repeat(${queueLayout.columns}, minmax(0, ${queueLayout.cardWidthPx}px))`;
  }, [queueLayout.cardWidthPx, queueLayout.columns, queueLayout.rows]);
  const queuePageWidth = useMemo(() => {
    if (queueLayout.rows !== 2) return undefined;
    return queueLayout.columns * queueLayout.cardWidthPx + (queueLayout.columns - 1) * queueLayout.gapPx;
  }, [queueLayout]);

  const { profiles: submitterProfiles } = useSubmitterProfiles(submitterAddresses);

  // Fetch voter accuracy stats and merge into profiles
  const { statsMap: accuracyMap } = useVoterAccuracyBatch(submitterAddresses);

  const enrichedProfiles = useMemo(() => {
    const result: Record<string, SubmitterProfile> = {};
    for (const [addr, profile] of Object.entries(submitterProfiles)) {
      const stats = accuracyMap[addr];
      result[addr] = {
        ...profile,
        winRate: stats?.winRate,
        totalSettledVotes: stats?.totalSettledVotes,
      };
    }
    return result;
  }, [submitterProfiles, accuracyMap]);

  const canLoadMore = visibleCount < displayFeed.length || hasMoreFeed;

  // Reset visible count when filters change
  useEffect(() => {
    setVisibleCount(FEED_PAGE_SIZE);
  }, [searchQuery, activeCategory, scope, sortBy]);

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

  const lastQueuePrefetchVisibleCountRef = useRef<number | null>(null);

  useEffect(() => {
    const remainingLoadedItems = displayFeed.length - (activeSourceIndex + 1);
    const shouldPrefetchQueue = remainingLoadedItems < 8 && (visibleCount < displayFeed.length || hasMoreFeed);

    if (!shouldPrefetchQueue) {
      lastQueuePrefetchVisibleCountRef.current = null;
      return;
    }

    if (lastQueuePrefetchVisibleCountRef.current === visibleCount) {
      return;
    }

    lastQueuePrefetchVisibleCountRef.current = visibleCount;
    setVisibleCount(prev => prev + FEED_PAGE_SIZE);
  }, [activeSourceIndex, displayFeed.length, hasMoreFeed, visibleCount]);

  useEffect(() => {
    const selectedNextItem = activeSourceIndex >= 0 ? (displayFeed[activeSourceIndex + 1] ?? null) : null;
    const nextThumbnailSrc = selectedNextItem ? getVoteFeedThumbnailSrc(selectedNextItem) : null;
    if (!nextThumbnailSrc) return;

    const image = new window.Image();
    image.decoding = "async";
    image.src = nextThumbnailSrc;
  }, [activeSourceIndex, displayFeed]);

  useEffect(() => {
    const rail = queueRailRef.current;
    if (!rail || !primaryItem) return;

    const selectedThumbnail = rail.querySelector<HTMLElement>(`[data-thumbnail-id="${primaryItem.id.toString()}"]`);
    if (!selectedThumbnail) return;

    selectedThumbnail.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [primaryItem]);

  // Infinite scroll with Intersection Observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && canLoadMore) {
          setVisibleCount(prev => prev + FEED_PAGE_SIZE);
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
    };
  }, [canLoadMore]);

  const handleButtonVote = useCallback((item: ContentItem, isUp: boolean) => {
    setStakeModal({ isOpen: true, isUp, contentId: item.id, categoryId: item.categoryId });
  }, []);

  const handleConfirmStake = useCallback(
    async (stakeAmount: number) => {
      const item = displayFeed.find(i => i.id === stakeModal.contentId);
      const success = await commitVote({
        contentId: stakeModal.contentId,
        isUp: stakeModal.isUp,
        stakeAmount,
        submitter: item?.submitter,
      });
      setStakeModal(prev => ({ ...prev, isOpen: false }));
      if (success) {
        notification.success(`Vote committed! Stake: ${stakeAmount} cREP`);
        if (isFirstVote) {
          markVoteCompleted();
          notification.info("Great first vote! Keep going to build your reputation.", { duration: 5000 });
        }
      }
    },
    [commitVote, displayFeed, isFirstVote, markVoteCompleted, stakeModal],
  );

  const handleCancelStake = () => {
    setStakeModal(prev => ({ ...prev, isOpen: false }));
  };

  const replaceContentQueryParam = useCallback((contentId: bigint | null) => {
    const url = new URL(window.location.href);
    if (contentId === null) {
      url.searchParams.delete("content");
    } else {
      url.searchParams.set("content", contentId.toString());
    }
    history.replaceState(null, "", url.toString());
  }, []);

  const focusQueueThumbnail = useCallback((contentId: bigint | null) => {
    if (contentId === null || typeof window === "undefined") return;

    window.requestAnimationFrame(() => {
      const rail = queueRailRef.current;
      if (!rail) return;

      const thumbnail = rail.querySelector<HTMLElement>(`[data-thumbnail-id="${contentId.toString()}"]`);
      thumbnail?.focus({ preventScroll: true });
    });
  }, []);

  const handleSelectByIndex = useCallback(
    (targetIndex: number, options?: { focusQueue?: boolean }) => {
      if (targetIndex < 0 || targetIndex >= displayFeed.length) return false;

      const targetItem = displayFeed[targetIndex];
      if (!targetItem) return false;

      if (activeSourceIndex !== -1 && targetIndex === activeSourceIndex) {
        if (options?.focusQueue) {
          focusQueueThumbnail(targetItem.id);
        }
        return false;
      }

      if (activeSourceIndex !== -1) {
        setNavigationDirection(targetIndex > activeSourceIndex ? "next" : "previous");
      }

      selectContent(targetItem.id);
      replaceContentQueryParam(targetItem.id);

      if (options?.focusQueue) {
        focusQueueThumbnail(targetItem.id);
      }

      return true;
    },
    [activeSourceIndex, displayFeed, focusQueueThumbnail, replaceContentQueryParam, selectContent],
  );

  const handleSelectCard = useCallback(
    (id: bigint, categoryId: bigint) => {
      trackContentClick(id, categoryId);
      const targetIndex = displayFeed.findIndex(item => item.id === id);
      if (targetIndex === -1) return;
      handleSelectByIndex(targetIndex);
    },
    [displayFeed, handleSelectByIndex],
  );

  const handleNavigateSelection = useCallback(
    (direction: "previous" | "next", options?: { focusQueue?: boolean }) => {
      if (displayFeed.length === 0 || activeSourceIndex === -1) return false;

      const delta = direction === "next" ? 1 : -1;
      const nextIndex = Math.min(Math.max(activeSourceIndex + delta, 0), displayFeed.length - 1);
      return handleSelectByIndex(nextIndex, options);
    },
    [activeSourceIndex, displayFeed.length, handleSelectByIndex],
  );

  const handleSelectPrevious = useCallback(() => {
    handleNavigateSelection("previous");
  }, [handleNavigateSelection]);

  const handleSelectNext = useCallback(() => {
    handleNavigateSelection("next");
  }, [handleNavigateSelection]);

  const handleQueueKeyboardNavigate = useCallback(
    (action: "previous" | "next" | "first" | "last", currentId: bigint) => {
      if (displayFeed.length === 0) return;

      if (action === "first") {
        handleSelectByIndex(0, { focusQueue: true });
        return;
      }

      if (action === "last") {
        handleSelectByIndex(displayFeed.length - 1, { focusQueue: true });
        return;
      }

      const currentIndex = displayFeed.findIndex(item => item.id === currentId);
      if (currentIndex === -1) return;

      const nextIndex = Math.min(Math.max(currentIndex + (action === "next" ? 1 : -1), 0), displayFeed.length - 1);
      handleSelectByIndex(nextIndex, { focusQueue: true });
    },
    [displayFeed, handleSelectByIndex],
  );

  const canNavigateCards = displayFeed.length > 1 && !isCommitting && !stakeModal.isOpen;
  const canSwipeNavigate = supportsTouchNavigation && canNavigateCards;
  const canWheelNavigate = !supportsTouchNavigation && canNavigateCards;

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (stakeModal.isOpen) return;

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

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        handleNavigateSelection("previous");
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        handleNavigateSelection("next");
        return;
      }

      if (event.key === "Home" || event.key === "PageUp") {
        event.preventDefault();
        handleSelectByIndex(0);
        return;
      }

      if (event.key === "End" || event.key === "PageDown") {
        event.preventDefault();
        handleSelectByIndex(displayFeed.length - 1);
      }
    };

    window.addEventListener("keydown", handleWindowKeyDown);
    return () => window.removeEventListener("keydown", handleWindowKeyDown);
  }, [displayFeed.length, handleNavigateSelection, handleSelectByIndex, stakeModal.isOpen]);

  const handleCardDragEnd = useCallback(
    (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      if (!canSwipeNavigate) return;

      const offsetX = info.offset.x;
      const velocityX = info.velocity.x;

      if (offsetX <= -CARD_SWIPE_THRESHOLD || velocityX <= -500) {
        handleNavigateSelection("next");
        return;
      }

      if (offsetX >= CARD_SWIPE_THRESHOLD || velocityX >= 500) {
        handleNavigateSelection("previous");
      }
    },
    [canSwipeNavigate, handleNavigateSelection],
  );

  const handleToggleWatch = useCallback(
    async (contentId: bigint) => {
      const result = await toggleWatch(contentId);

      if (!result.ok) {
        if (result.reason === "not_connected") {
          notification.info("Connect your wallet to watch content.");
          openConnectModal?.();
          return;
        }

        if (result.reason === "rejected") {
          return;
        }

        notification.error(result.error || "Failed to update watchlist");
        return;
      }

      notification.success(result.watched ? "Added to your watchlist" : "Removed from your watchlist");
    },
    [openConnectModal, toggleWatch],
  );

  const handleToggleFollow = useCallback(
    async (targetAddress: string) => {
      const result = await toggleFollow(targetAddress);

      if (!result.ok) {
        if (result.reason === "not_connected") {
          notification.info("Connect your wallet to follow curators.");
          openConnectModal?.();
          return;
        }

        if (result.reason === "self_follow" || result.reason === "rejected") {
          return;
        }

        notification.error(result.error || "Failed to update follows");
        return;
      }

      notification.success(result.following ? "Following curator" : "Unfollowed curator");
    },
    [openConnectModal, toggleFollow],
  );

  const handleScopeChange = useCallback(
    async (nextScope: ScopeOption) => {
      if (nextScope === "watched") {
        const result = await requestWatchReadAccess();
        if (!result.ok) {
          if (result.reason === "not_connected") {
            notification.info("Connect your wallet to view your watchlist.");
            openConnectModal?.();
            return;
          }

          if (result.reason !== "rejected") {
            notification.error(result.error || "Failed to unlock your watchlist");
          }
          return;
        }

        setScope("watched");
        return;
      }

      if (nextScope !== "followed_curators") {
        setScope(nextScope);
        return;
      }

      const result = await requestFollowReadAccess();
      if (!result.ok) {
        if (result.reason === "not_connected") {
          notification.info("Connect your wallet to view curators you follow.");
          openConnectModal?.();
          return;
        }

        if (result.reason !== "rejected") {
          notification.error(result.error || "Failed to unlock your follow list");
        }
        return;
      }

      setScope("followed_curators");
    },
    [openConnectModal, requestFollowReadAccess, requestWatchReadAccess],
  );

  // Count broken URLs for the filter pill
  const brokenCount = useMemo(() => {
    return feed.filter(item => !isContentItemBlocked(item) && item.isValidUrl === false).length;
  }, [feed]);

  // Build category filter list sorted by popularity (vote count)
  const categories = useMemo(() => {
    const sorted = [...websiteCategories].sort((a, b) => {
      const countA = voteCounts.get(a.id.toString()) ?? 0;
      const countB = voteCounts.get(b.id.toString()) ?? 0;
      return countB - countA;
    });
    const cats = [ALL_FILTER, ...sorted.map(cat => cat.name)];
    if (brokenCount > 0) cats.push(BROKEN_FILTER);
    return cats;
  }, [websiteCategories, voteCounts, brokenCount]);

  // Apply URL hash to category selection (on mount and hash change)
  useEffect(() => {
    const applyHash = () => {
      const hash = window.location.hash.replace(/^#/, "");
      if (!hash) return;
      const match = categories.find(c => slugify(c) === hash);
      if (match) setActiveCategory(match);
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, [categories]);

  const emptyStateMessage = useMemo(() => {
    if (searchQuery) {
      return `No results for "${searchQuery}"`;
    }

    if (scope === "watched") {
      return address ? "You aren't watching any content yet." : "Connect your wallet to view watched content.";
    }

    if (scope === "my_votes") {
      return address ? "You haven't voted on any content yet." : "Connect your wallet to view your votes.";
    }

    if (scope === "my_submissions") {
      return address ? "You haven't submitted any content yet." : "Connect your wallet to view your submissions.";
    }

    if (scope === "settling_soon") {
      return address
        ? "Nothing you are tracking looks close to settlement right now."
        : "Connect your wallet to view rounds settling soon.";
    }

    if (scope === "followed_curators") {
      return address
        ? "Follow a few curators to turn this into a live feed."
        : "Connect your wallet to view activity from curators you follow.";
    }

    if (activeCategory === BROKEN_FILTER) {
      return "No broken URLs detected.";
    }

    if (activeCategory === ALL_FILTER) {
      return "No content submitted yet. Be the first!";
    }

    return `No content found in "${activeCategory}".`;
  }, [activeCategory, address, scope, searchQuery]);

  const activeCardRegionRef = useQueueNavigation<HTMLDivElement>({
    enabled: Boolean(primaryItem && canNavigateCards),
    enableWheel: canWheelNavigate,
    onNavigate: handleNavigateSelection,
  });

  return (
    <AppPageShell contentClassName="2xl:max-w-[1600px]">
      <VotingGuide />
      <div
        className="mb-4 flex shrink-0 flex-wrap items-center gap-2 sm:gap-3 xl:mb-2 xl:flex-nowrap"
        data-disable-queue-wheel="true"
      >
        <CategoryFilter
          categories={categories}
          activeCategory={activeCategory}
          onSelect={selectCategory}
          pillClassName={(cat, isActive) => {
            if (cat !== BROKEN_FILTER) return undefined;
            return isActive
              ? "bg-warning/20 text-warning border border-warning/40"
              : "bg-base-200 text-warning/70 hover:bg-warning/10";
          }}
        />
        {address ? (
          <FeedScopeFilter
            value={scope}
            options={SCOPE_OPTIONS}
            onChange={value => {
              void handleScopeChange(value as ScopeOption);
            }}
            label="Feed"
          />
        ) : null}
        <div className="shrink-0 flex items-center">
          <StreakCounter />
        </div>
      </div>

      {isSearchMode ? (
        <div className="mb-5 flex shrink-0 flex-wrap items-center gap-2 xl:mb-3" data-disable-queue-wheel="true">
          <div className="rounded-full bg-base-200 px-3 py-2 text-sm text-base-content/70">
            Results for <span className="font-medium text-white">&quot;{searchQuery.trim()}&quot;</span>
          </div>
          <select
            value={effectiveSearchSortBy}
            onChange={e => setSortBy(e.target.value as SearchSortOption)}
            className="select select-sm bg-base-200 text-base font-medium border-none focus:outline-none w-auto"
            aria-label="Sort search results"
          >
            {SEARCH_SORT_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="min-w-0">
        {/* Main content */}
        {isLoading || categoriesLoading || scopeLoading ? (
          <div className="flex justify-center py-16 xl:py-10">
            <span className="loading loading-spinner loading-lg text-primary"></span>
          </div>
        ) : displayFeed.length === 0 ? (
          <div className="py-16 text-center text-base text-base-content/30 xl:py-10">{emptyStateMessage}</div>
        ) : (
          <div ref={activeCardRegionRef} className="flex min-h-0 flex-col gap-5 xl:gap-4">
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
                  <motion.div
                    key={primaryItem.id.toString()}
                    custom={navigationDirection}
                    className="touch-pan-y"
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
                    onDragEnd={handleCardDragEnd}
                  >
                    <FeedVoteCard
                      item={primaryItem}
                      submitterProfile={enrichedProfiles[primaryItem.submitter.toLowerCase()]}
                      onVote={handleButtonVote}
                      onToggleWatch={handleToggleWatch}
                      onToggleFollow={handleToggleFollow}
                      watched={watchedContentIds.has(primaryItem.id.toString())}
                      watchPending={isWatchPending(primaryItem.id)}
                      following={followedWallets.has(primaryItem.submitter.toLowerCase())}
                      followPending={isFollowPending(primaryItem.submitter)}
                      normalizedAddress={normalizedAddress}
                      isCommitting={isCommitting}
                      voteError={voteError}
                      address={address}
                      onPrevious={handleSelectPrevious}
                      onNext={handleSelectNext}
                      canPrevious={activeSourceIndex > 0}
                      canNext={activeSourceIndex >= 0 && activeSourceIndex < displayFeed.length - 1}
                    />
                  </motion.div>
                </AnimatePresence>
              </div>
            ) : null}

            {visibleFeedItems.length > 0 ? (
              <motion.section
                key={primaryItem?.id.toString() ?? "queue-empty"}
                className="shrink-0"
                aria-label="Up next queue"
                initial={{ opacity: 0.82, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, ease: VOTE_CARD_TRANSITION_EASE }}
              >
                <div
                  ref={queueRailRef}
                  data-disable-queue-wheel="true"
                  className={`min-w-0 overflow-x-auto snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
                    queueLayout.rows === 2 ? "flex items-start gap-4 xl:gap-3" : "flex items-stretch gap-3 xl:gap-2.5"
                  }`}
                  aria-label="Content queue"
                >
                  {queueLayout.rows === 2
                    ? queuePages.map((pageItems, pageIndex) => (
                        <div
                          key={`queue-page-${pageIndex}`}
                          className="grid shrink-0 content-start gap-3 snap-start xl:gap-2.5"
                          style={{
                            gridTemplateColumns: queueGridTemplateColumns,
                            width: queuePageWidth,
                          }}
                        >
                          {pageItems.map(item => (
                            <FeedQueueCard
                              key={item.id.toString()}
                              item={item}
                              onSelect={handleSelectCard}
                              onNavigate={handleQueueKeyboardNavigate}
                              queuePosition={queuePositionMap.get(item.id.toString()) ?? 0}
                              selected={item.id === primaryItem?.id}
                            />
                          ))}
                        </div>
                      ))
                    : visibleFeedItems.map(item => (
                        <FeedQueueCard
                          key={item.id.toString()}
                          item={item}
                          onSelect={handleSelectCard}
                          onNavigate={handleQueueKeyboardNavigate}
                          queuePosition={queuePositionMap.get(item.id.toString()) ?? 0}
                          selected={item.id === primaryItem?.id}
                        />
                      ))}
                </div>
              </motion.section>
            ) : null}

            {canLoadMore ? (
              <div ref={loadMoreRef} className="flex justify-center py-8 xl:hidden">
                <span className="loading loading-spinner loading-md text-primary"></span>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Stake selector modal */}
      <StakeSelector
        isOpen={stakeModal.isOpen}
        isUp={stakeModal.isUp}
        contentId={stakeModal.contentId}
        categoryId={stakeModal.categoryId}
        onConfirm={handleConfirmStake}
        onCancel={handleCancelStake}
      />
    </AppPageShell>
  );
};

const Home: NextPage = () => (
  <Suspense>
    <HomeInner />
  </Suspense>
);

export default Home;
