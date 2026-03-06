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

/**
 * Fetch the content feed.
 * Uses Ponder API when available, falls back to on-chain event scanning.
 */
export function useContentFeed(voterAddress?: string) {
  const rpcFallbackEnabled = publicEnv.rpcFallbackEnabled;

  // --- RPC fallback: get content submitted events ---
  const { data: events, isLoading: eventsLoading } = useScaffoldEventHistory({
    contractName: "ContentRegistry",
    eventName: "ContentSubmitted",
    fromBlock: 0n,
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

  // --- Ponder-first with RPC fallback ---
  const { data: result, isLoading: ponderLoading } = usePonderQuery({
    queryKey: ["contentFeed", voterAddress],
    ponderFn: async () => {
      const response = await ponderApi.getContent({ status: "all" });
      return {
        feed: response.items.map(item => ({
          id: BigInt(item.id),
          url: item.url,
          goal: item.goal,
          tags: parseTags(item.tags),
          submitter: item.submitter,
          contentHash: item.contentHash,
          isOwnContent: !!voterAddress && item.submitter.toLowerCase() === voterAddress.toLowerCase(),
          categoryId: BigInt(item.categoryId),
        })),
        totalContent: response.total,
      };
    },
    rpcFn: async () => ({
      feed: rpcFeed,
      totalContent: nextContentId ? Number(nextContentId) - 1 : 0,
    }),
    rpcEnabled: rpcFallbackEnabled,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  return {
    feed: result?.data?.feed ?? rpcFeed,
    isLoading: ponderLoading && eventsLoading,
    totalContent: result?.data?.totalContent ?? (nextContentId ? Number(nextContentId) - 1 : 0),
  };
}
