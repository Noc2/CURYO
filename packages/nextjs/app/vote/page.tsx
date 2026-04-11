"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname, useSearchParams } from "next/navigation";
import type { NextPage } from "next";
import { useAccount } from "wagmi";
import { CategoryFilter } from "~~/components/CategoryFilter";
import { AppPageShell } from "~~/components/shared/AppPageShell";
import { StreakCounter } from "~~/components/shared/StreakCounter";
import { VotingQuestionCard } from "~~/components/shared/VotingQuestionCard";
import { FeedScopeFilter } from "~~/components/vote/FeedScopeFilter";
import { VoteSignalRail } from "~~/components/vote/VoteSignalRail";
import { useMobileHeaderVisibility } from "~~/contexts/MobileHeaderVisibilityContext";
import { MIN_CONTENT_SEARCH_QUERY_LENGTH, isContentSearchQueryTooShort } from "~~/hooks/contentFeed/shared";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";
import { useCategoryPopularity } from "~~/hooks/useCategoryPopularity";
import { useCategoryRegistry } from "~~/hooks/useCategoryRegistry";
import type { ContentItem } from "~~/hooks/useContentFeed";
import { useContentFeed } from "~~/hooks/useContentFeed";
import { useCuryoConnectModal } from "~~/hooks/useCuryoConnectModal";
import { useDelegation } from "~~/hooks/useDelegation";
import { useDiscoverSignals } from "~~/hooks/useDiscoverSignals";
import { useFollowedProfiles } from "~~/hooks/useFollowedProfiles";
import { useInterestProfile } from "~~/hooks/useInterestProfile";
import { useLiveVoteCooldown } from "~~/hooks/useLiveVoteCooldown";
import { useOnboarding } from "~~/hooks/useOnboarding";
import { useRoundVote } from "~~/hooks/useRoundVote";
import { SubmitterProfile, useSubmitterProfiles } from "~~/hooks/useSubmitterProfiles";
import { useUnixTime } from "~~/hooks/useUnixTime";
import { useVoteFeedStage } from "~~/hooks/useVoteFeedStage";
import { useVoteHistoryQuery } from "~~/hooks/useVoteHistoryQuery";
import { useVoterAccuracyBatch } from "~~/hooks/useVoterAccuracyBatch";
import { useVoterIdNFT } from "~~/hooks/useVoterIdNFT";
import { useWatchedContent } from "~~/hooks/useWatchedContent";
import { mergeVoteHistoryItems } from "~~/hooks/voteHistory/shared";
import {
  VOTE_COOLDOWN_SECONDS,
  formatVoteCooldownRemaining,
  getVoteCooldownRemainingSeconds,
} from "~~/lib/vote/cooldown";
import {
  DISCOVER_ALL_FILTER,
  DISCOVER_BROKEN_FILTER,
  filterDiscoverCategoryItems,
} from "~~/lib/vote/discoverFeedFilter";
import {
  type FeedExposureScope,
  applyFeedExposurePolicy,
  buildFeedExposureScope,
  recordFeedExposure,
  recordFeedPositiveInteraction,
} from "~~/lib/vote/feedExposure";
import { type DiscoverFeedMode, sortDiscoverFeed } from "~~/lib/vote/feedModes";
import { rankForYouFeed } from "~~/lib/vote/forYouRanker";
import { buildLinkedWalletAddresses } from "~~/lib/vote/linkedWalletAddresses";
import { shouldUseAddressLogCooldownFallback } from "~~/lib/vote/liveCooldown";
import { buildVoteContentPinKey, buildVoteContentPinKeyFromUrl, buildVoteLocation } from "~~/lib/vote/location";
import { mergeRequestedContentIntoFeed } from "~~/lib/vote/requestedContent";
import { resolveStableSessionFeedOrder } from "~~/lib/vote/stableFeedOrder";
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
const FOR_YOU_CANDIDATE_PAGE_MULTIPLIER = 6;
const FEED_PREFETCH_BUFFER = 6;
const MOBILE_VOTE_DOCK_RESERVED_SPACE_PX = 152;
const CONTENT_INTENT_PROMPT_MS = 1_400;
const INTERNAL_CONTENT_PIN_STORAGE_KEY = "curyo_internal_vote_content_pin";
const INTERNAL_CONTENT_PIN_TTL_MS = 6 * 60 * 60 * 1000;

interface InternalContentPinMarker {
  key: string;
  savedAt: number;
}

