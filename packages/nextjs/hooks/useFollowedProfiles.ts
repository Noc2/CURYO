"use client";

import { useSignMessage } from "wagmi";
import {
  type SignedCollectionResponse,
  type SignedCollectionToggleResult,
  useSignedCollection,
} from "~~/hooks/useSignedCollection";

export interface FollowedProfileItem {
  walletAddress: string;
  createdAt: string;
}

type FollowedProfilesResponse = SignedCollectionResponse<FollowedProfileItem>;

interface ToggleFollowResult extends SignedCollectionToggleResult<"self_follow"> {
  following?: boolean;
}

interface UseFollowedProfilesOptions {
  autoRead?: boolean;
}

const EMPTY_FOLLOWED_RESPONSE: FollowedProfilesResponse = { items: [], count: 0 };

export function useFollowedProfiles(address?: string, options?: UseFollowedProfilesOptions) {
  const { signMessageAsync } = useSignMessage();
  const autoRead = options?.autoRead ?? false;
  const normalizedAddress = address?.toLowerCase();
  const { items, itemKeys, isLoading, toggleItem, isPending } = useSignedCollection<
    FollowedProfileItem,
    string,
    "self_follow"
  >({
    address: normalizedAddress,
    autoRead,
    queryKey: ["followedProfiles", normalizedAddress],
    emptyResponse: EMPTY_FOLLOWED_RESPONSE,
    sessionPath: "/api/follows/profiles/session",
    collectionPath: "/api/follows/profiles",
    challengePath: "/api/follows/profiles/challenge",
    signMessageAsync,
    getItemKey: item => item.walletAddress.toLowerCase(),
    normalizeId: targetAddress => targetAddress.toLowerCase(),
    createOptimisticItem: walletAddress => ({ walletAddress, createdAt: new Date().toISOString() }),
    buildReadChallengeRequest: walletAddress => ({ address: walletAddress, intent: "read" }),
    buildSignedReadRequest: (walletAddress, challengeId, signature) => ({
      address: walletAddress,
      signature,
      challengeId,
    }),
    buildWriteChallengeRequest: (walletAddress, targetAddress, currentlySelected) => ({
      address: walletAddress,
      targetAddress,
      action: currentlySelected ? "unfollow" : "follow",
    }),
    buildSignedWriteRequest: (walletAddress, targetAddress, _currentlySelected, challengeId, signature) => ({
      address: walletAddress,
      targetAddress,
      signature,
      challengeId,
    }),
    buildSessionWriteRequest: (walletAddress, targetAddress) => ({
      address: walletAddress,
      targetAddress,
    }),
    validateToggle: (targetAddress, walletAddress) => (targetAddress === walletAddress ? "self_follow" : null),
  });

  return {
    followedItems: items,
    followedWallets: itemKeys,
    isLoading,
    toggleFollow: async (targetAddress: string): Promise<ToggleFollowResult> => {
      const result = await toggleItem(targetAddress);
      return {
        ok: result.ok,
        following: result.selected,
        reason: result.reason,
        error: result.error,
      };
    },
    isPending,
  };
}
