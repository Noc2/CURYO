"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSignMessage } from "wagmi";

export interface WatchedContentItem {
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

interface UseWatchedContentOptions {
  autoRead?: boolean;
}

function isSignatureRejected(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return message.includes("rejected") || message.includes("denied") || message.includes("declined");
}

const EMPTY_WATCHED_ITEMS: WatchedContentItem[] = [];
const EMPTY_WATCHED_RESPONSE: WatchedContentResponse = { items: [], count: 0 };

function getWatchlistCacheKey(address: string) {
  return `curyo:watchlist:${address.toLowerCase()}`;
}

function readWatchlistCache(address: string): WatchedContentResponse | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(getWatchlistCacheKey(address));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<WatchedContentResponse>;
    if (!Array.isArray(parsed.items) || typeof parsed.count !== "number") {
      return null;
    }

    const items = parsed.items.filter(
      (item): item is WatchedContentItem => typeof item?.contentId === "string" && typeof item?.createdAt === "string",
    );

    return {
      items,
      count: items.length,
    };
  } catch {
    return null;
  }
}

function writeWatchlistCache(address: string, value: WatchedContentResponse) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(getWatchlistCacheKey(address), JSON.stringify(value));
  } catch {
    // Ignore storage failures.
  }
}

async function readWatchedContent(
  address: string,
  signMessageAsync: (args: { message: string }) => Promise<`0x${string}`>,
): Promise<WatchedContentResponse> {
  const existingSessionRes = await fetch(`/api/watchlist/content?address=${encodeURIComponent(address)}`);
  if (existingSessionRes.ok) {
    const body = (await existingSessionRes.json()) as Partial<WatchedContentResponse>;
    return {
      items: Array.isArray(body.items) ? (body.items as WatchedContentItem[]) : [],
      count: Array.isArray(body.items) ? body.items.length : 0,
    };
  }

  if (existingSessionRes.status !== 401) {
    const body = (await existingSessionRes.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || "Failed to fetch watched content");
  }

  const challengeRes = await fetch("/api/watchlist/content/challenge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      address,
      intent: "read",
    }),
  });

  const challengeData = (await challengeRes.json().catch(() => null)) as {
    error?: string;
    message?: string;
    challengeId?: string;
  } | null;

  if (!challengeRes.ok || !challengeData?.message || !challengeData.challengeId) {
    throw new Error(challengeData?.error || "Failed to create signature challenge");
  }

  const signature = await signMessageAsync({ message: challengeData.message });
  const res = await fetch("/api/watchlist/content", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      address,
      signature,
      challengeId: challengeData.challengeId,
    }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || "Failed to fetch watched content");
  }

  const body = (await res.json()) as Partial<WatchedContentResponse>;
  return {
    items: Array.isArray(body.items) ? (body.items as WatchedContentItem[]) : [],
    count: Array.isArray(body.items) ? body.items.length : 0,
  };
}

export function useWatchedContent(address?: string, options?: UseWatchedContentOptions) {
  const { signMessageAsync } = useSignMessage();
  const queryClient = useQueryClient();
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const autoRead = options?.autoRead ?? false;

  const queryKey = useMemo(() => ["watchedContent", address] as const, [address]);

  const { data, isLoading, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!address) {
        return EMPTY_WATCHED_RESPONSE;
      }

      const cached = readWatchlistCache(address);
      if (cached) {
        return cached;
      }

      if (!autoRead) {
        return EMPTY_WATCHED_RESPONSE;
      }

      try {
        const response = await readWatchedContent(address, signMessageAsync);
        writeWatchlistCache(address, response);
        return response;
      } catch (error) {
        if (isSignatureRejected(error)) {
          return EMPTY_WATCHED_RESPONSE;
        }
        throw error;
      }
    },
    enabled: Boolean(address),
    staleTime: Infinity,
    refetchInterval: false,
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
        let next: WatchedContentResponse;

        if (watched) {
          if (items.some(item => item.contentId === contentId)) {
            next = old ?? { items, count: items.length };
          } else {
            const nextItems = [{ contentId, createdAt: new Date().toISOString() }, ...items];
            next = { items: nextItems, count: nextItems.length };
          }
        } else {
          const nextItems = items.filter(item => item.contentId !== contentId);
          next = { items: nextItems, count: nextItems.length };
        }

        if (address) {
          writeWatchlistCache(address, next);
        }

        return next;
      });
    },
    [address, queryClient, queryKey],
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
        const challengeRes = await fetch("/api/watchlist/content/challenge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            address,
            contentId: contentIdStr,
            action: isWatched ? "unwatch" : "watch",
          }),
        });

        const challengeData = await challengeRes.json();
        if (!challengeRes.ok) {
          throw new Error(challengeData.error || "Failed to create signature challenge");
        }

        const signature = await signMessageAsync({ message: challengeData.message as string });

        setOptimisticState(contentIdStr, !isWatched);

        const res = await fetch("/api/watchlist/content", {
          method: isWatched ? "DELETE" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            address,
            contentId: contentIdStr,
            signature,
            challengeId: challengeData.challengeId,
          }),
        });

        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error || "Request failed");
        }

        return { ok: true, watched: !isWatched };
      } catch (error) {
        queryClient.setQueryData(queryKey, previous);
        if (address && previous) {
          writeWatchlistCache(address, previous);
        }
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
