"use client";

import { type KeyboardEvent, Suspense, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { AnimatePresence, motion } from "framer-motion";
import type { NextPage } from "next";
import { useAccount, useReadContracts } from "wagmi";
import { ShareIcon } from "@heroicons/react/24/outline";
import { CategoryFilter } from "~~/components/CategoryFilter";
import { SubmitterBadge } from "~~/components/content/SubmitterBadge";
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
import { useRoundVote } from "~~/hooks/useRoundVote";
import { SubmitterProfile, useSubmitterProfiles } from "~~/hooks/useSubmitterProfiles";
import { useUrlValidation } from "~~/hooks/useUrlValidation";
import { useUserPreferences } from "~~/hooks/useUserPreferences";
import { useVoteHistory } from "~~/hooks/useVoteHistory";
import { useVoterAccuracyBatch } from "~~/hooks/useVoterAccuracyBatch";
import { useWatchedContent } from "~~/hooks/useWatchedContent";
import { trackContentClick } from "~~/utils/clickTracker";
import { isContentItemBlocked } from "~~/utils/contentFilter";
import { detectPlatform, getThumbnailUrl } from "~~/utils/platforms";
import { notification } from "~~/utils/scaffold-eth";

const StakeSelector = dynamic(() => import("~~/components/swipe/StakeSelector").then(m => m.StakeSelector), {
  loading: () => (
    <div className="flex items-center justify-center h-96">
      <span className="loading loading-spinner loading-lg"></span>
    </div>
  ),
});

const ShareContentModal = dynamic(
  () => import("~~/components/shared/ShareContentModal").then(m => m.ShareContentModal),
  { ssr: false },
);

const ALL_FILTER = "All";
const BROKEN_FILTER = "Broken";
const slugify = (name: string) => name.toLowerCase().replace(/\s+/g, "-");
type SortOption = "for_you" | "newest" | "oldest" | "highest_rated" | "lowest_rated";
type SearchSortOption = Exclude<SortOption, "for_you">;
type ScopeOption = "all" | "watched" | "my_votes" | "my_submissions";

const SEARCH_SORT_OPTIONS: { value: SearchSortOption; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "highest_rated", label: "Highest Rated" },
  { value: "lowest_rated", label: "Lowest Rated" },
];

const SCOPE_OPTIONS: { value: ScopeOption; label: string }[] = [
  { value: "all", label: "All" },
  { value: "watched", label: "Watched" },
  { value: "my_votes", label: "My Votes" },
  { value: "my_submissions", label: "My Submissions" },
];