function areIdListsEqual(left: readonly string[], right: readonly string[]) {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function getVoteCooldownMessage(seconds: number) {
  return `You already voted on this content recently. Try again in ${formatVoteCooldownRemaining(seconds)}.`;
}

function readInternalContentPinKey(contentPinKey: string | null) {
  if (!contentPinKey || typeof window === "undefined") return null;

  try {
    const rawMarker = window.sessionStorage.getItem(INTERNAL_CONTENT_PIN_STORAGE_KEY);
    if (!rawMarker) return null;

    const marker = JSON.parse(rawMarker) as Partial<InternalContentPinMarker>;
    if (marker.key !== contentPinKey || typeof marker.savedAt !== "number") {
      return null;
    }

    if (Date.now() - marker.savedAt > INTERNAL_CONTENT_PIN_TTL_MS) {
      window.sessionStorage.removeItem(INTERNAL_CONTENT_PIN_STORAGE_KEY);
      return null;
    }

    return marker.key;
  } catch {
    return null;
  }
}

function writeInternalContentPinKey(contentPinKey: string | null) {
  if (typeof window === "undefined") return;

  try {
    if (!contentPinKey) {
      window.sessionStorage.removeItem(INTERNAL_CONTENT_PIN_STORAGE_KEY);
      return;
    }

    const marker: InternalContentPinMarker = {
      key: contentPinKey,
      savedAt: Date.now(),
    };
    window.sessionStorage.setItem(INTERNAL_CONTENT_PIN_STORAGE_KEY, JSON.stringify(marker));
  } catch {
    // sessionStorage can be unavailable in private or embedded contexts.
  }
}

interface ActiveViewSession {
  contentId: string;
  feedExposureScope: FeedExposureScope;
  hasPositiveInteraction: boolean;
  shouldTrackFeedExposure: boolean;
  startedAt: number;
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
  const pathname = usePathname();
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
  const contentPinKey = useMemo(
    () =>
      requestedActiveId !== null && searchParams ? buildVoteContentPinKey(pathname ?? "/vote", searchParams) : null,
    [pathname, requestedActiveId, searchParams],
  );
  const [internallySyncedContentPinKey, setInternallySyncedContentPinKey] = useState<string | null>(() =>
    readInternalContentPinKey(contentPinKey),
  );
  const hasExplicitRequestedContentPin =
    requestedActiveId !== null && contentPinKey !== null && internallySyncedContentPinKey !== contentPinKey;

  useEffect(() => {
    setInternallySyncedContentPinKey(readInternalContentPinKey(contentPinKey));
  }, [contentPinKey]);

  const { address } = useAccount();
  const { targetNetwork } = useTargetNetwork();
  const normalizedAddress = address?.toLowerCase();
  const { isMobileHeaderVisible, mobileHeaderHeight, setIsMobileHeaderVisible, setMobileHeaderVoteControls } =
    useMobileHeaderVisibility();
  const nowSeconds = useUnixTime(60_000);
  const { openConnectModal } = useCuryoConnectModal();
  const { isFirstVote, markVoteCompleted } = useOnboarding();
  const [activeCategory, setActiveCategory] = useState<string>(ALL_FILTER);
  const [view, setView] = useState<VoteView>("for_you");
  const [sortBy, setSortBy] = useState<SortOption>("for_you");
  const [visibleCount, setVisibleCount] = useState(FEED_PAGE_SIZE);
  const [interactionVersion, setInteractionVersion] = useState(0);
  const [voteAttention, setVoteAttention] = useState<{ contentId: string; token: number } | null>(null);
  const [optimisticOwnContentIds, setOptimisticOwnContentIds] = useState<Set<string>>(() => new Set());
  const [optimisticVotedContentIds, setOptimisticVotedContentIds] = useState<Set<string>>(() => new Set());
  const desktopScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const mobileDockContainerRef = useRef<HTMLDivElement | null>(null);
  const voteAttentionTimeoutRef = useRef<number | null>(null);
  const voteAttentionTokenRef = useRef(0);
  const [mobileDockReservedSpace, setMobileDockReservedSpace] = useState<number | null>(null);
  const [optimisticCooldownUntilByContentId, setOptimisticCooldownUntilByContentId] = useState<Map<string, number>>(
    () => new Map(),
  );
  const trimmedSearchQuery = searchQuery.trim();
  const isSearchMode = trimmedSearchQuery.length > 0;
  const isShortSearchQuery = isContentSearchQueryTooShort(trimmedSearchQuery);
  const effectiveSearchSortBy: SearchSortOption = sortBy === "for_you" ? "relevance" : sortBy;
  const { categories: websiteCategories, categoryNameToId, isLoading: categoriesLoading } = useCategoryRegistry();
  const { delegateTo, delegateOf, hasDelegate, isDelegate, isLoading: delegationLoading } = useDelegation(address);
  const delegateVoteAddress = hasDelegate ? delegateTo : undefined;
  const delegatorVoteAddress = isDelegate ? delegateOf : undefined;
  const { hasVoterId: voteCooldownHasVoterId, isResolved: voteCooldownIdentityResolved } = useVoterIdNFT(address);
  const canUseAddressLogVoteCooldownFallback = shouldUseAddressLogCooldownFallback({
    hasVoterId: voteCooldownHasVoterId,
    isIdentityResolved: voteCooldownIdentityResolved,
  });
  const voteCooldownAddresses = useMemo(
    () => buildLinkedWalletAddresses(address, delegateVoteAddress, delegatorVoteAddress),
    [address, delegateVoteAddress, delegatorVoteAddress],
  );
  const ownSubmitterAddresses = useMemo(
    () => buildLinkedWalletAddresses(address, delegateVoteAddress, delegatorVoteAddress),
    [address, delegateVoteAddress, delegatorVoteAddress],
  );
  const ownSubmitterAddressesKey = useMemo(() => ownSubmitterAddresses.join(","), [ownSubmitterAddresses]);
  const { votes: directVotes, isLoading: directVotesLoading } = useVoteHistoryQuery(address);
  const { votes: delegateVotes, isLoading: delegateVotesLoading } = useVoteHistoryQuery(delegateVoteAddress);
  const { votes: delegatorVotes, isLoading: delegatorVotesLoading } = useVoteHistoryQuery(delegatorVoteAddress);
  const votes = useMemo(
    () => mergeVoteHistoryItems([directVotes, delegateVotes, delegatorVotes]),
    [delegateVotes, delegatorVotes, directVotes],
  );
  const votesLoading = directVotesLoading || delegateVotesLoading || delegatorVotesLoading || delegationLoading;
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
  const isAlgorithmicForYouFeed =
    !isSearchMode && activeScope === "all" && activeFeedMode === "for_you" && !hasExplicitRequestedContentPin;
  const feedRequestLimit = Math.max(
    isAlgorithmicForYouFeed
      ? FEED_PAGE_SIZE * FOR_YOU_CANDIDATE_PAGE_MULTIPLIER
      : !isSearchMode && activeScope === "all"
        ? FEED_PAGE_SIZE * 4
        : FEED_PAGE_SIZE * 2,
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
    feed: rawFeed,
    isLoading,
    isMetadataPrefetchPending,
    totalContent: serverTotalContent,
    hasMore: serverHasMoreFeed,
  } = useContentFeed(address, {
    categoryId: activeCategoryId,
    contentIds: feedContentIds,
    limit: feedRequestLimit,
    ownSubmitterAddresses,
    searchQuery: searchQuery.trim() || undefined,
    sortBy: isSearchMode ? effectiveSearchSortBy : "newest",
    submitters: activeScope === "my_submissions" ? ownSubmitterAddresses : undefined,
  });
  const feed = useMemo(
    () =>
      rawFeed.map(item =>
        optimisticOwnContentIds.has(item.id.toString()) && !item.isOwnContent ? { ...item, isOwnContent: true } : item,
      ),
    [optimisticOwnContentIds, rawFeed],
  );
  const feedContainsRequestedContent = useMemo(() => {
    if (effectiveRequestedActiveId === null) return false;
    return feed.some(item => item.id === effectiveRequestedActiveId);
  }, [effectiveRequestedActiveId, feed]);
  const { feed: rawRequestedContentFeed, isLoading: requestedContentLoading } = useContentFeed(address, {
    contentIds: requestedContentIds,
    enabled: effectiveRequestedActiveId !== null && !feedContainsRequestedContent,
    keepPrevious: false,
    limit: 1,
    ownSubmitterAddresses,
  });
  const requestedContentFeed = useMemo(
    () =>
      rawRequestedContentFeed.map(item =>
        optimisticOwnContentIds.has(item.id.toString()) && !item.isOwnContent ? { ...item, isOwnContent: true } : item,
      ),
    [optimisticOwnContentIds, rawRequestedContentFeed],
  );
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
  const resolvedVoteCooldownByContentId = useMemo(() => {
    const cooldowns = new Map(voteCooldownByContentId);

    optimisticCooldownUntilByContentId.forEach((cooldownUntil, contentId) => {
      if (cooldowns.has(contentId)) return;

      const remainingSeconds = Math.max(0, cooldownUntil - nowSeconds);
      if (remainingSeconds > 0) {
        cooldowns.set(contentId, remainingSeconds);
      }
    });

    return cooldowns;
  }, [nowSeconds, optimisticCooldownUntilByContentId, voteCooldownByContentId]);

  useEffect(() => {
    setOptimisticOwnContentIds(previous => (previous.size === 0 ? previous : new Set()));
    setOptimisticVotedContentIds(previous => (previous.size === 0 ? previous : new Set()));
    setOptimisticCooldownUntilByContentId(previous => (previous.size === 0 ? previous : new Map()));
  }, [address, targetNetwork.id]);

  useEffect(() => {
    setOptimisticOwnContentIds(previous => (previous.size === 0 ? previous : new Set()));
  }, [ownSubmitterAddressesKey]);

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

  useEffect(() => {
    if (optimisticCooldownUntilByContentId.size === 0) return;

    setOptimisticCooldownUntilByContentId(previous => {
      let changed = false;
      const next = new Map<string, number>();

      previous.forEach((cooldownUntil, contentId) => {
        if (voteCooldownByContentId.has(contentId) || cooldownUntil <= nowSeconds) {
          changed = true;
          return;
        }
        next.set(contentId, cooldownUntil);
      });

      return changed ? next : previous;
    });
  }, [nowSeconds, optimisticCooldownUntilByContentId.size, voteCooldownByContentId]);

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
  const feedExposureScope = useMemo(
    () =>
      buildFeedExposureScope({
        address: normalizedAddress,
        chainId: targetNetwork.id,
      }),
    [normalizedAddress, targetNetwork.id],
  );

  useEffect(() => {
    if (!address && isActivityViewOption(view)) {
      setView("for_you");
    }
  }, [address, view]);

  const displayFeedRef = useRef<ContentItem[]>([]);
  const activeViewSessionRef = useRef<ActiveViewSession | null>(null);
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
  const markPrimaryInteraction = useCallback(
    (contentId: bigint, options: { isVote?: boolean } = {}) => {
      if (activeViewSessionRef.current?.contentId === contentId.toString()) {
        activeViewSessionRef.current.hasPositiveInteraction = true;
      }

      recordFeedPositiveInteraction(feedExposureScope, { contentId, isVote: options.isVote });
    },
    [feedExposureScope],
  );
  const triggerVoteAttention = useCallback((contentId: bigint) => {
    if (typeof window === "undefined") return;

    voteAttentionTokenRef.current += 1;
    const token = voteAttentionTokenRef.current;
    setVoteAttention({ contentId: contentId.toString(), token });

    if (voteAttentionTimeoutRef.current !== null) {
      window.clearTimeout(voteAttentionTimeoutRef.current);
    }

    voteAttentionTimeoutRef.current = window.setTimeout(() => {
      setVoteAttention(current => (current?.token === token ? null : current));
      voteAttentionTimeoutRef.current = null;
    }, CONTENT_INTENT_PROMPT_MS);
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

      if (session.shouldTrackFeedExposure) {
        recordFeedExposure(session.feedExposureScope, {
          contentId: session.contentId,
          hasPositiveInteraction: session.hasPositiveInteraction,
        });
      }

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
          applyFeedExposurePolicy(
            rankForYouFeed(items, {
              nowSeconds,
              profile: interestProfile,
              votedContentIds,
              watchedContentIds,
              followedWallets,
            }),
            {
              enabled: isAlgorithmicForYouFeed,
              minVisibleItems: FEED_PAGE_SIZE,
              now: nowSeconds * 1000,
              protectedContentIds: effectiveRequestedActiveId !== null ? [effectiveRequestedActiveId] : [],
              scope: feedExposureScope,
            },
          ),
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
    isAlgorithmicForYouFeed,
    isSearchMode,
    nowSeconds,
    voteOrderMap,
    settlingSoonOrderMap,
    votedContentIds,
    watchedContentIds,
    watchedOrderMap,
    effectiveRequestedActiveId,
    requestedContentItem,
    feedExposureScope,
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
  const prioritizedFeedIds = useMemo(
    () => (effectiveRequestedActiveId !== null ? [effectiveRequestedActiveId.toString()] : []),
    [effectiveRequestedActiveId],
  );
  const rankedDisplayFeedIds = useMemo(() => rankedDisplayFeed.map(item => item.id.toString()), [rankedDisplayFeed]);
  const [stableDisplayFeedState, setStableDisplayFeedState] = useState<{ sessionKey: string; ids: string[] }>(() => ({
    sessionKey: feedSessionKey,
    ids: rankedDisplayFeedIds,
  }));
  const stableDisplayFeedIds = useMemo(
    () =>
      resolveStableSessionFeedOrder({
        previousIds: stableDisplayFeedState.ids,
        previousSessionKey: stableDisplayFeedState.sessionKey,
        nextIds: rankedDisplayFeedIds,
        nextSessionKey: feedSessionKey,
        prioritizedIds: prioritizedFeedIds,
      }),
    [
      feedSessionKey,
      prioritizedFeedIds,
      rankedDisplayFeedIds,
      stableDisplayFeedState.ids,
      stableDisplayFeedState.sessionKey,
    ],
  );

  useEffect(() => {
    setStableDisplayFeedState(previousState => {
      const nextIds = resolveStableSessionFeedOrder({
        previousIds: previousState.ids,
        previousSessionKey: previousState.sessionKey,
        nextIds: rankedDisplayFeedIds,
        nextSessionKey: feedSessionKey,
        prioritizedIds: prioritizedFeedIds,
      });

      if (previousState.sessionKey === feedSessionKey && areIdListsEqual(previousState.ids, nextIds)) {
        return previousState;
      }

      return {
        sessionKey: feedSessionKey,
        ids: nextIds,
      };
    });
  }, [feedSessionKey, prioritizedFeedIds, rankedDisplayFeedIds]);

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
    sessionKey: feedSessionKey,
    visibleCount,
    requestedActiveId: effectiveRequestedActiveId,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const dockNode = mobileDockContainerRef.current;
    if (!dockNode) {
      setMobileDockReservedSpace(current => (current === null ? current : null));
      return;
    }

    let frameId = 0;
    let resizeObserver: ResizeObserver | null = null;

    const measureDockSpace = () => {
      const nextReservedSpace = Math.max(
        MOBILE_VOTE_DOCK_RESERVED_SPACE_PX,
        Math.ceil(window.innerHeight - dockNode.getBoundingClientRect().top),
      );
      setMobileDockReservedSpace(current => (current === nextReservedSpace ? current : nextReservedSpace));
    };

    const requestDockMeasurement = () => {
      if (frameId !== 0) {
        window.cancelAnimationFrame(frameId);
      }

      frameId = window.requestAnimationFrame(() => {
        frameId = 0;
        measureDockSpace();
      });
    };

    requestDockMeasurement();
    window.addEventListener("resize", requestDockMeasurement);

    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(requestDockMeasurement);
      resizeObserver.observe(dockNode);
    }

    return () => {
      if (frameId !== 0) {
        window.cancelAnimationFrame(frameId);
      }
      window.removeEventListener("resize", requestDockMeasurement);
      resizeObserver?.disconnect();
    };
  }, [primaryItem?.id]);

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
      feedExposureScope,
      startedAt: Date.now(),
      hasPositiveInteraction: false,
      shouldTrackFeedExposure: isAlgorithmicForYouFeed,
    };
    activeViewSessionRef.current = session;

    return () => {
      if (activeViewSessionRef.current === session) {
        flushActiveViewSession(false);
      }
    };
  }, [feedExposureScope, flushActiveViewSession, isAlgorithmicForYouFeed, persistRecommendationSignal, primaryItem]);

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
    (contentId: bigint) => resolvedVoteCooldownByContentId.get(contentId.toString()) ?? 0,
    [resolvedVoteCooldownByContentId],
  );

  const primaryItemKnownCooldownSeconds = primaryItem ? getContentCooldownSeconds(primaryItem.id) : 0;
  const { cooldownSecondsRemaining: primaryItemLiveCooldownSeconds } = useLiveVoteCooldown({
    contentId: primaryItem?.id,
    voters: voteCooldownAddresses,
    nowSeconds,
    enabled:
      primaryItem !== null &&
      primaryItem !== undefined &&
      primaryItemKnownCooldownSeconds === 0 &&
      canUseAddressLogVoteCooldownFallback &&
      voteCooldownAddresses.length > 0,
  });
  const primaryItemCooldownSeconds = Math.max(primaryItemKnownCooldownSeconds, primaryItemLiveCooldownSeconds);
  const primaryAttentionToken =
    primaryItem && voteAttention?.contentId === primaryItem.id.toString() ? voteAttention.token : null;
  const stakeModalNeedsLiveCooldown =
    stakeModal.contentId > 0n && (primaryItem?.id === undefined || stakeModal.contentId !== primaryItem.id);
  const stakeModalKnownCooldownSeconds =
    stakeModal.contentId > 0n ? getContentCooldownSeconds(stakeModal.contentId) : 0;
  const { cooldownSecondsRemaining: stakeModalLiveCooldownSeconds } = useLiveVoteCooldown({
    contentId: stakeModalNeedsLiveCooldown ? stakeModal.contentId : undefined,
    voters: voteCooldownAddresses,
    nowSeconds,
    enabled:
      stakeModalNeedsLiveCooldown &&
      stakeModalKnownCooldownSeconds === 0 &&
      canUseAddressLogVoteCooldownFallback &&
      voteCooldownAddresses.length > 0,
  });
  const stakeModalCooldownSeconds = Math.max(
    stakeModalKnownCooldownSeconds,
    stakeModalNeedsLiveCooldown ? stakeModalLiveCooldownSeconds : primaryItemLiveCooldownSeconds,
  );

  // Reset visible count when filters change
  useEffect(() => {
    setVisibleCount(FEED_PAGE_SIZE);
  }, [searchQuery, activeCategory, view, sortBy]);

  useEffect(() => {
    if (!voteError?.includes("You already voted on this content within the last")) return;

    const contentId =
      stakeModal.contentId > 0n ? stakeModal.contentId : primaryItem?.id !== undefined ? primaryItem.id : null;
    if (contentId === null) return;

    const key = contentId.toString();
    if (voteCooldownByContentId.has(key)) return;

    setOptimisticCooldownUntilByContentId(previous => {
      if (previous.get(key) !== undefined) return previous;
      const next = new Map(previous);
      next.set(key, nowSeconds + VOTE_COOLDOWN_SECONDS);
      return next;
    });
  }, [nowSeconds, primaryItem?.id, stakeModal.contentId, voteCooldownByContentId, voteError]);

  useEffect(() => {
    if (!voteError?.toLowerCase().includes("own content")) return;

    const contentId =
      stakeModal.contentId > 0n ? stakeModal.contentId : primaryItem?.id !== undefined ? primaryItem.id : null;
    if (contentId === null) return;

    const key = contentId.toString();
    setOptimisticOwnContentIds(previous => {
      if (previous.has(key)) return previous;
      const next = new Set(previous);
      next.add(key);
      return next;
    });
  }, [primaryItem?.id, stakeModal.contentId, voteError]);

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

      if (item.isOwnContent) {
        notification.info("You cannot vote on your own content.", { duration: 6000 });
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
    const nextUrl = buildVoteLocation(window.location.href, update);
    history.replaceState(null, "", nextUrl);

    if (update.contentId !== undefined) {
      const nextContentPinKey = update.contentId === null ? null : buildVoteContentPinKeyFromUrl(nextUrl);
      writeInternalContentPinKey(nextContentPinKey);
      setInternallySyncedContentPinKey(nextContentPinKey);
    }
  }, []);

  const clearActiveContentPin = useCallback(() => {
    selectContent(null);
    replaceVoteLocation({ contentId: null });
  }, [replaceVoteLocation, selectContent]);

  const handleSearchSortChange = useCallback(
    (nextSortBy: SearchSortOption) => {
      if (nextSortBy === effectiveSearchSortBy) return;

      setIsMobileHeaderVisible(true);
      clearActiveContentPin();
      setSortBy(nextSortBy);
    },
    [clearActiveContentPin, effectiveSearchSortBy, setIsMobileHeaderVisible],
  );

  // Sync category selection with URL hash (e.g. /#books, /#board-games)
  const selectCategory = useCallback(
    (name: string) => {
      setIsMobileHeaderVisible(true);
      setActiveCategory(name);
      replaceVoteLocation({
        contentId: null,
        categoryHash: name === ALL_FILTER ? null : slugify(name),
      });
    },
    [replaceVoteLocation, setIsMobileHeaderVisible],
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
      if (activeSourceIndex < 0) {
        return false;
      }
      return setActiveFeedIndex(targetIndex, { syncLocation: true });
    },
    [activeSourceIndex, setActiveFeedIndex],
  );

  const handleSelectByIndex = useCallback(
    (targetIndex: number) => {
      return setActiveFeedIndex(targetIndex, { syncLocation: true });
    },
    [setActiveFeedIndex],
  );

  const handleLoadMore = useCallback(() => {
    setVisibleCount(prev => prev + FEED_PAGE_SIZE);
  }, []);

  const handleConfirmStake = useCallback(
    async (stakeAmount: number) => {
      const cooldownSeconds = stakeModalCooldownSeconds;
      if (cooldownSeconds > 0) {
        notification.info(getVoteCooldownMessage(cooldownSeconds), { duration: 6000 });
        setStakeModal(prev => ({ ...prev, isOpen: false }));
        return;
      }

      const item = displayFeed.find(i => i.id === stakeModal.contentId);
      if (item?.isOwnContent) {
        notification.info("You cannot vote on your own content.", { duration: 6000 });
        setStakeModal(prev => ({ ...prev, isOpen: false }));
        return;
      }
      const committedIndex = displayFeed.findIndex(i => i.id === stakeModal.contentId);
      const success = await commitVote({
        contentId: stakeModal.contentId,
        isUp: stakeModal.isUp,
        isOwnContent: item?.isOwnContent,
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
        markPrimaryInteraction(item.id, { isVote: true });
        recordRecommendationSignal(item, "vote_commit", { isUp: stakeModal.isUp });
      }

      const nextIndex = committedIndex >= 0 ? Math.min(committedIndex + 1, displayFeed.length - 1) : -1;
      const advanced = nextIndex > committedIndex ? handleSelectByIndex(nextIndex) : false;
      notification.success(
        advanced
          ? `Vote submitted! Stake: ${stakeAmount} cREP · next card ready`
          : `Vote submitted! Stake: ${stakeAmount} cREP`,
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

  const handleContentIntent = useCallback(
    (item: ContentItem) => {
      replaceVoteLocation({ contentId: item.id });
      markPrimaryInteraction(item.id);
      recordRecommendationSignal(item, "card_open");
      triggerVoteAttention(item.id);
    },
    [markPrimaryInteraction, recordRecommendationSignal, replaceVoteLocation, triggerVoteAttention],
  );

  const handleSourceOpen = useCallback(
    (item: ContentItem) => {
      replaceVoteLocation({ contentId: item.id });
      markPrimaryInteraction(item.id);
      recordRecommendationSignal(item, "external_open");
    },
    [markPrimaryInteraction, recordRecommendationSignal, replaceVoteLocation],
  );

  useEffect(() => {
    return () => {
      if (voteAttentionTimeoutRef.current !== null && typeof window !== "undefined") {
        window.clearTimeout(voteAttentionTimeoutRef.current);
      }
    };
  }, []);

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

        setIsMobileHeaderVisible(true);
        clearActiveContentPin();
        setView("watched");
        return;
      }

      if (nextView !== "followed_curators") {
        setIsMobileHeaderVisible(true);
        clearActiveContentPin();
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

      setIsMobileHeaderVisible(true);
      clearActiveContentPin();
      setView("followed_curators");
    },
    [
      clearActiveContentPin,
      openConnectModal,
      requestFollowReadAccess,
      requestWatchReadAccess,
      setIsMobileHeaderVisible,
    ],
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
  const renderVoteTopControls = useCallback(
    (variant: "mobile" | "desktop") => {
      const isMobileVariant = variant === "mobile";
      const searchSortId = isMobileVariant ? "vote-search-sort-mobile" : "vote-search-sort-desktop";

      return (
        <div
          className={isMobileVariant ? "flex min-h-0 flex-col gap-3 px-4 pb-3 sm:px-6" : "flex min-h-0 flex-col gap-4"}
        >
          <div
            className={`flex shrink-0 flex-wrap items-center gap-2 sm:gap-3 ${
              isMobileVariant ? "touch-none" : "xl:flex-nowrap xl:px-0 xl:touch-auto"
            }`}
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
            <div className="shrink-0 flex items-center">
              <StreakCounter />
            </div>
          </div>

          {isSearchMode ? (
            <div
              className={`flex shrink-0 flex-wrap items-center gap-2 ${
                isMobileVariant ? "touch-none" : "xl:px-0 xl:touch-auto"
              }`}
              data-disable-queue-wheel="true"
            >
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
                  <label htmlFor={searchSortId} className="sr-only">
                    Sort search results
                  </label>
                  <select
                    id={searchSortId}
                    name="vote-search-sort"
                    value={effectiveSearchSortBy}
                    onChange={e => handleSearchSortChange(e.target.value as SearchSortOption)}
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
        </div>
      );
    },
    [
      activeCategory,
      categories,
      effectiveSearchSortBy,
      handleSearchSortChange,
      handleViewChange,
      isSearchMode,
      isShortSearchQuery,
      selectCategory,
      trimmedSearchQuery,
      view,
      viewGroups,
    ],
  );
  const mobileVoteHeaderControls = useMemo(() => renderVoteTopControls("mobile"), [renderVoteTopControls]);

  useEffect(() => {
    setMobileHeaderVoteControls(mobileVoteHeaderControls);
    return () => setMobileHeaderVoteControls(null);
  }, [mobileVoteHeaderControls, setMobileHeaderVoteControls]);

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
      horizontalPaddingClassName="px-0 xl:px-4"
      paddingTopClassName="pt-0 xl:pt-4"
      outerClassName="min-h-0 flex-1 overflow-hidden pb-0 xl:pb-4"
      contentClassName="flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      <VotingGuide />
      <div className="hidden shrink-0 xl:mb-4 xl:block xl:overflow-visible" data-vote-desktop-top-chrome="true">
        {renderVoteTopControls("desktop")}
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div
          ref={desktopScrollContainerRef}
          data-testid="vote-desktop-scroll-container"
          className="min-h-0 flex h-full flex-col overflow-hidden xl:relative xl:left-1/2 xl:w-screen xl:-translate-x-1/2 xl:overflow-x-hidden xl:overflow-y-scroll xl:overscroll-contain xl:scrollbar-subtle xl:snap-y xl:snap-mandatory xl:scroll-pb-4 xl:scroll-smooth"
        >
          <div
            data-testid="vote-desktop-scroll-frame"
            className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden xl:mx-auto xl:min-h-full xl:w-full xl:max-w-5xl xl:flex-none xl:overflow-visible xl:px-4 xl:pb-4"
          >
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden xl:grid xl:min-h-full xl:w-full xl:flex-none xl:grid-cols-[minmax(0,1fr)_17.25rem] xl:items-start xl:gap-4 xl:overflow-visible">
              <div className="min-h-0 flex min-w-0 flex-1 flex-col overflow-hidden xl:min-h-full xl:flex-none xl:overflow-visible">
                <div className="flex min-w-0 min-h-0 flex-1 flex-col gap-3 xl:min-h-full xl:flex-none xl:gap-0">
                  <div
                    data-testid="vote-feed-surface"
                    className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-[2rem] rounded-b-none bg-[#000] px-3 pt-1.5 pb-3 sm:px-4 sm:pt-2 sm:pb-4 xl:min-h-full xl:flex-none xl:overflow-visible xl:rounded-none xl:p-0"
                  >
                    <div className="min-w-0 flex-1 min-h-0 xl:flex-none">
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
                          displayFeed={displayFeed}
                          sessionKey={feedSessionKey}
                          activeSourceIndex={activeSourceIndex}
                          loadedCount={visibleCount}
                          mobileDockReservedSpace={mobileDockReservedSpace}
                          mobileTopChromeHeight={mobileHeaderHeight}
                          mobileTopChromeVisible={isMobileHeaderVisible}
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
                          onLoadMore={handleLoadMore}
                          onTrackActiveIndex={handleTrackVisibleIndex}
                          onSelectByIndex={handleSelectByIndex}
                          onContentIntent={handleContentIntent}
                          onSourceOpen={handleSourceOpen}
                          onToggleWatch={handleToggleWatch}
                          onToggleFollow={handleToggleFollow}
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <div aria-hidden="true" className="hidden xl:block" />
            </div>
          </div>
        </div>

        <div className="pointer-events-none absolute inset-y-0 left-0 right-0 hidden xl:block">
          <div className="mx-auto flex h-full w-full max-w-5xl gap-4 px-4">
            <div className="min-w-0 flex-1" />
            <div className="pointer-events-auto w-[17.25rem] shrink-0">
              <VoteSignalRail
                primaryItem={primaryItem}
                activeIndex={activeSourceIndex}
                totalCount={displayFeed.length}
                isCommitting={isCommitting}
                voteError={voteError}
                cooldownSecondsRemaining={primaryItemCooldownSeconds}
                attentionToken={primaryAttentionToken}
                onVote={handleButtonVote}
              />
            </div>
          </div>
        </div>
      </div>

      {primaryItem ? (
        <div
          ref={mobileDockContainerRef}
          data-testid="vote-mobile-dock"
          className="fixed inset-x-0 bottom-0 z-30 xl:hidden"
        >
          <div className="w-full">
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
                attentionToken={primaryAttentionToken}
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
