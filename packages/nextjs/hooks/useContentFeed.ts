"use client";

import { useMemo } from "react";
import { parseTags } from "~~/constants/categories";
import { useScaffoldEventHistory, useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { usePonderQuery } from "~~/hooks/usePonderQuery";
import { ponderApi } from "~~/services/ponder/client";
import { publicEnv } from "~~/utils/env/public";

export interface ContentItem {
  id: bigint;
  url: string;
  goal: string;
  tags: string[];
  submitter: string;
  contentHash: string;
  isOwnContent: boolean;
  categoryId: bigint;
}

type FeedSort = "newest" | "oldest" | "highest_rated" | "lowest_rated" | "most_votes";

interface UseContentFeedOptions {
  limit?: number;
  sortBy?: FeedSort;
}

function mapContentItem(
  item: {
    id: string;
    url: string;
    goal: string;
    tags: string;
    submitter: string;
    contentHash: string;
    categoryId: string;
  },
  voterAddress?: string,
): ContentItem {
  return {
    id: BigInt(item.id),
    url: item.url,
    goal: item.goal,
    tags: parseTags(item.tags),
    submitter: item.submitter,
    contentHash: item.contentHash,
    isOwnContent: !!voterAddress && item.submitter.toLowerCase() === voterAddress.toLowerCase(),
    categoryId: BigInt(item.categoryId),
  };
}

function sortRpcFeed(feed: ContentItem[], sortBy: FeedSort): ContentItem[] {
  const items = [...feed];

  switch (sortBy) {
    case "oldest":
      items.sort((a, b) => Number(a.id - b.id));
      break;
    case "newest":
    case "highest_rated":
    case "lowest_rated":
    case "most_votes":
    default:
      items.sort((a, b) => Number(b.id - a.id));
      break;
  }

  return items;
}

/**
 * Fetch the content feed.
 * Uses Ponder API when available, falls back to on-chain event scanning.
 */
export function useContentFeed(voterAddress?: string, options: UseContentFeedOptions = {}) {
  const rpcFallbackEnabled = publicEnv.rpcFallbackEnabled;
  const limit = options.limit && options.limit > 0 ? Math.floor(options.limit) : undefined;
  const sortBy = options.sortBy ?? "newest";

  // --- RPC fallback: get content submitted events ---
  const { data: events, isLoading: eventsLoading } = useScaffoldEventHistory({
    contractName: "ContentRegistry",
    eventName: "ContentSubmitted",
    watch: rpcFallbackEnabled,
    enabled: rpcFallbackEnabled,
  });

  const { data: nextContentId } = useScaffoldReadContract({
    contractName: "ContentRegistry",
    functionName: "nextContentId",
  });

  // Transform RPC events to ContentItem[]
  const rpcFeed = useMemo(() => {
    if (!events || events.length === 0) return [];

    return events
      .map(event => {
        const args = event.args as {
          contentId?: bigint;
          submitter?: string;
          contentHash?: string;
          url?: string;
          goal?: string;
          tags?: string;
          categoryId?: bigint;
        };

        if (!args.contentId || !args.url || !args.goal) return null;

        const submitter = args.submitter || "";
        return {
          id: args.contentId,
          url: args.url,
          goal: args.goal,
          tags: parseTags(args.tags || ""),
          submitter,
          contentHash: args.contentHash || "",
          isOwnContent: !!voterAddress && submitter.toLowerCase() === voterAddress.toLowerCase(),
          categoryId: args.categoryId ?? 0n,
        } satisfies ContentItem;
      })
      .filter((item): item is ContentItem => item !== null);
  }, [events, voterAddress]);

  const sortedRpcFeed = useMemo(() => sortRpcFeed(rpcFeed, sortBy), [rpcFeed, sortBy]);
  const limitedRpcFeed = useMemo(() => {
    if (limit === undefined) return sortedRpcFeed;
    return sortedRpcFeed.slice(0, limit);
  }, [sortedRpcFeed, limit]);
  const rpcTotalContent = nextContentId ? Number(nextContentId) - 1 : sortedRpcFeed.length;

  // --- Ponder-first with RPC fallback ---
  const { data: result, isLoading: ponderLoading } = usePonderQuery({
    queryKey: ["contentFeed", voterAddress, sortBy, limit ?? "all"],
    ponderFn: async () => {
      if (limit !== undefined) {
        const response = await ponderApi.getContent({
          status: "all",
          sortBy,
          limit: String(limit),
          offset: "0",
        });
        return {
          feed: response.items.map(item => mapContentItem(item, voterAddress)),
          totalContent: response.total,
        };
      }

      const items = await ponderApi.getAllContent({ status: "all", sortBy });
      return {
        feed: items.map(item => mapContentItem(item, voterAddress)),
        totalContent: items.length,
      };
    },
    rpcFn: async () => ({
      feed: limitedRpcFeed,
      totalContent: rpcTotalContent,
    }),
    rpcEnabled: rpcFallbackEnabled,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const feed = result?.data?.feed ?? limitedRpcFeed;
  const totalContent = result?.data?.totalContent ?? rpcTotalContent;

  return {
    feed,
    isLoading: ponderLoading && eventsLoading,
    totalContent,
    hasMore: totalContent > feed.length,
  };
}