const HomeInner = () => {
  const searchParams = useSearchParams();
  const searchQuery = searchParams.get("q") ?? "";
  const contentParam = searchParams.get("content");

  const { address } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { isFirstVote, markVoteCompleted } = useOnboarding();
  const { feed, isLoading } = useContentFeed(address);
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

  // URL validation — async check for broken URLs
  const feedUrls = useMemo(() => feed.map(item => item.url), [feed]);
  const { validationMap } = useUrlValidation(feedUrls);

  // Filter & sort state
  const [activeCategory, setActiveCategory] = useState<string>(ALL_FILTER);
  const [scope, setScope] = useState<ScopeOption>("all");
  const [sortBy, setSortBy] = useState<SortOption>("for_you");
  const isSearchMode = searchQuery.trim().length > 0;
  const effectiveSearchSortBy: SearchSortOption = sortBy === "for_you" ? "newest" : sortBy;

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
  const scopeLoading =
    (scope === "watched" && !!address && watchedLoading) || (scope === "my_votes" && !!address && votesLoading);
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

  // Selected content for featured card
  const [selectedId, setSelectedId] = useState<bigint | null>(null);

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

  // Infinite scroll state
  const [visibleCount, setVisibleCount] = useState(20);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Voting state
  const [stakeModal, setStakeModal] = useState<{
    isOpen: boolean;
    isUp: boolean;
    contentId: bigint;
    categoryId: bigint;
  }>({ isOpen: false, isUp: false, contentId: 0n, categoryId: 0n });
  const { commitVote, isCommitting, error: voteError } = useRoundVote();

  // Batch-fetch ratings via multicall
  const { data: registryInfo } = useDeployedContractInfo({ contractName: "ContentRegistry" });
  const ratingCalls = useMemo(() => {
    if (!registryInfo || feed.length === 0) return [];
    return feed.map(item => ({
      address: registryInfo.address,
      abi: registryInfo.abi,
      functionName: "getRating" as const,
      args: [item.id],
    }));
  }, [registryInfo, feed]);

  const { data: ratingsData } = useReadContracts({ contracts: ratingCalls });

  const ratingsMap = useMemo(() => {
    const map = new Map<string, number>();
    if (!ratingsData) return map;
    feed.forEach((item, i) => {
      const result = ratingsData[i];
      if (result?.status === "success") {
        map.set(item.id.toString(), Number(result.result));
      }
    });
    return map;
  }, [ratingsData, feed]);

  // Apply search, category filter, and sort
  const displayFeed = useMemo(() => {
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
      default:
        break;
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
          items.sort((a, b) => {
            const rA = ratingsMap.get(a.id.toString()) ?? 50;
            const rB = ratingsMap.get(b.id.toString()) ?? 50;
            return rB - rA;
          });
          break;
        case "lowest_rated":
          items.sort((a, b) => {
            const rA = ratingsMap.get(a.id.toString()) ?? 50;
            const rB = ratingsMap.get(b.id.toString()) ?? 50;
            return rA - rB;
          });
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
    feed,
    searchQuery,
    isSearchMode,
    activeCategory,
    effectiveSearchSortBy,
    ratingsMap,
    categoryNameToId,
    categoryScores,
    hasPreferences,
    validationMap,
    scope,
    watchedOrderMap,
    voteOrderMap,
    watchedContentIds,
    votedContentIds,
  ]);

  // Fetch submitter profiles for all visible content
  const submitterAddresses = useMemo(() => {
    return displayFeed.map(item => item.submitter);
  }, [displayFeed]);

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

  // Selected item (defaults to first in filtered list)
  const selectedItem = useMemo(() => {
    if (displayFeed.length === 0) return null;
    if (selectedId !== null) {
      const found = displayFeed.find(i => i.id === selectedId);
      if (found) return found;
    }
    return displayFeed[0];
  }, [displayFeed, selectedId]);

  // Thumbnail grid items (everything except the selected item)
  const gridItems = useMemo(() => {
    if (!selectedItem) return displayFeed;
    return displayFeed.filter(i => i.id !== selectedItem.id);
  }, [displayFeed, selectedItem]);

  // Visible grid items for infinite scroll
  const visibleGridItems = useMemo(() => {
    return gridItems.slice(0, visibleCount);
  }, [gridItems, visibleCount]);

  // Reset visible count when filters change
  useEffect(() => {
    setVisibleCount(20);
  }, [searchQuery, activeCategory, scope, sortBy]);

  // Infinite scroll with Intersection Observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && visibleCount < gridItems.length) {
          setVisibleCount(prev => Math.min(prev + 20, gridItems.length));
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
  }, [visibleCount, gridItems.length]);

  // Vote handlers
  const handleSwipe = useCallback(
    (direction: "left" | "right") => {
      if (!selectedItem) return;
      const isUp = direction === "right";
      setStakeModal({ isOpen: true, isUp, contentId: selectedItem.id, categoryId: selectedItem.categoryId });
    },
    [selectedItem],
  );

  const handleButtonVote = (isUp: boolean) => {
    if (!selectedItem) return;
    setStakeModal({ isOpen: true, isUp, contentId: selectedItem.id, categoryId: selectedItem.categoryId });
  };

  const handleConfirmStake = async (stakeAmount: number) => {
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
      // Advance to next item
      if (selectedItem && displayFeed.length > 1) {
        const currentIdx = displayFeed.findIndex(i => i.id === selectedItem.id);
        const nextIdx = (currentIdx + 1) % displayFeed.length;
        const nextId = displayFeed[nextIdx].id;
        setSelectedId(nextId);
        const url = new URL(window.location.href);
        url.searchParams.set("content", nextId.toString());
        history.replaceState(null, "", url.toString());
      }
    }
  };

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
      <div className="w-full max-w-5xl">
        <VotingGuide />
        <div className="mb-4 flex items-start gap-3">
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
            <FeedScopeFilter value={scope} options={SCOPE_OPTIONS} onChange={value => setScope(value as ScopeOption)} />
          ) : null}
          <div className="hidden shrink-0 sm:flex">
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

        <div className="sm:hidden">
          <StreakCounter />
        </div>

        {/* Main content */}
        {isLoading || categoriesLoading || scopeLoading ? (
          <div className="flex justify-center py-16">
            <span className="loading loading-spinner loading-lg text-primary"></span>
          </div>
        ) : displayFeed.length === 0 ? (
          <div className="text-center py-16 text-base-content/30 text-base">{emptyStateMessage}</div>
        ) : (
          <>
            {/* Featured card */}
            {selectedItem && (
              <div className="mb-8">
                {isCommitting && (
                  <div className="flex items-center justify-center mb-2">
                    <span className="text-base text-base-content/50">
                      <span className="loading loading-spinner loading-xs mr-1.5"></span>
                      Committing...
                    </span>
                  </div>
                )}

                {/* Unified content + voting card */}
                <AnimatePresence mode="wait">
                  <motion.div
                    key={selectedItem.id.toString()}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                    className="surface-card rounded-2xl p-3 mb-4"
                  >
                    <div className="flex flex-col lg:flex-row gap-3 items-stretch">
                      {/* Content sub-card */}
                      <div
                        className="w-full lg:w-3/5 rounded-2xl overflow-hidden"
                        style={{ background: "var(--color-base-300)" }}
                      >
                        <SwipeCard
                          content={selectedItem}
                          submitterProfile={enrichedProfiles[selectedItem.submitter.toLowerCase()]}
                          onSwipe={handleSwipe}
                          isTop={true}
                          index={0}
                          canVote={!!address}
                          standalone
                          embedded
                          submitterAction={
                            normalizedAddress && selectedItem.submitter.toLowerCase() === normalizedAddress ? null : (
                              <FollowProfileButton
                                following={followedWallets.has(selectedItem.submitter.toLowerCase())}
                                pending={isFollowPending(selectedItem.submitter)}
                                onClick={() => {
                                  void handleToggleFollow(selectedItem.submitter);
                                }}
                              />
                            )
                          }
                          headerActions={
                            <WatchContentButton
                              watched={watchedContentIds.has(selectedItem.id.toString())}
                              pending={isWatchPending(selectedItem.id)}
                              onClick={() => {
                                void handleToggleWatch(selectedItem.id);
                              }}
                            />
                          }
                        />
                      </div>

                      {/* Voting sub-card */}
                      <div className="w-full lg:w-2/5 rounded-2xl" style={{ background: "var(--color-base-300)" }}>
                        <VotingQuestionCard
                          contentId={selectedItem.id}
                          categoryId={selectedItem.categoryId}
                          onVote={handleButtonVote}
                          isCommitting={isCommitting}
                          address={address}
                          error={voteError}
                          isOwnContent={selectedItem.isOwnContent}
                          embedded
                        />
                      </div>
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>
            )}

            {/* Thumbnail grid with infinite scroll */}
            {gridItems.length > 0 && (
              <div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {visibleGridItems.map(item => (
                    <ThumbnailCard
                      key={item.id.toString()}
                      item={item}
                      rating={ratingsMap.get(item.id.toString())}
                      submitterProfile={enrichedProfiles[item.submitter.toLowerCase()]}
                      onSelect={handleSelectCard}
                      onToggleWatch={handleToggleWatch}
                      onToggleFollow={handleToggleFollow}
                      watched={watchedContentIds.has(item.id.toString())}
                      watchPending={isWatchPending(item.id)}
                      following={followedWallets.has(item.submitter.toLowerCase())}
                      followPending={isFollowPending(item.submitter)}
                      isOwnSubmitter={normalizedAddress === item.submitter.toLowerCase()}
                    />
                  ))}
                </div>
                {/* Load more trigger */}
                {visibleCount < gridItems.length && (
                  <div ref={loadMoreRef} className="flex justify-center py-8">
                    <span className="loading loading-spinner loading-md text-primary"></span>
                  </div>
                )}
              </div>
            )}
          </>
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
    </div>
  );
};

