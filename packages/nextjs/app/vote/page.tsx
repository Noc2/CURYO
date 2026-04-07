"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import type { NextPage } from "next";
import { useAccount } from "wagmi";
import { CategoryFilter } from "~~/components/CategoryFilter";
import { AppPageShell } from "~~/components/shared/AppPageShell";
import { StreakCounter } from "~~/components/shared/StreakCounter";
import { VotingQuestionCard } from "~~/components/shared/VotingQuestionCard";
import { FeedScopeFilter } from "~~/components/vote/FeedScopeFilter";
import { VoteSignalRail } from "~~/components/vote/VoteSignalRail";
import { MIN_CONTENT_SEARCH_QUERY_LENGTH, isContentSearchQueryTooShort } from "~~/hooks/contentFeed/shared";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";
import { useCategoryPopularity } from "~~/hooks/useCategoryPopularity";
import { useCategoryRegistry } from "~~/hooks/useCategoryRegistry";
import type { ContentItem } from "~~/hooks/useContentFeed";
import { useContentFeed } from "~~/hooks/useContentFeed";
import { useCuryoConnectModal } from "~~/hooks/useCuryoConnectModal";
import { useDiscoverSignals } from "~~/hooks/useDiscoverSignals";
import { useFollowedProfiles } from "~~/hooks/useFollowedProfiles";
import { useInterestProfile } from "~~/hooks/useInterestProfile";
import { useOnboarding } from "~~/hooks/useOnboarding";
import { useRoundVote } from "~~/hooks/useRoundVote";
import { SubmitterProfile, useSubmitterProfiles } from "~~/hooks/useSubmitterProfiles";
import { useUnixTime } from "~~/hooks/useUnixTime";
import { useVoteFeedStage } from "~~/hooks/useVoteFeedStage";
import { useVoteHistoryQuery } from "~~/hooks/useVoteHistoryQuery";
import { useVoterAccuracyBatch } from "~~/hooks/useVoterAccuracyBatch";
import { useWatchedContent } from "~~/hooks/useWatchedContent";
import { formatVoteCooldownRemaining, getVoteCooldownRemainingSeconds } from "~~/lib/vote/cooldown";
import {
  DISCOVER_ALL_FILTER,
  DISCOVER_BROKEN_FILTER,
  filterDiscoverCategoryItems,
} from "~~/lib/vote/discoverFeedFilter";
import { type DiscoverFeedMode, sortDiscoverFeed } from "~~/lib/vote/feedModes";
import { rankForYouFeed } from "~~/lib/vote/forYouRanker";
import { buildVoteLocation } from "~~/lib/vote/location";
import { mergeRequestedContentIntoFeed } from "~~/lib/vote/requestedContent";
import { stabilizeSessionFeedOrder } from "~~/lib/vote/stableFeedOrder";
import { type VoteView, getVoteViewGroups, isActivityViewOption } from "~~/lib/vote/viewOptions";
import { buildRecommendationSignalContext, trackRecommendationSignal } from "~~/utils/recommendationTracker";
import { notification } from "~~/utils/scaffold-eth";

const VotingGuide = dynamic(() => import("~~/components/onboarding/VotingGuide").then(m => m.VotingGuide), {
  ssr: false,
  loading: () => null,
});
const VoteFeedStage = dynamic(() => import("~~/components/vote/VoteFeedStage").then(m => m.VoteFeedStage), {
  ssr: false,
  loading: () => <VoteStageLoading />,
});
const StakeSelector = dynamic(() => import("~~/components/swipe/StakeSelector").then(m => m.StakeSelector), {
  loading: () => (
    <div className="flex items-center justify-center h-96">
      <span className="loading loading-spinner loading-lg"></span>
    </div>
  ),
});

const ALL_FILTER = DISCOVER_ALL_FILTER;
const BROKEN_FILTER = DISCOVER_BROKEN_FILTER;
const slugify = (name: string) => name.toLowerCase().replace(/\s+/g, "-");
type SortOption = "for_you" | "relevance" | "newest" | "oldest" | "highest_rated" | "lowest_rated";
type SearchSortOption = Exclude<SortOption, "for_you">;
type ScopeOption = "all" | "watched" | "my_votes" | "my_submissions" | "settling_soon" | "followed_curators";
const SEARCH_SORT_OPTIONS: { value: SearchSortOption; label: string }[] = [
  { value: "relevance", label: "Best Match" },
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "highest_rated", label: "Highest Rated" },
  { value: "lowest_rated", label: "Lowest Rated" },
];
const FEED_PAGE_SIZE = 6;
const FEED_PREFETCH_BUFFER = 6;

