"use client";

import { useMemo } from "react";
import { useScaffoldEventHistory } from "~~/hooks/scaffold-eth";
import type { ContentItem } from "~~/hooks/useContentFeed";
import { usePonderQuery } from "~~/hooks/usePonderQuery";
import { ponderApi } from "~~/services/ponder/client";
import { publicEnv } from "~~/utils/env/public";

/**
 * Hook that returns vote popularity per category.
 * Uses Ponder API when available, falls back to scanning VoteCommitted events.
 */
export function useCategoryPopularity(feed: ContentItem[]): Map<string, number> {
  const rpcFallbackEnabled = publicEnv.rpcFallbackEnabled;

  // --- RPC fallback: scan VoteCommitted events ---
  const { data: voteEvents } = useScaffoldEventHistory({
    contractName: "RoundVotingEngine",
    eventName: "VoteCommitted",
    watch: rpcFallbackEnabled,
    enabled: rpcFallbackEnabled,
  } as any);

  const rpcPopularity = useMemo(() => {
    const voteCounts = new Map<string, number>();
    if (!voteEvents || voteEvents.length === 0 || feed.length === 0) return voteCounts;

    const contentToCategory = new Map<string, string>();
    for (const item of feed) {
      contentToCategory.set(item.id.toString(), item.categoryId.toString());
    }

    for (const event of voteEvents) {
      const contentId = (event.args as { contentId?: bigint } | undefined)?.contentId?.toString();
      if (!contentId) continue;
      const categoryId = contentToCategory.get(contentId);
      if (categoryId && categoryId !== "0") {
        voteCounts.set(categoryId, (voteCounts.get(categoryId) ?? 0) + 1);
      }
    }

    return voteCounts;
  }, [voteEvents, feed]);

  // --- Ponder-first with RPC fallback ---
  const { data: result } = usePonderQuery({
    queryKey: ["categoryPopularity"],
    ponderFn: async () => {
      const popularity = await ponderApi.getCategoryPopularity();
      const map = new Map<string, number>();
      for (const [id, count] of Object.entries(popularity)) {
        map.set(id, count);
      }
      return map;
    },
    rpcFn: async () => rpcPopularity,
    rpcEnabled: rpcFallbackEnabled,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  return result?.data ?? rpcPopularity;
}
