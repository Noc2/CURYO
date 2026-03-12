"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

interface WatchlistSessionStatus {
  hasReadSession: boolean;
  hasWriteSession: boolean;
}

function isSignatureRejected(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return message.includes("rejected") || message.includes("denied") || message.includes("declined");
}

const EMPTY_WATCHED_ITEMS: WatchedContentItem[] = [];
const EMPTY_WATCHED_RESPONSE: WatchedContentResponse = { items: [], count: 0 };

async function getWatchlistSessionStatus(address: string): Promise<WatchlistSessionStatus> {
  const sessionRes = await fetch(`/api/watchlist/content/session?address=${encodeURIComponent(address)}`);
  const sessionBody = (await sessionRes.json().catch(() => null)) as {
    hasSession?: boolean;
    hasReadSession?: boolean;
    hasWriteSession?: boolean;
    error?: string;
  } | null;
  if (!sessionRes.ok) {
    throw new Error(sessionBody?.error || "Failed to check watchlist session");
  }

  return {
    hasReadSession: sessionBody?.hasReadSession ?? sessionBody?.hasSession ?? false,
    hasWriteSession: sessionBody?.hasWriteSession ?? false,
  };
}

async function readWatchedContent(
  address: string,
  signMessageAsync: (args: { message: string }) => Promise<`0x${string}`>,
  autoRead: boolean,
): Promise<WatchedContentResponse> {
  const sessionStatus = await getWatchlistSessionStatus(address);

  if (sessionStatus.hasReadSession) {
    const existingSessionRes = await fetch(`/api/watchlist/content?address=${encodeURIComponent(address)}`);
    if (!existingSessionRes.ok) {
      const body = (await existingSessionRes.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error || "Failed to fetch watched content");
    }

    const body = (await existingSessionRes.json()) as Partial<WatchedContentResponse>;
    return {
      items: Array.isArray(body.items) ? (body.items as WatchedContentItem[]) : [],
      count: Array.isArray(body.items) ? body.items.length : 0,
    };
  }

  if (!autoRead) {
    return EMPTY_WATCHED_RESPONSE;
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
  const [hasWriteSession, setHasWriteSession] = useState(false);
  const autoRead = options?.autoRead ?? false;

  useEffect(() => {
    setHasWriteSession(false);
  }, [address]);

  const queryKey = useMemo(() => ["watchedContent", address] as const, [address]);

  const { data, isLoading, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!address) {
        return EMPTY_WATCHED_RESPONSE;
      }

      try {
        return await readWatchedContent(address, signMessageAsync, autoRead);
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
        const performSignedToggle = async () => {
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

          return fetch("/api/watchlist/content", {
            method: isWatched ? "DELETE" : "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              address,
              contentId: contentIdStr,
              signature,
              challengeId: challengeData.challengeId,
            }),
          });
        };

        setOptimisticState(contentIdStr, !isWatched);
        const canUseWriteSession = hasWriteSession || (await getWatchlistSessionStatus(address)).hasWriteSession;
        if (canUseWriteSession && !hasWriteSession) {
          setHasWriteSession(true);
        }

        let res = canUseWriteSession
          ? await fetch("/api/watchlist/content", {
              method: isWatched ? "DELETE" : "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                address,
                contentId: contentIdStr,
              }),
            })
          : await performSignedToggle();

        if (canUseWriteSession && res.status === 401) {
          setHasWriteSession(false);
          res = await performSignedToggle();
        }

        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error || "Request failed");
        }

        setHasWriteSession(true);
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
    [
      address,
      hasWriteSession,
      watchedContentIds,
      queryClient,
      queryKey,
      refetch,
      setOptimisticState,
      signMessageAsync,
      updatePending,
    ],
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