function areIdListsEqual(left: readonly string[], right: readonly string[]) {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function getVoteCooldownMessage(seconds: number) {
  return `You already voted on this content recently. Try again in ${formatVoteCooldownRemaining(seconds)}.`;
}

function VoteStageLoading() {
  return (
    <div className="surface-card rounded-2xl p-6">
      <div className="flex items-center gap-3 text-base-content/50">
        <span className="loading loading-spinner loading-sm text-primary" />
        <span>Loading...</span>
      </div>
    </div>
  );
}

const HomeInner = () => {
  const searchParams = useSearchParams();
  const searchQuery = searchParams?.get("q") ?? "";
  const contentParam = searchParams?.get("content");
  const requestedActiveId = useMemo(() => {
    if (!contentParam) return null;
    try {
      return BigInt(contentParam);
    } catch {
      return null;
    }
  }, [contentParam]);

  const { address } = useAccount();
  const { targetNetwork } = useTargetNetwork();
  const nowSeconds = useUnixTime(60_000);
  const { openConnectModal } = useCuryoConnectModal();
  const { isFirstVote, markVoteCompleted } = useOnboarding();
  const [activeCategory, setActiveCategory] = useState<string>(ALL_FILTER);
  const [view, setView] = useState<VoteView>("for_you");
  const [sortBy, setSortBy] = useState<SortOption>("for_you");
  const [visibleCount, setVisibleCount] = useState(FEED_PAGE_SIZE);
  const [interactionVersion, setInteractionVersion] = useState(0);
  const [optimisticVotedContentIds, setOptimisticVotedContentIds] = useState<Set<string>>(() => new Set());
  const desktopScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const trimmedSearchQuery = searchQuery.trim();
  const isSearchMode = trimmedSearchQuery.length > 0;
  const isShortSearchQuery = isContentSearchQueryTooShort(trimmedSearchQuery);
  const effectiveSearchSortBy: SearchSortOption = sortBy === "for_you" ? "relevance" : sortBy;
  const { categories: websiteCategories, categoryNameToId, isLoading: categoriesLoading } = useCategoryRegistry();
  const { votes, isLoading: votesLoading } = useVoteHistoryQuery(address);
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
  const hasWallet = Boolean(address);
  const viewGroups = useMemo(() => getVoteViewGroups(hasWallet), [hasWallet]);
  const activeScope: ScopeOption = isActivityViewOption(view) ? view : "all";
  const activeFeedMode: DiscoverFeedMode = isActivityViewOption(view) ? "for_you" : view;
  const feedRequestLimit = Math.max(
    !isSearchMode && activeScope === "all" ? FEED_PAGE_SIZE * 4 : FEED_PAGE_SIZE * 2,
    visibleCount + FEED_PREFETCH_BUFFER + 1,
  );

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
    switch (activeScope) {
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
  }, [activeScope, followedCuratorContentOrder, settlingSoonContentOrder, votedContentOrder, watchedContentOrder]);

  const feedContentIds = useMemo(() => {
    if (!scopedContentIds) return undefined;
    if (feedRequestLimit === undefined) return scopedContentIds;
    return scopedContentIds.slice(0, feedRequestLimit);
  }, [scopedContentIds, feedRequestLimit]);
  const effectiveRequestedActiveId = activeCategory === ALL_FILTER ? requestedActiveId : null;
  const requestedContentIds = useMemo(
    () => (effectiveRequestedActiveId !== null ? [effectiveRequestedActiveId] : undefined),
    [effectiveRequestedActiveId],
  );

  const {
    feed,
    isLoading,
    isMetadataPrefetchPending,
    totalContent: serverTotalContent,
    hasMore: serverHasMoreFeed,
  } = useContentFeed(address, {
    categoryId: activeCategoryId,
    contentIds: feedContentIds,
    limit: feedRequestLimit,
    searchQuery: searchQuery.trim() || undefined,
    sortBy: isSearchMode ? effectiveSearchSortBy : "newest",
    submitter: activeScope === "my_submissions" ? address : undefined,
  });
  const feedContainsRequestedContent = useMemo(() => {
    if (effectiveRequestedActiveId === null) return false;
    return feed.some(item => item.id === effectiveRequestedActiveId);
  }, [effectiveRequestedActiveId, feed]);
  const { feed: requestedContentFeed, isLoading: requestedContentLoading } = useContentFeed(address, {
    contentIds: requestedContentIds,
    enabled: effectiveRequestedActiveId !== null && !feedContainsRequestedContent,
    keepPrevious: false,
    limit: 1,
  });
  const requestedContentItem = requestedContentFeed[0] ?? null;
  const totalContent = scopedContentIds?.length ?? serverTotalContent;
  const hasMoreFeed = scopedContentIds ? feed.length < totalContent : serverHasMoreFeed;
  const interestProfile = useInterestProfile({
    address,
    feed,
    votes,
    signalVersion: interactionVersion,
  });
  const voteCounts = useCategoryPopularity(feed);
  const voteCooldownByContentId = useMemo(() => {
    const cooldowns = new Map<string, number>();

    for (const vote of votes) {
      if (!vote.committedAt) continue;
      const remainingSeconds = getVoteCooldownRemainingSeconds(vote.committedAt, nowSeconds);
      if (remainingSeconds <= 0) continue;

      const key = vote.contentId.toString();
      const previous = cooldowns.get(key) ?? 0;
      if (remainingSeconds > previous) {
        cooldowns.set(key, remainingSeconds);
      }
    }

    return cooldowns;
  }, [nowSeconds, votes]);

  useEffect(() => {
    setOptimisticVotedContentIds(previous => (previous.size === 0 ? previous : new Set()));
  }, [address, targetNetwork.id]);

  useEffect(() => {
    if (optimisticVotedContentIds.size === 0) return;

    const fetchedVoteIds = new Set(votes.map(vote => vote.contentId.toString()));
    setOptimisticVotedContentIds(previous => {
      let changed = false;
      const next = new Set<string>();

      previous.forEach(contentId => {
        if (fetchedVoteIds.has(contentId)) {
          changed = true;
          return;
        }
        next.add(contentId);
      });

      return changed ? next : previous;
    });
  }, [optimisticVotedContentIds.size, votes]);

  // Filter & sort state
  const fetchedVotedContentIds = useMemo(() => new Set(votes.map(vote => vote.contentId.toString())), [votes]);
  const votedContentIds = useMemo(() => {
    const ids = new Set(fetchedVotedContentIds);
    optimisticVotedContentIds.forEach(contentId => ids.add(contentId));
    return ids;
  }, [fetchedVotedContentIds, optimisticVotedContentIds]);
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
    (activeScope === "watched" && !!address && watchedLoading) ||
    (activeScope === "my_votes" && !!address && votesLoading) ||
    ((activeScope === "settling_soon" || activeScope === "followed_curators") && !!address && discoverSignalsLoading) ||
    (activeScope === "followed_curators" && !!address && followedProfilesLoading);
  const normalizedAddress = address?.toLowerCase();

  useEffect(() => {
    if (!address && isActivityViewOption(view)) {
      setView("for_you");
    }
  }, [address, view]);

  const displayFeedRef = useRef<ContentItem[]>([]);
  const activeViewSessionRef = useRef<{ contentId: string; startedAt: number; hasPositiveInteraction: boolean } | null>(
    null,
  );
  const isMountedRef = useRef(true);
  const persistRecommendationSignal = useCallback(
    (
      item: Pick<ContentItem, "id" | "categoryId" | "url" | "submitter" | "tags">,
      type: Parameters<typeof trackRecommendationSignal>[1],
      fields: Parameters<typeof trackRecommendationSignal>[2] = {},
    ) => {
      if (!item.url || !item.submitter) return;
      trackRecommendationSignal(buildRecommendationSignalContext(item), type, fields);
    },
    [],
  );
  const recordRecommendationSignal = useCallback(
    (
      item: Pick<ContentItem, "id" | "categoryId" | "url" | "submitter" | "tags">,
      type: Parameters<typeof trackRecommendationSignal>[1],
      fields: Parameters<typeof trackRecommendationSignal>[2] = {},
    ) => {
      persistRecommendationSignal(item, type, fields);
      setInteractionVersion(version => version + 1);
    },
    [persistRecommendationSignal],
  );
  const markPrimaryInteraction = useCallback((contentId: bigint) => {
    if (activeViewSessionRef.current?.contentId === contentId.toString()) {
      activeViewSessionRef.current.hasPositiveInteraction = true;
    }
  }, []);
  const flushActiveViewSession = useCallback(
    (syncProfile: boolean) => {
      const session = activeViewSessionRef.current;
      if (!session) return;

      activeViewSessionRef.current = null;
      const item = displayFeedRef.current.find(entry => entry.id.toString() === session.contentId);
      if (!item) return;

      const dwellMs = Date.now() - session.startedAt;
      let profileChanged = false;

      if (dwellMs >= 1_200) {
        persistRecommendationSignal(item, "dwell", { dwellMs });
        profileChanged = true;
      }
      if (!session.hasPositiveInteraction && dwellMs < 4_000) {
        persistRecommendationSignal(item, "quick_skip", { dwellMs });
        profileChanged = true;
      }

      if (syncProfile && profileChanged && isMountedRef.current) {
        setInteractionVersion(version => version + 1);
      }
    },
    [persistRecommendationSignal],
  );

  // Voting state
  const [stakeModal, setStakeModal] = useState<{
    isOpen: boolean;
    isUp: boolean;
    contentId: bigint;
    categoryId: bigint;
  }>({ isOpen: false, isUp: false, contentId: 0n, categoryId: 0n });
  const { commitVote, isCommitting, error: voteError, clearError: clearVoteError } = useRoundVote();
  // Apply search, category filter, and the selected view before sorting
  const filteredFeed = useMemo(() => {
    let items = filterDiscoverCategoryItems(feed, activeCategory, activeCategoryId);

    switch (activeScope) {
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
    activeCategory,
    activeCategoryId,
    activeScope,
    watchedContentIds,
    votedContentIds,
    settlingSoonContentIds,
    followedCuratorContentIds,
  ]);

  const rankedDisplayFeed = useMemo(() => {
    const withRequestedItem = (items: ContentItem[]) =>
      effectiveRequestedActiveId !== null ? mergeRequestedContentIntoFeed(items, requestedContentItem) : items;
    const items = [...filteredFeed];

    if (isSearchMode) {
      switch (effectiveSearchSortBy) {
        case "newest":
          items.sort((a, b) => Number(b.id - a.id));
          break;
        case "oldest":
          items.sort((a, b) => Number(a.id - b.id));
          break;
        case "relevance":
        case "highest_rated":
        case "lowest_rated":
          return withRequestedItem(items);
      }
      return withRequestedItem(items);
    }

    if (activeScope === "all" && activeFeedMode !== "for_you") {
      return withRequestedItem(sortDiscoverFeed(items, activeFeedMode, nowSeconds));
    }

    switch (activeScope) {
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
        return withRequestedItem(
          rankForYouFeed(items, {
            nowSeconds,
            profile: interestProfile,
            votedContentIds,
            watchedContentIds,
            followedWallets,
          }),
        );
    }

    return withRequestedItem(items);
  }, [
    activeFeedMode,
    activeScope,
    effectiveSearchSortBy,
    filteredFeed,
    followedCuratorOrderMap,
    followedWallets,
    interestProfile,
    isSearchMode,
    nowSeconds,
    voteOrderMap,
    settlingSoonOrderMap,
    votedContentIds,
    watchedContentIds,
    watchedOrderMap,
    effectiveRequestedActiveId,
    requestedContentItem,
  ]);
  const feedSessionKey = useMemo(
    () =>
      [
        targetNetwork.id,
        normalizedAddress ?? "anonymous",
        activeCategory,
        view,
        isSearchMode ? `search:${trimmedSearchQuery}:${effectiveSearchSortBy}` : `sort:${sortBy}`,
      ].join("|"),
    [
      activeCategory,
      effectiveSearchSortBy,
      isSearchMode,
      normalizedAddress,
      sortBy,
      targetNetwork.id,
      trimmedSearchQuery,
      view,
    ],
  );
  const feedSessionKeyRef = useRef(feedSessionKey);
  const [stableDisplayFeedIds, setStableDisplayFeedIds] = useState<string[]>(() =>
    rankedDisplayFeed.map(item => item.id.toString()),
  );

  useEffect(() => {
    setStableDisplayFeedIds(previousIds => {
      const nextIds = rankedDisplayFeed.map(item => item.id.toString());

      if (feedSessionKeyRef.current !== feedSessionKey) {
        feedSessionKeyRef.current = feedSessionKey;
        return nextIds;
      }

      const stableIds = stabilizeSessionFeedOrder(previousIds, nextIds);
      return areIdListsEqual(previousIds, stableIds) ? previousIds : stableIds;
    });
  }, [feedSessionKey, rankedDisplayFeed]);

  const displayFeed = useMemo(() => {
    const itemById = new Map(rankedDisplayFeed.map(item => [item.id.toString(), item]));
    return stableDisplayFeedIds.map(id => itemById.get(id)).filter((item): item is ContentItem => item !== undefined);
  }, [rankedDisplayFeed, stableDisplayFeedIds]);
  displayFeedRef.current = displayFeed;

  const {
    activeItem: primaryItem,
    activeSourceIndex,
    loadedItems,
    selectContent,
  } = useVoteFeedStage(displayFeed, {
    visibleCount,
    requestedActiveId: effectiveRequestedActiveId,
  });
  const lastSyncedRequestedContentIdRef = useRef<bigint | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (effectiveRequestedActiveId === null) {
      lastSyncedRequestedContentIdRef.current = null;
      return;
    }

    const activeItem = activeSourceIndex >= 0 ? (displayFeed[activeSourceIndex] ?? null) : null;
    if (!activeItem || activeItem.id !== effectiveRequestedActiveId) {
      return;
    }

    if (lastSyncedRequestedContentIdRef.current === effectiveRequestedActiveId) {
      return;
    }

    lastSyncedRequestedContentIdRef.current = effectiveRequestedActiveId;

    window.requestAnimationFrame(() => {
      document.getElementById(`vote-feed-card-${activeSourceIndex}`)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, [activeSourceIndex, displayFeed, effectiveRequestedActiveId]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!primaryItem) {
      activeViewSessionRef.current = null;
      return;
    }

    persistRecommendationSignal(primaryItem, "impression");
    const session = {
      contentId: primaryItem.id.toString(),
      startedAt: Date.now(),
      hasPositiveInteraction: false,
    };
    activeViewSessionRef.current = session;

    return () => {
      if (activeViewSessionRef.current === session) {
        flushActiveViewSession(false);
      }
    };
  }, [flushActiveViewSession, persistRecommendationSignal, primaryItem]);

  const submitterAddresses = useMemo(() => {
    return loadedItems.map(item => item.submitter);
  }, [loadedItems]);

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
  const getContentCooldownSeconds = useCallback(
    (contentId: bigint) => voteCooldownByContentId.get(contentId.toString()) ?? 0,
    [voteCooldownByContentId],
  );

  const primaryItemCooldownSeconds = primaryItem ? getContentCooldownSeconds(primaryItem.id) : 0;
  const stakeModalCooldownSeconds = stakeModal.contentId > 0n ? getContentCooldownSeconds(stakeModal.contentId) : 0;

  // Reset visible count when filters change
  useEffect(() => {
    setVisibleCount(FEED_PAGE_SIZE);
  }, [searchQuery, activeCategory, view, sortBy]);

  useEffect(() => {
    if (!voteError?.includes("You already voted on this content within the last")) return;
  }, [voteError]);

  const handleButtonVote = useCallback(
    (item: ContentItem, isUp: boolean) => {
      if (!address) {
        notification.info("Sign in to vote.");
        void openConnectModal();
        return;
      }

      const cooldownSeconds =
        primaryItem && item.id === primaryItem.id ? primaryItemCooldownSeconds : getContentCooldownSeconds(item.id);
      if (cooldownSeconds > 0) {
        notification.info(getVoteCooldownMessage(cooldownSeconds), { duration: 6000 });
        return;
      }

      clearVoteError();
      markPrimaryInteraction(item.id);
      recordRecommendationSignal(item, "vote_intent", { isUp });
      setStakeModal({ isOpen: true, isUp, contentId: item.id, categoryId: item.categoryId });
    },
    [
      address,
      clearVoteError,
      getContentCooldownSeconds,
      markPrimaryInteraction,
      openConnectModal,
      primaryItem,
      primaryItemCooldownSeconds,
      recordRecommendationSignal,
    ],
  );

  const handleCancelStake = () => {
    clearVoteError();
    setStakeModal(prev => ({ ...prev, isOpen: false }));
  };

  const replaceVoteLocation = useCallback((update: { contentId?: bigint | null; categoryHash?: string | null }) => {
    history.replaceState(null, "", buildVoteLocation(window.location.href, update));
  }, []);

  // Sync category selection with URL hash (e.g. /#books, /#board-games)
  const selectCategory = useCallback(
    (name: string) => {
      setActiveCategory(name);
      replaceVoteLocation({
        contentId: null,
        categoryHash: name === ALL_FILTER ? null : slugify(name),
      });
    },
    [replaceVoteLocation],
  );

  const setActiveFeedIndex = useCallback(
    (targetIndex: number, options?: { syncLocation?: boolean }) => {
      if (targetIndex < 0 || targetIndex >= displayFeed.length) return false;

      const targetItem = displayFeed[targetIndex];
      if (!targetItem) return false;

      if (activeSourceIndex !== -1 && targetIndex === activeSourceIndex) {
        return false;
      }

      if (activeSourceIndex !== -1) {
        flushActiveViewSession(false);
      }

      selectContent(targetItem.id);
      if (options?.syncLocation) {
        replaceVoteLocation({ contentId: targetItem.id });
      }

      return true;
    },
    [activeSourceIndex, displayFeed, flushActiveViewSession, replaceVoteLocation, selectContent],
  );

  const handleTrackVisibleIndex = useCallback(
    (targetIndex: number) => {
      return setActiveFeedIndex(targetIndex);
    },
    [setActiveFeedIndex],
  );

  const handleSelectByIndex = useCallback(
    (targetIndex: number) => {
      return setActiveFeedIndex(targetIndex, { syncLocation: true });
    },
    [setActiveFeedIndex],
  );

  const handleConfirmStake = useCallback(
    async (stakeAmount: number) => {
      const cooldownSeconds = stakeModalCooldownSeconds;
      if (cooldownSeconds > 0) {
        notification.info(getVoteCooldownMessage(cooldownSeconds), { duration: 6000 });
        setStakeModal(prev => ({ ...prev, isOpen: false }));
        return;
      }

      const item = displayFeed.find(i => i.id === stakeModal.contentId);
      const committedIndex = displayFeed.findIndex(i => i.id === stakeModal.contentId);
      const success = await commitVote({
        contentId: stakeModal.contentId,
        isUp: stakeModal.isUp,
        stakeAmount,
        submitter: item?.submitter,
      });
      if (!success) {
        return;
      }

      clearVoteError();
      setStakeModal(prev => ({ ...prev, isOpen: false }));
      setOptimisticVotedContentIds(previous => {
        const next = new Set(previous);
        next.add(stakeModal.contentId.toString());
        return next;
      });
      if (item) {
        markPrimaryInteraction(item.id);
        recordRecommendationSignal(item, "vote_commit", { isUp: stakeModal.isUp });
      }

      const nextIndex = committedIndex >= 0 ? Math.min(committedIndex + 1, displayFeed.length - 1) : -1;
      const advanced = nextIndex > committedIndex ? handleSelectByIndex(nextIndex) : false;
      if (advanced && typeof window !== "undefined") {
        window.requestAnimationFrame(() => {
          document
            .getElementById(`vote-feed-card-${nextIndex}`)
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
      notification.success(
        advanced
          ? `Vote committed! Stake: ${stakeAmount} cREP · next card ready`
          : `Vote committed! Stake: ${stakeAmount} cREP`,
      );

      if (isFirstVote) {
        markVoteCompleted();
        notification.info("Great first vote! Keep going to build your reputation.", { duration: 5000 });
      }
    },
    [
      clearVoteError,
      commitVote,
      displayFeed,
      handleSelectByIndex,
      isFirstVote,
      markVoteCompleted,
      markPrimaryInteraction,
      recordRecommendationSignal,
      stakeModal,
      stakeModalCooldownSeconds,
    ],
  );

  const handleToggleWatch = useCallback(
    async (contentId: bigint) => {
      const result = await toggleWatch(contentId);

      if (!result.ok) {
        if (result.reason === "not_connected") {
          notification.info("Sign in to watch content.");
          void openConnectModal();
          return;
        }

        if (result.reason === "rejected") {
          return;
        }

        notification.error(result.error || "Failed to update watchlist");
        return;
      }

      const item = displayFeed.find(entry => entry.id === contentId);
      if (item) {
        markPrimaryInteraction(item.id);
        recordRecommendationSignal(item, "watch_toggle", { selected: result.watched });
      }
      notification.success(result.watched ? "Added to your watchlist" : "Removed from your watchlist");
    },
    [displayFeed, markPrimaryInteraction, openConnectModal, recordRecommendationSignal, toggleWatch],
  );

  const handleToggleFollow = useCallback(
    async (targetAddress: string) => {
      const result = await toggleFollow(targetAddress);

      if (!result.ok) {
        if (result.reason === "not_connected") {
          notification.info("Sign in to follow curators.");
          void openConnectModal();
          return;
        }

        if (result.reason === "self_follow" || result.reason === "rejected") {
          return;
        }

        notification.error(result.error || "Failed to update follows");
        return;
      }

      const item =
        displayFeed.find(entry => entry.submitter.toLowerCase() === targetAddress.toLowerCase()) ?? primaryItem;
      if (item) {
        markPrimaryInteraction(item.id);
        recordRecommendationSignal(item, "follow_toggle", { selected: result.following });
      }
      notification.success(result.following ? "Following curator" : "Unfollowed curator");
    },
    [displayFeed, markPrimaryInteraction, openConnectModal, primaryItem, recordRecommendationSignal, toggleFollow],
  );

  const handleExternalOpen = useCallback(
    (item: ContentItem) => {
      replaceVoteLocation({ contentId: item.id });
      markPrimaryInteraction(item.id);
      recordRecommendationSignal(item, "external_open");
    },
    [markPrimaryInteraction, recordRecommendationSignal, replaceVoteLocation],
  );

  const handleViewChange = useCallback(
    async (nextView: VoteView) => {
      if (nextView === "watched") {
        const result = await requestWatchReadAccess();
        if (!result.ok) {
          if (result.reason === "not_connected") {
            notification.info("Sign in to view your watchlist.");
            void openConnectModal();
            return;
          }

          if (result.reason !== "rejected") {
            notification.error(result.error || "Failed to unlock your watchlist");
          }
          return;
        }

        setView("watched");
        return;
      }

      if (nextView !== "followed_curators") {
        setView(nextView);
        return;
      }

      const result = await requestFollowReadAccess();
      if (!result.ok) {
        if (result.reason === "not_connected") {
          notification.info("Sign in to view curators you follow.");
          void openConnectModal();
          return;
        }

        if (result.reason !== "rejected") {
          notification.error(result.error || "Failed to unlock your follow list");
        }
        return;
      }

      setView("followed_curators");
    },
    [openConnectModal, requestFollowReadAccess, requestWatchReadAccess],
  );

  // Count broken URLs for the filter pill
  const brokenCount = useMemo(() => {
    return filterDiscoverCategoryItems(feed, BROKEN_FILTER).length;
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
    if (effectiveRequestedActiveId !== null && !requestedContentLoading && !requestedContentItem) {
      return "This content could not be shown. It may be unavailable or hidden by this frontend's moderation policy.";
    }

    if (trimmedSearchQuery) {
      if (isShortSearchQuery) {
        return `Search terms must be at least ${MIN_CONTENT_SEARCH_QUERY_LENGTH} characters.`;
      }

      return `No results for "${trimmedSearchQuery}"`;
    }

    if (activeScope === "watched") {
      return address ? "You aren't watching any content yet." : "Sign in to view watched content.";
    }

    if (activeScope === "my_votes") {
      return address ? "You haven't voted on any content yet." : "Sign in to view your votes.";
    }

    if (activeScope === "my_submissions") {
      return address ? "You haven't submitted any content yet." : "Sign in to view your submissions.";
    }

    if (activeScope === "settling_soon") {
      return address
        ? "Nothing you are tracking looks close to settlement right now."
        : "Sign in to view rounds settling soon.";
    }

    if (activeScope === "followed_curators") {
      return address
        ? "Follow a few curators to turn this into a live feed."
        : "Sign in to view activity from curators you follow.";
    }

    if (activeScope === "all" && activeFeedMode === "trending") {
      return "No content is trending right now.";
    }

    if (activeScope === "all" && activeFeedMode === "contested") {
      return "No live rounds look meaningfully contested right now.";
    }

    if (activeScope === "all" && activeFeedMode === "latest") {
      return "No recent submissions are available right now.";
    }

    if (activeScope === "all" && activeFeedMode === "near_settlement") {
      return "No open rounds look close to settlement right now.";
    }

    if (activeCategory === BROKEN_FILTER) {
      return "No broken URLs detected.";
    }

    if (activeCategory === ALL_FILTER) {
      return "No content submitted yet. Be the first!";
    }

    return `No content found in "${activeCategory}".`;
  }, [
    activeCategory,
    activeFeedMode,
    activeScope,
    address,
    effectiveRequestedActiveId,
    requestedContentItem,
    requestedContentLoading,
    isShortSearchQuery,
    trimmedSearchQuery,
  ]);

  const showRequestedContentLoading =
    effectiveRequestedActiveId !== null &&
    !feedContainsRequestedContent &&
    requestedContentItem === null &&
    requestedContentLoading &&
    feed.length === 0;
  return (
    <AppPageShell
      outerClassName="min-h-0 flex-1 overflow-hidden pb-0 xl:overflow-visible xl:pb-4"
      contentClassName="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden xl:overflow-visible"
    >
      <VotingGuide />
      <div
        className="flex shrink-0 flex-wrap items-center gap-2 sm:gap-3 xl:flex-nowrap"
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
              : "pill-inactive text-warning/70 hover:bg-warning/10";
          }}
        />
        <FeedScopeFilter
          value={view}
          groups={viewGroups}
          onChange={value => {
            void handleViewChange(value as VoteView);
          }}
          label="View"
        />
        <div className="shrink-0 flex items-center xl:hidden">
          <StreakCounter />
        </div>
      </div>

      {isSearchMode ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2" data-disable-queue-wheel="true">
          <div className="rounded-full bg-base-200 px-3 py-2 text-sm text-base-content/70">
            {isShortSearchQuery ? (
              <span>Keep typing to search. Terms need at least {MIN_CONTENT_SEARCH_QUERY_LENGTH} characters.</span>
            ) : (
              <>
                Results for <span className="font-medium text-base-content">&quot;{trimmedSearchQuery}&quot;</span>
              </>
            )}
          </div>
          {!isShortSearchQuery ? (
            <>
              <label htmlFor="vote-search-sort" className="sr-only">
                Sort search results
              </label>
              <select
                id="vote-search-sort"
                name="vote-search-sort"
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
            </>
          ) : null}
        </div>
      ) : null}

      <div
        ref={desktopScrollContainerRef}
        className="min-h-0 flex-1 overflow-hidden xl:relative xl:left-1/2 xl:w-screen xl:-translate-x-1/2 xl:overflow-x-hidden xl:overflow-y-auto xl:overscroll-contain xl:scrollbar-subtle xl:snap-y xl:snap-mandatory xl:scroll-pb-4 xl:scroll-smooth"
      >
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden xl:mx-auto xl:w-full xl:max-w-5xl xl:px-4 xl:pb-4">
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden xl:grid xl:grid-cols-[minmax(0,1fr)_17.25rem] xl:items-start xl:gap-4">
            <div className="flex min-w-0 min-h-0 flex-1 flex-col gap-3 xl:gap-0">
              <div className="surface-card flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-[2rem] rounded-b-none p-3 sm:p-4 xl:rounded-[2rem]">
                <div className="min-w-0 flex-1 min-h-0">
                  {/* Main content */}
                  {categoriesLoading ||
                  scopeLoading ||
                  showRequestedContentLoading ||
                  (effectiveRequestedActiveId === null && isLoading) ? (
                    <div className="flex justify-center py-16 xl:h-full xl:items-center xl:py-10">
                      <span className="loading loading-spinner loading-lg text-primary"></span>
                    </div>
                  ) : displayFeed.length === 0 ? (
                    <div className="py-16 text-center text-base text-base-content/30 xl:flex xl:h-full xl:items-center xl:justify-center xl:py-10">
                      {emptyStateMessage}
                    </div>
                  ) : (
                    <VoteFeedStage
                      primaryItem={primaryItem}
                      displayFeed={displayFeed}
                      activeSourceIndex={activeSourceIndex}
                      loadedCount={visibleCount}
                      canLoadMore={canLoadMore}
                      enrichedProfiles={enrichedProfiles}
                      watchedContentIds={watchedContentIds}
                      followedWallets={followedWallets}
                      normalizedAddress={normalizedAddress}
                      isCommitting={isCommitting}
                      isMetadataPrefetchPending={isMetadataPrefetchPending}
                      navigationLocked={stakeModal.isOpen}
                      isWatchPending={isWatchPending}
                      isFollowPending={isFollowPending}
                      scrollContainerRef={desktopScrollContainerRef}
                      onLoadMore={() => setVisibleCount(prev => prev + FEED_PAGE_SIZE)}
                      onTrackActiveIndex={handleTrackVisibleIndex}
                      onSelectByIndex={handleSelectByIndex}
                      onExternalOpen={handleExternalOpen}
                      onToggleWatch={handleToggleWatch}
                      onToggleFollow={handleToggleFollow}
                    />
                  )}
                </div>
              </div>
            </div>
            <div className="hidden min-w-0 xl:flex xl:self-start xl:sticky xl:top-0">
              <VoteSignalRail
                primaryItem={primaryItem}
                activeIndex={activeSourceIndex}
                totalCount={displayFeed.length}
                isCommitting={isCommitting}
                voteError={voteError}
                cooldownSecondsRemaining={primaryItemCooldownSeconds}
                onVote={handleButtonVote}
              />
            </div>
          </div>
        </div>
      </div>

      {primaryItem ? (
        <div className="fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-30 xl:hidden">
          <div className="mx-auto w-full max-w-5xl">
            <div className="overflow-visible">
              <VotingQuestionCard
                contentId={primaryItem.id}
                categoryId={primaryItem.categoryId}
                currentRating={primaryItem.rating}
                openRound={primaryItem.openRound}
                onVote={isUp => handleButtonVote(primaryItem, isUp)}
                isCommitting={isCommitting}
                address={address}
                error={voteError}
                cooldownSecondsRemaining={primaryItemCooldownSeconds}
                isOwnContent={primaryItem.isOwnContent}
                embedded
                compact
                variant="dock"
              />
            </div>
          </div>
        </div>
      ) : null}

      {/* Stake selector modal */}
      {stakeModal.isOpen ? (
        <StakeSelector
          isOpen={stakeModal.isOpen}
          isUp={stakeModal.isUp}
          contentId={stakeModal.contentId}
          categoryId={stakeModal.categoryId}
          cooldownSecondsRemaining={stakeModalCooldownSeconds}
          isConfirming={isCommitting}
          confirmError={voteError}
          onConfirm={handleConfirmStake}
          onCancel={handleCancelStake}
        />
      ) : null}
    </AppPageShell>
  );
};

const Home: NextPage = () => (
  <Suspense>
    <HomeInner />
  </Suspense>
);

export default Home;
