"use client";

import { Suspense, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import type { NextPage } from "next";
import { useAccount, useReadContracts } from "wagmi";
import { CategoryFilter } from "~~/components/CategoryFilter";
import { VotingGuide } from "~~/components/onboarding/VotingGuide";
import { FollowProfileButton } from "~~/components/shared/FollowProfileButton";
import { StreakCounter } from "~~/components/shared/StreakCounter";
import { VotingQuestionCard } from "~~/components/shared/VotingQuestionCard";
import { WatchContentButton } from "~~/components/shared/WatchContentButton";
import { SwipeCard } from "~~/components/swipe/SwipeCard";
import { FeedScopeFilter } from "~~/components/vote/FeedScopeFilter";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";
import { useCategoryPopularity } from "~~/hooks/useCategoryPopularity";
import { useCategoryRegistry } from "~~/hooks/useCategoryRegistry";
import type { ContentItem } from "~~/hooks/useContentFeed";
import { useContentFeed } from "~~/hooks/useContentFeed";
import { useFollowedProfiles } from "~~/hooks/useFollowedProfiles";
import { useOnboarding } from "~~/hooks/useOnboarding";
import { useRadarFeed } from "~~/hooks/useRadarFeed";
import { useRoundVote } from "~~/hooks/useRoundVote";
import { SubmitterProfile, useSubmitterProfiles } from "~~/hooks/useSubmitterProfiles";
import { useUrlValidation } from "~~/hooks/useUrlValidation";
import { useUserPreferences } from "~~/hooks/useUserPreferences";
import { useVoteHistory } from "~~/hooks/useVoteHistory";
import { useVoterAccuracyBatch } from "~~/hooks/useVoterAccuracyBatch";
import { useWatchedContent } from "~~/hooks/useWatchedContent";
import { trackContentClick } from "~~/utils/clickTracker";
import { isContentItemBlocked } from "~~/utils/contentFilter";
import { detectPlatform } from "~~/utils/platforms";
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
  const searchQuery = searchParams.get("q") ?? "";
  const contentParam = searchParams.get("content");

  const { address } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { isFirstVote, markVoteCompleted } = useOnboarding();
  const [activeCategory, setActiveCategory] = useState<string>(ALL_FILTER);
  const [scope, setScope] = useState<ScopeOption>("all");
  const [sortBy, setSortBy] = useState<SortOption>("for_you");
  const [selectedId, setSelectedId] = useState<bigint | null>(null);
  const [visibleCount, setVisibleCount] = useState(FEED_PAGE_SIZE);
  const isSearchMode = searchQuery.trim().length > 0;
  const effectiveSearchSortBy: SearchSortOption = sortBy === "for_you" ? "newest" : sortBy;
  const shouldUsePagedFeed = !contentParam && !isSearchMode && scope === "all" && activeCategory === ALL_FILTER;
  const feedRequestLimit = shouldUsePagedFeed
    ? Math.max(FEED_PAGE_SIZE * 2, visibleCount + FEED_PREFETCH_BUFFER + 1)
    : undefined;
  const {
    feed,
    isLoading,
    hasMore: hasMoreFeed,
  } = useContentFeed(address, {
    limit: feedRequestLimit,
    sortBy: "newest",
  });
  const { categories: websiteCategories, categoryNameToId, isLoading: categoriesLoading } = useCategoryRegistry();
  const { categoryScores, hasPreferences } = useUserPreferences(feed, address);
  const voteCounts = useCategoryPopularity(feed);
  const { votes, isLoading: votesLoading } = useVoteHistory(address);
  const {
    watchedItems,
    watchedContentIds,
    isLoading: watchedLoading,
    toggleWatch,
    isPending: isWatchPending,
  } = useWatchedContent(address);
  const { followedWallets, toggleFollow, isPending: isFollowPending } = useFollowedProfiles(address);
  const { radar, isLoading: radarLoading } = useRadarFeed(address);

  // URL validation — async check for broken URLs
  const feedUrls = useMemo(() => feed.map(item => item.url), [feed]);
  const { validationMap } = useUrlValidation(feedUrls);

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
    radar.settlingSoon.forEach((item, index) => {
      const contentId = item.contentId.toString();
      if (!order.has(contentId)) {
        order.set(contentId, index);
      }
    });
    return order;
  }, [radar.settlingSoon]);
  const followedCuratorOrderMap = useMemo(() => {
    const order = new Map<string, number>();
    radar.followedSubmissions.forEach((item, index) => {
      const contentId = item.contentId.toString();
      if (!order.has(contentId)) {
        order.set(contentId, index);
      }
    });
    return order;
  }, [radar.followedSubmissions]);
  const settlingSoonContentIds = useMemo(
    () => new Set(radar.settlingSoon.map(item => item.contentId.toString())),
    [radar.settlingSoon],
  );
  const followedCuratorContentIds = useMemo(
    () => new Set(radar.followedSubmissions.map(item => item.contentId.toString())),
    [radar.followedSubmissions],
  );
  const scopeLoading =
    (scope === "watched" && !!address && watchedLoading) ||
    (scope === "my_votes" && !!address && votesLoading) ||
    ((scope === "settling_soon" || scope === "followed_curators") && !!address && radarLoading);
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

  // Deep link: select content from ?content= query param
  useEffect(() => {
    if (contentParam && feed.length > 0) {
      try {
        const id = BigInt(contentParam);
        if (feed.some(item => item.id === id)) {
          setSelectedId(id);
        }
      } catch {
        // ignore invalid content param
      }
    }
  }, [contentParam, feed]);

  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Voting state
  const [stakeModal, setStakeModal] = useState<{
    isOpen: boolean;
    isUp: boolean;
    contentId: bigint;
    categoryId: bigint;
  }>({ isOpen: false, isUp: false, contentId: 0n, categoryId: 0n });
  const { commitVote, isCommitting, error: voteError } = useRoundVote();
  const needsRatingSort =
    isSearchMode && (effectiveSearchSortBy === "highest_rated" || effectiveSearchSortBy === "lowest_rated");

  // Batch-fetch ratings via multicall
  const { data: registryInfo } = useDeployedContractInfo({ contractName: "ContentRegistry" });
  // Apply search, category filter, and scope before sorting
  const filteredFeed = useMemo(() => {
    let items = feed.filter(item => !isContentItemBlocked(item));

    // Broken URL filter: show only broken when selected, exclude broken otherwise
    if (activeCategory === BROKEN_FILTER) {
      items = items.filter(item => validationMap.get(item.url) === false);
    } else {
      items = items.filter(item => validationMap.get(item.url) !== false);
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

    if (activeCategory !== ALL_FILTER && activeCategory !== BROKEN_FILTER) {
      const categoryId = categoryNameToId.get(activeCategory);
      if (categoryId !== undefined) {
        // Filter by categoryId (platform-based filtering)
        items = items.filter(item => item.categoryId === categoryId);
      } else {
        // Fallback to tag-based filtering for legacy categories
        items = items.filter(item => item.tags.includes(activeCategory));
      }
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
    categoryNameToId,
    validationMap,
    scope,
    watchedContentIds,
    votedContentIds,
    settlingSoonContentIds,
    followedCuratorContentIds,
  ]);

  const preRatedDisplayFeed = useMemo(() => {
    const items = [...filteredFeed];

    if (needsRatingSort) {
      return items;
    }

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
          break;
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
    needsRatingSort,
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

  const ratingTargets = useMemo(() => {
    const items = needsRatingSort ? filteredFeed : preRatedDisplayFeed.slice(0, visibleCount);
    const seen = new Set<string>();

    return items.filter(item => {
      const key = item.id.toString();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [needsRatingSort, filteredFeed, preRatedDisplayFeed, visibleCount]);

  const ratingCalls = useMemo(() => {
    if (!registryInfo || ratingTargets.length === 0) return [];
    return ratingTargets.map(item => ({
      address: registryInfo.address,
      abi: registryInfo.abi,
      functionName: "getRating" as const,
      args: [item.id],
    }));
  }, [registryInfo, ratingTargets]);

  const { data: ratingsData } = useReadContracts({ contracts: ratingCalls });

  const ratingsMap = useMemo(() => {
    const map = new Map<string, number>();
    if (!ratingsData) return map;
    ratingTargets.forEach((item, i) => {
      const result = ratingsData[i];
      if (result?.status === "success") {
        map.set(item.id.toString(), Number(result.result));
      }
    });
    return map;
  }, [ratingsData, ratingTargets]);

  const displayFeed = useMemo(() => {
    if (!needsRatingSort) {
      return preRatedDisplayFeed;
    }

    const items = [...filteredFeed];
    items.sort((a, b) => {
      const rA = ratingsMap.get(a.id.toString()) ?? 50;
      const rB = ratingsMap.get(b.id.toString()) ?? 50;
      return effectiveSearchSortBy === "highest_rated" ? rB - rA : rA - rB;
    });
    return items;
  }, [needsRatingSort, preRatedDisplayFeed, filteredFeed, ratingsMap, effectiveSearchSortBy]);

  const orderedDisplayFeed = useMemo(() => {
    if (selectedId === null) return displayFeed;

    const selectedIndex = displayFeed.findIndex(item => item.id === selectedId);
    if (selectedIndex === -1) return displayFeed;

    const selectedItem = displayFeed[selectedIndex];
    return [selectedItem, ...displayFeed.filter((_, index) => index !== selectedIndex)];
  }, [displayFeed, selectedId]);

  const visibleFeedItems = useMemo(() => orderedDisplayFeed.slice(0, visibleCount), [orderedDisplayFeed, visibleCount]);

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

  const canLoadMore = visibleCount < orderedDisplayFeed.length || (shouldUsePagedFeed && hasMoreFeed);

  // Reset visible count when filters change
  useEffect(() => {
    setVisibleCount(FEED_PAGE_SIZE);
  }, [searchQuery, activeCategory, scope, sortBy]);

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

  const handleSelectCard = useCallback((id: bigint, categoryId: bigint) => {
    trackContentClick(id, categoryId);
    setSelectedId(id);
    const url = new URL(window.location.href);
    url.searchParams.set("content", id.toString());
    history.replaceState(null, "", url.toString());
    window.scrollTo({ top: 0, behavior: "smooth" });
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
    return feed.filter(item => !isContentItemBlocked(item) && validationMap.get(item.url) === false).length;
  }, [feed, validationMap]);

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

  return (
    <div className="flex flex-col items-center grow px-4 pt-4 pb-12">
      <div className="w-full max-w-6xl">
        <VotingGuide />
        <div className="mb-4 flex flex-wrap items-center gap-2 sm:gap-3 xl:flex-nowrap">
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
          <div className="mb-5 flex flex-wrap items-center gap-2">
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
            <div className="flex justify-center py-16">
              <span className="loading loading-spinner loading-lg text-primary"></span>
            </div>
          ) : displayFeed.length === 0 ? (
            <div className="text-center py-16 text-base-content/30 text-base">{emptyStateMessage}</div>
          ) : (
            <div className="space-y-5">
              {isCommitting ? (
                <div className="flex items-center justify-center">
                  <span className="text-base text-base-content/50">
                    <span className="loading loading-spinner loading-xs mr-1.5"></span>
                    Committing...
                  </span>
                </div>
              ) : null}

              {visibleFeedItems.map((item, index) => (
                <FeedVoteCard
                  key={item.id.toString()}
                  item={item}
                  submitterProfile={enrichedProfiles[item.submitter.toLowerCase()]}
                  onSwipe={handleSwipe}
                  onVote={handleButtonVote}
                  onToggleWatch={handleToggleWatch}
                  onToggleFollow={handleToggleFollow}
                  watched={watchedContentIds.has(item.id.toString())}
                  watchPending={isWatchPending(item.id)}
                  following={followedWallets.has(item.submitter.toLowerCase())}
                  followPending={isFollowPending(item.submitter)}
                  normalizedAddress={normalizedAddress}
                  isCommitting={isCommitting}
                  voteError={voteError}
                  address={address}
                  isPrimary={index === 0 && selectedId !== null}
                />
              ))}

              {canLoadMore ? (
                <div ref={loadMoreRef} className="flex justify-center py-8">
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

const FeedVoteCard = memo(function FeedVoteCard({
  item,
  submitterProfile,
  onSwipe,
  onVote,
  onToggleWatch,
  onToggleFollow,
  watched,
  watchPending,
  following,
  followPending,
  normalizedAddress,
  isCommitting,
  voteError,
  address,
  isPrimary,
}: {
  item: ContentItem;
  submitterProfile?: SubmitterProfile;
  onSwipe: (item: ContentItem, direction: "left" | "right") => void;
  onVote: (item: ContentItem, isUp: boolean) => void;
  onToggleWatch: (id: bigint) => void;
  onToggleFollow: (address: string) => void;
  watched: boolean;
  watchPending: boolean;
  following: boolean;
  followPending: boolean;
  normalizedAddress?: string;
  isCommitting: boolean;
  voteError?: string | null;
  address?: string;
  isPrimary: boolean;
}) {
  return (
    <div className={`surface-card rounded-2xl p-3 ${isPrimary ? "ring-1 ring-primary/20" : ""}`}>
      <div className="mb-3 flex items-center justify-between gap-3 text-sm text-base-content/45">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-base-content/[0.05] px-2.5 py-1 font-medium text-base-content/60">
            {detectPlatform(item.url).type}
          </span>
          {item.tags[0] ? <span className="text-base-content/35">#{item.tags[0]}</span> : null}
        </div>
        {isPrimary ? (
          <span className="rounded-full bg-primary/12 px-2.5 py-1 font-medium text-primary">Selected</span>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch">
        <div className="w-full overflow-hidden rounded-2xl lg:w-3/5" style={{ background: "var(--color-base-300)" }}>
          <SwipeCard
            content={item}
            submitterProfile={submitterProfile}
            onSwipe={direction => onSwipe(item, direction)}
            isTop={isPrimary}
            index={0}
            canVote={!!address}
            standalone
            embedded
            submitterAction={
              normalizedAddress && item.submitter.toLowerCase() === normalizedAddress ? null : (
                <FollowProfileButton
                  following={following}
                  pending={followPending}
                  onClick={() => onToggleFollow(item.submitter)}
                />
              )
            }
            headerActions={
              <WatchContentButton watched={watched} pending={watchPending} onClick={() => onToggleWatch(item.id)} />
            }
          />
        </div>

        <div className="w-full rounded-2xl lg:w-2/5" style={{ background: "var(--color-base-300)" }}>
          <VotingQuestionCard
            contentId={item.id}
            categoryId={item.categoryId}
            onVote={isUp => onVote(item, isUp)}
            isCommitting={isCommitting}
            address={address}
            error={voteError}
            isOwnContent={item.isOwnContent}
            embedded
          />
        </div>
      </div>
    </div>
  );
});

const Home: NextPage = () => (
  <Suspense>
    <HomeInner />
  </Suspense>
);

export default Home;
