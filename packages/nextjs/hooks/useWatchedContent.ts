"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSignMessage } from "wagmi";
import { buildUnwatchContentMessage, buildWatchContentMessage } from "~~/lib/watchlist/messages";

interface WatchedContentItem {
  contentId: string;
  createdAt: string;
}

interface WatchedContentResponse {
  items: WatchedContentItem[];
  count: number;
}

interface ToggleWatchResult {
  ok: boolean;
  watched?: boolean;
  reason?: "not_connected" | "rejected" | "request_failed";
  error?: string;
}

function isSignatureRejected(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return message.includes("rejected") || message.includes("denied") || message.includes("declined");
}

const EMPTY_WATCHED_ITEMS: WatchedContentItem[] = [];

export function useWatchedContent(address?: string) {
  const { signMessageAsync } = useSignMessage();
  const queryClient = useQueryClient();
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  const queryKey = useMemo(() => ["watchedContent", address] as const, [address]);

  const { data, isLoading, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!address) {
        return { items: [], count: 0 } satisfies WatchedContentResponse;
      }

      const res = await fetch(`/api/watchlist/content?address=${encodeURIComponent(address)}`);
      if (!res.ok) {
        throw new Error("Failed to fetch watched content");
      }

      return (await res.json()) as WatchedContentResponse;
    },
    enabled: Boolean(address),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const watchedItems = data?.items ?? EMPTY_WATCHED_ITEMS;
  const watchedContentIds = useMemo(() => new Set(watchedItems.map(item => item.contentId)), [watchedItems]);

  const updatePending = useCallback((contentId: string, isPending: boolean) => {
    setPendingIds(prev => {
      const next = new Set(prev);
      if (isPending) {
        next.add(contentId);
      } else {
        next.delete(contentId);
      }
      return next;
    });
  }, []);

  const setOptimisticState = useCallback(
    (contentId: string, watched: boolean) => {
      queryClient.setQueryData(queryKey, (old: WatchedContentResponse | undefined) => {
        const items = old?.items ?? [];

        if (watched) {
          if (items.some(item => item.contentId === contentId)) {
            return old ?? { items, count: items.length };
          }

          const nextItems = [{ contentId, createdAt: new Date().toISOString() }, ...items];
          return { items: nextItems, count: nextItems.length };
        }

        const nextItems = items.filter(item => item.contentId !== contentId);
        return { items: nextItems, count: nextItems.length };
      });
    },
    [queryClient, queryKey],
  );

  const toggleWatch = useCallback(
    async (contentId: bigint): Promise<ToggleWatchResult> => {
      if (!address) {
        return { ok: false, reason: "not_connected" };
      }

      const contentIdStr = contentId.toString();
      const isWatched = watchedContentIds.has(contentIdStr);
      const previous = queryClient.getQueryData<WatchedContentResponse>(queryKey);

      updatePending(contentIdStr, true);

      try {
        const message = isWatched ? buildUnwatchContentMessage(contentIdStr) : buildWatchContentMessage(contentIdStr);
        const signature = await signMessageAsync({ message });

        setOptimisticState(contentIdStr, !isWatched);

        const res = await fetch("/api/watchlist/content", {
          method: isWatched ? "DELETE" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address, contentId: contentIdStr, signature }),
        });

        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error || "Request failed");
        }

        return { ok: true, watched: !isWatched };
      } catch (error) {
        queryClient.setQueryData(queryKey, previous);
        await refetch();

        if (isSignatureRejected(error)) {
          return { ok: false, reason: "rejected" };
        }

        return {
          ok: false,
          reason: "request_failed",
          error: error instanceof Error ? error.message : "Failed to update watchlist",
        };
      } finally {
        updatePending(contentIdStr, false);
      }
    },
    [address, watchedContentIds, queryClient, queryKey, refetch, setOptimisticState, signMessageAsync, updatePending],
  );

  const isPending = useCallback((contentId: bigint) => pendingIds.has(contentId.toString()), [pendingIds]);

  return {
    watchedItems,
    watchedContentIds,
    isLoading,
    toggleWatch,
    isPending,
  };
}
