"use client";

import { useSignMessage } from "wagmi";
import {
  type SignedCollectionResponse,
  type SignedCollectionToggleResult,
  useSignedCollection,
} from "~~/hooks/useSignedCollection";

export interface WatchedContentItem {
  contentId: string;
  createdAt: string;
}

type WatchedContentResponse = SignedCollectionResponse<WatchedContentItem>;

interface ToggleWatchResult extends SignedCollectionToggleResult {
  watched?: boolean;
}

interface UseWatchedContentOptions {
  autoRead?: boolean;
}

const EMPTY_WATCHED_RESPONSE: WatchedContentResponse = { items: [], count: 0 };

export function useWatchedContent(address?: string, options?: UseWatchedContentOptions) {
  const { signMessageAsync } = useSignMessage();
  const autoRead = options?.autoRead ?? false;
  const { items, itemKeys, isLoading, toggleItem, isPending } = useSignedCollection<WatchedContentItem, bigint>({
    address,
    autoRead,
    queryKey: ["watchedContent", address],
    emptyResponse: EMPTY_WATCHED_RESPONSE,
    sessionPath: "/api/watchlist/content/session",
    collectionPath: "/api/watchlist/content",
    challengePath: "/api/watchlist/content/challenge",
    signMessageAsync,
    getItemKey: item => item.contentId,
    normalizeId: contentId => contentId.toString(),
    createOptimisticItem: contentId => ({ contentId, createdAt: new Date().toISOString() }),
    buildReadChallengeRequest: walletAddress => ({ address: walletAddress, intent: "read" }),
    buildSignedReadRequest: (walletAddress, challengeId, signature) => ({
      address: walletAddress,
      signature,
      challengeId,
    }),
    buildWriteChallengeRequest: (walletAddress, contentId, currentlySelected) => ({
      address: walletAddress,
      contentId,
      action: currentlySelected ? "unwatch" : "watch",
    }),
    buildSignedWriteRequest: (walletAddress, contentId, _currentlySelected, challengeId, signature) => ({
      address: walletAddress,
      contentId,
      signature,
      challengeId,
    }),
    buildSessionWriteRequest: (walletAddress, contentId) => ({
      address: walletAddress,
      contentId,
    }),
  });

  return {
    watchedItems: items,
    watchedContentIds: itemKeys,
    isLoading,
    toggleWatch: async (contentId: bigint): Promise<ToggleWatchResult> => {
      const result = await toggleItem(contentId);
      return {
        ok: result.ok,
        watched: result.selected,
        reason: result.reason,
        error: result.error,
      };
    },
    isPending,
  };
}
