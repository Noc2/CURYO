"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import type { NextPage } from "next";
import { useAccount } from "wagmi";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { CategoryFilter } from "~~/components/CategoryFilter";
import { VotingGuide } from "~~/components/onboarding/VotingGuide";
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
import { useVoterAccuracyBatch } from "~~/hooks/useVoterAccuracyBatch";
import { useWatchedContent } from "~~/hooks/useWatchedContent";
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
  const isSearchMode = searchQuery.trim().length > 0;
  const effectiveSearchSortBy: SearchSortOption = sortBy === "for_you" ? "newest" : sortBy;
  const { categories: websiteCategories, categoryNameToId, isLoading: categoriesLoading } = useCategoryRegistry();
  const { votes, isLoading: votesLoading } = useVoteHistory(address);
  const {
    watchedItems,
    watchedContentIds,
    isLoading: watchedLoading,
    toggleWatch,
    isPending: isWatchPending,
  } = useWatchedContent(address, { autoRead: true });
  const {
    followedItems,
    followedWallets,
    isLoading: followedProfilesLoading,
    toggleFollow,
    isPending: isFollowPending,
  } = useFollowedProfiles(address, { autoRead: true });
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
          item.goal.toLowerCase().includes(q) ||
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
    orderedItems: orderedDisplayFeed,
    promoteNext,
    selectContent,
    upNextItems: queueItems,
    visibleItems: visibleFeedItems,
  } = useVoteFeedStage(displayFeed, {
    visibleCount,
    requestedActiveId,
  });

  const submitterAddresses = useMemo(() => {
    return visibleFeedItems.map(item => item.submitter);
  }, [visibleFeedItems]);

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

  const canLoadMore = visibleCount < orderedDisplayFeed.length || hasMoreFeed;
  const activeStagePosition = activeSourceIndex >= 0 ? activeSourceIndex + 1 : 0;
  const stageTotal = totalContent > 0 ? totalContent : displayFeed.length;
  const nextQueueItem = queueItems[0] ?? null;

  // Reset visible count when filters change
  useEffect(() => {
    setVisibleCount(FEED_PAGE_SIZE);
  }, [searchQuery, activeCategory, scope, sortBy]);

  const lastQueuePrefetchVisibleCountRef = useRef<number | null>(null);

  useEffect(() => {
    const shouldPrefetchQueue = queueItems.length < 8 && (visibleCount < orderedDisplayFeed.length || hasMoreFeed);

    if (!shouldPrefetchQueue) {
      lastQueuePrefetchVisibleCountRef.current = null;
      return;
    }

    if (lastQueuePrefetchVisibleCountRef.current === visibleCount) {
      return;
    }

    lastQueuePrefetchVisibleCountRef.current = visibleCount;
    setVisibleCount(prev => prev + FEED_PAGE_SIZE);
  }, [hasMoreFeed, orderedDisplayFeed.length, queueItems.length, visibleCount]);

  useEffect(() => {
    const nextThumbnailSrc = nextQueueItem ? getVoteFeedThumbnailSrc(nextQueueItem) : null;
    if (!nextThumbnailSrc) return;

    const image = new window.Image();
    image.decoding = "async";
    image.src = nextThumbnailSrc;
  }, [nextQueueItem]);

  useEffect(() => {
    const rail = queueRailRef.current;
    if (!rail) return;
    rail.scrollTo({ left: 0, behavior: "smooth" });
  }, [primaryItem?.id]);

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

  // Vote handlers
  const handleSwipe = useCallback((item: ContentItem, direction: "left" | "right") => {
    const isUp = direction === "right";
    setStakeModal({ isOpen: true, isUp, contentId: item.id, categoryId: item.categoryId });
  }, []);

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

  const handleSelectCard = useCallback(
    (id: bigint, categoryId: bigint) => {
      trackContentClick(id, categoryId);
      selectContent(id);
      replaceContentQueryParam(id);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [replaceContentQueryParam, selectContent],
  );

  const handlePromoteNext = useCallback(() => {
    const nextItem = promoteNext();
    if (!nextItem) return false;
    replaceContentQueryParam(nextItem.id);
    return true;
  }, [promoteNext, replaceContentQueryParam]);

  const scrollQueueRailBy = useCallback((direction: "prev" | "next") => {
    const rail = queueRailRef.current;
    if (!rail) return;

    const delta = Math.max(rail.clientWidth * 0.72, 220);
    rail.scrollBy({
      left: direction === "next" ? delta : -delta,
      behavior: "smooth",
    });
  }, []);

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
    enabled: Boolean(primaryItem && queueItems.length > 0 && !isCommitting && !stakeModal.isOpen),
    onAdvance: handlePromoteNext,
  });

  return (
    <div className="flex grow flex-col items-center px-4 pt-4 pb-8 xl:h-full xl:min-h-0 xl:overflow-hidden xl:pb-4">
      <div className="w-full max-w-6xl xl:flex xl:h-full xl:min-h-0 xl:flex-col">
        <VotingGuide />
        <div className="mb-4 flex shrink-0 flex-wrap items-center gap-2 sm:gap-3 xl:flex-nowrap">
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
              onChange={value => setScope(value as ScopeOption)}
              label="Feed"
            />
          ) : null}
          <div className="shrink-0 flex items-center">
            <StreakCounter />
          </div>
        </div>

        {isSearchMode ? (
          <div className="mb-5 flex shrink-0 flex-wrap items-center gap-2">
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

        <div className="min-w-0 xl:flex-1 xl:min-h-0 xl:overflow-hidden">
          {/* Main content */}
          {isLoading || categoriesLoading || scopeLoading ? (
            <div className="flex justify-center py-16 xl:h-full xl:items-center xl:py-0">
              <span className="loading loading-spinner loading-lg text-primary"></span>
            </div>
          ) : displayFeed.length === 0 ? (
            <div className="py-16 text-center text-base text-base-content/30 xl:flex xl:h-full xl:items-center xl:justify-center xl:py-0">
              {emptyStateMessage}
            </div>
          ) : (
            <div className="space-y-5 xl:flex xl:h-full xl:min-h-0 xl:flex-col xl:overflow-hidden xl:space-y-4">
              {isCommitting ? (
                <div className="flex shrink-0 items-center justify-center">
                  <span className="text-base text-base-content/50">
                    <span className="loading loading-spinner loading-xs mr-1.5"></span>
                    Committing...
                  </span>
                </div>
              ) : null}

              {primaryItem ? (
                <div className="space-y-3 xl:flex xl:min-h-0 xl:flex-1 xl:flex-col">
                  <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 text-sm">
                    <div className="flex flex-wrap items-center gap-2 text-base-content/60">
                      <span className="rounded-full bg-base-content/[0.05] px-3 py-1.5 font-medium">
                        {activeStagePosition > 0 ? `Card ${activeStagePosition} of ${stageTotal}` : "Live queue"}
                      </span>
                      {nextQueueItem ? (
                        <span className="rounded-full bg-primary/10 px-3 py-1.5 font-medium text-primary">
                          Next:{" "}
                          {nextQueueItem.goal.length > 48
                            ? `${nextQueueItem.goal.slice(0, 45)}...`
                            : nextQueueItem.goal}
                        </span>
                      ) : null}
                    </div>
                    <span className="text-base-content/45">
                      {queueItems.length > 0 ? "Scroll or swipe up to promote the next card." : "No queued cards left."}
                    </span>
                  </div>
                  <div
                    key={primaryItem.id.toString()}
                    ref={activeCardRegionRef}
                    className="motion-safe:animate-vote-card-promote xl:min-h-0 xl:flex-1"
                  >
                    <FeedVoteCard
                      item={primaryItem}
                      submitterProfile={enrichedProfiles[primaryItem.submitter.toLowerCase()]}
                      onSwipe={handleSwipe}
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
                    />
                  </div>
                </div>
              ) : null}

              {queueItems.length > 0 ? (
                <section
                  key={primaryItem?.id.toString() ?? "queue-empty"}
                  className="space-y-3 motion-safe:animate-vote-queue-settle xl:flex-none"
                  aria-label="Up next queue"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-base-content/45">Up next</p>
                      <p className="text-sm text-base-content/55">
                        Scroll, tap, or click a card to promote it into the main voting stage.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-base-content/[0.05] px-3 py-1.5 text-sm font-medium text-base-content/60">
                        {queueItems.length} queued
                      </span>
                      <div className="hidden items-center gap-1 xl:flex">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm btn-circle border border-base-content/10 bg-base-content/[0.04] text-base-content/60 hover:border-primary/25 hover:text-primary"
                          onClick={() => scrollQueueRailBy("prev")}
                          aria-label="Scroll queued cards left"
                        >
                          <ChevronLeftIcon className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm btn-circle border border-base-content/10 bg-base-content/[0.04] text-base-content/60 hover:border-primary/25 hover:text-primary"
                          onClick={() => scrollQueueRailBy("next")}
                          aria-label="Scroll queued cards right"
                        >
                          <ChevronRightIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                  <div
                    ref={queueRailRef}
                    className="grid grid-cols-2 gap-3 xl:flex xl:gap-2.5 xl:overflow-x-auto xl:pb-2 xl:snap-x xl:snap-mandatory xl:[scrollbar-width:none] xl:[&::-webkit-scrollbar]:hidden"
                  >
                    {queueItems.map((item, index) => (
                      <FeedQueueCard
                        key={item.id.toString()}
                        item={item}
                        onSelect={handleSelectCard}
                        queuePosition={index + 1}
                        submitterProfile={enrichedProfiles[item.submitter.toLowerCase()]}
                      />
                    ))}
                  </div>
                </section>
              ) : null}

              {canLoadMore ? (
                <div ref={loadMoreRef} className="flex justify-center py-8 xl:hidden">
                  <span className="loading loading-spinner loading-md text-primary"></span>
                </div>
              ) : null}
            </div>
          )}
        </div>
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
    </div>
  );
};

const Home: NextPage = () => (
  <Suspense>
    <HomeInner />
  </Suspense>
);

export default Home;