const ThumbnailCard = memo(function ThumbnailCard({
  item,
  rating,
  submitterProfile,
  onSelect,
  onToggleWatch,
  onToggleFollow,
  watched,
  watchPending,
  following,
  followPending,
  isOwnSubmitter,
}: {
  item: ContentItem;
  rating?: number;
  submitterProfile?: SubmitterProfile;
  onSelect: (id: bigint, categoryId: bigint) => void;
  onToggleWatch: (id: bigint) => void;
  onToggleFollow: (address: string) => void;
  watched: boolean;
  watchPending: boolean;
  following: boolean;
  followPending: boolean;
  isOwnSubmitter: boolean;
}) {
  const onClick = useCallback(() => onSelect(item.id, item.categoryId), [onSelect, item.id, item.categoryId]);
  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.target !== event.currentTarget) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onClick();
      }
    },
    [onClick],
  );
  const platformInfo = detectPlatform(item.url);
  const rawStaticThumbnail = getThumbnailUrl(item.url);
  const staticThumbnail =
    rawStaticThumbnail && (rawStaticThumbnail.startsWith("http://") || rawStaticThumbnail.startsWith("https://"))
      ? `/api/image-proxy?url=${encodeURIComponent(rawStaticThumbnail)}`
      : rawStaticThumbnail;
  const [asyncThumbnail, setAsyncThumbnail] = useState<string | null>(null);
  const thumbnail = staticThumbnail || asyncThumbnail;

  // Fetch thumbnail via server-side proxy (avoids CORS and caches results)
  // Stagger requests with a random delay to avoid burst 429s on page load
  useEffect(() => {
    if (staticThumbnail) return;

    let cancelled = false;
    const delay = Math.random() * 1000; // spread over 1s

    const timer = setTimeout(() => {
      if (cancelled) return;
      fetch(`/api/thumbnail?url=${encodeURIComponent(item.url)}`)
        .then(r => (r.ok ? r.json() : null))
        .then(data => {
          if (!cancelled && data?.thumbnailUrl) {
            // Route external images through the proxy to avoid CORS issues
            const url = data.thumbnailUrl as string;
            const isExternal = url.startsWith("http://") || url.startsWith("https://");
            setAsyncThumbnail(isExternal ? `/api/image-proxy?url=${encodeURIComponent(url)}` : url);
          }
        })
        .catch(() => {});
    }, delay);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [staticThumbnail, item.url]);

  const [showShare, setShowShare] = useState(false);

  const isVideo = ["youtube", "twitch"].includes(platformInfo.type);
  const displayRating = rating ?? 50;
  const ratingColor =
    displayRating >= 60 ? "text-success" : displayRating <= 40 ? "text-error" : "text-base-content/60";

  // Platform badge component
  const PlatformBadge = () => {
    switch (platformInfo.type) {
      case "youtube":
        return (
          <svg className="w-4 h-4 text-[#FF0000]" viewBox="0 0 24 24" fill="currentColor">
            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
          </svg>
        );
      case "twitch":
        return (
          <svg className="w-4 h-4 text-[#9146FF]" viewBox="0 0 24 24" fill="currentColor">
            <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z" />
          </svg>
        );
      default: {
        const domain = (() => {
          try {
            return new URL(item.url).hostname.replace(/^(www\.|en\.)/, "");
          } catch {
            return null;
          }
        })();
        return domain ? (
          <img
            src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
            alt={`${domain} icon`}
            className="w-4 h-4 rounded-sm"
            loading="lazy"
          />
        ) : (
          <svg
            className="w-4 h-4 text-base-content/40"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-3.02a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364L4.343 8.05"
            />
          </svg>
        );
      }
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={onKeyDown}
      data-testid="content-thumbnail"
      className="group text-left rounded-xl overflow-hidden transition-all surface-card hover:scale-[1.02] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
    >
      {/* Thumbnail */}
      <div className="relative aspect-video bg-base-200 overflow-hidden">
        {thumbnail ? (
          <img
            src={thumbnail}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
            onError={e => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <PlatformBadge />
          </div>
        )}
        {/* Play icon overlay for video platforms */}
        {isVideo && thumbnail && (
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="w-8 h-8 rounded-full bg-black/60 flex items-center justify-center">
              <svg className="w-4 h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
        )}
        {/* Platform badge */}
        <div className="absolute bottom-1.5 left-1.5">
          <div className="px-1.5 py-0.5 rounded bg-black/60 backdrop-blur">
            <PlatformBadge />
          </div>
        </div>
        {/* Rating badge */}
        <div className="absolute top-1.5 right-1.5">
          <span
            className={`px-1.5 py-0.5 rounded-full bg-base-100/80 backdrop-blur text-base font-semibold tabular-nums ${ratingColor}`}
          >
            {displayRating}%
          </span>
        </div>
        {/* Watch + share actions */}
        <div className="absolute top-1.5 left-1.5 flex items-center gap-1">
          <WatchContentButton
            watched={watched}
            pending={watchPending}
            onClick={() => onToggleWatch(item.id)}
            variant="overlay"
          />
          <button
            type="button"
            className="p-1 rounded bg-black/60 backdrop-blur hover:bg-black/80 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
            onClick={e => {
              e.stopPropagation();
              setShowShare(true);
            }}
            aria-label="Share content"
          >
            <ShareIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Card body */}
      <div className="p-2.5 space-y-1.5">
        {/* Submitter info */}
        <SubmitterBadge
          address={item.submitter}
          username={submitterProfile?.username}
          profileImageUrl={submitterProfile?.profileImageUrl}
          winRate={submitterProfile?.winRate}
          totalSettledVotes={submitterProfile?.totalSettledVotes}
          action={
            isOwnSubmitter ? null : (
              <FollowProfileButton
                following={following}
                pending={followPending}
                onClick={() => onToggleFollow(item.submitter)}
              />
            )
          }
        />
        <p className="text-base font-medium line-clamp-2 leading-snug">{item.goal}</p>
        {item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {item.tags.slice(0, 2).map(tag => (
              <span key={tag} className="px-1.5 py-0.5 bg-primary/10 text-primary text-base font-medium rounded-full">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {showShare && <ShareContentModal contentId={item.id} goal={item.goal} onClose={() => setShowShare(false)} />}
    </div>
  );
});

const Home: NextPage = () => (
  <Suspense>
    <HomeInner />
  </Suspense>
);

export default Home;
