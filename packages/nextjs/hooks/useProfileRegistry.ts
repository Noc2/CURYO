"use client";

import { useCallback, useState } from "react";
import type { Abi } from "viem";
import { useDeployedContractInfo, useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { useThirdwebSponsoredSubmitCalls } from "~~/hooks/useThirdwebSponsoredSubmitCalls";
import { avatarAccentRgbToHex } from "~~/lib/avatar/avatarAccent";

interface Profile {
  name: string;
  strategy: string;
  createdAt: bigint;
  updatedAt: bigint;
}

interface AvatarAccent {
  enabled: boolean;
  rgb: bigint | null;
  hex: string | null;
}

function useProfileRegistryWrite() {
  const { data: profileRegistryContract } = useDeployedContractInfo({
    contractName: "ProfileRegistry" as any,
  });
  const { writeContractAsync, isPending } = useScaffoldWriteContract({
    contractName: "ProfileRegistry" as any,
  });
  const { canUseSponsoredSubmitCalls, executeSponsoredCalls } = useThirdwebSponsoredSubmitCalls();
  const [isSponsoredWritePending, setIsSponsoredWritePending] = useState(false);

  const writeProfileRegistry = useCallback(
    async (functionName: string, args: readonly unknown[], action: string) => {
      if (canUseSponsoredSubmitCalls && profileRegistryContract) {
        setIsSponsoredWritePending(true);
        try {
          await executeSponsoredCalls(
            [
              {
                abi: profileRegistryContract.abi as Abi,
                address: profileRegistryContract.address as `0x${string}`,
                args,
                functionName,
              },
            ],
            { action },
          );
          return;
        } finally {
          setIsSponsoredWritePending(false);
        }
      }

      await (writeContractAsync as any)({
        args,
        functionName,
      });
    },
    [canUseSponsoredSubmitCalls, executeSponsoredCalls, profileRegistryContract, writeContractAsync],
  );

  return {
    isPending: isPending || isSponsoredWritePending,
    writeProfileRegistry,
  };
}

/**
 * Hook to fetch a user's profile from the ProfileRegistry contract.
 */
export function useProfileRegistry(address?: string) {
  const {
    data: profileData,
    isLoading,
    refetch,
  } = useScaffoldReadContract({
    contractName: "ProfileRegistry" as any,
    functionName: "getProfile",
    args: [address],
    query: {
      enabled: !!address,
    },
  } as any);

  const profile: Profile | null = profileData
    ? (() => {
        const d = profileData as unknown as Record<string, unknown>;
        return {
          name: typeof d.name === "string" ? d.name : "",
          strategy: typeof d.strategy === "string" ? d.strategy : "",
          createdAt: typeof d.createdAt === "bigint" ? d.createdAt : 0n,
          updatedAt: typeof d.updatedAt === "bigint" ? d.updatedAt : 0n,
        };
      })()
    : null;

  const hasProfile = profile && profile.createdAt > 0n;

  return {
    profile,
    hasProfile,
    isLoading,
    refetch,
  };
}

/**
 * Hook to check if a profile name is taken.
 */
export function useIsNameTaken(name: string) {
  const { data: isTaken, isLoading } = useScaffoldReadContract({
    contractName: "ProfileRegistry" as any,
    functionName: "isNameTaken",
    args: [name],
    query: {
      enabled: name.length >= 3,
    },
  } as any);

  return {
    isTaken: isTaken ?? false,
    isLoading,
  };
}

/**
 * Hook to set or update a profile.
 */
export function useSetProfile() {
  const { isPending, writeProfileRegistry } = useProfileRegistryWrite();

  const setProfile = async (name: string, strategy: string) => {
    await writeProfileRegistry("setProfile", [name, strategy], "profile update");
  };

  return {
    setProfile,
    isPending,
  };
}

/**
 * Hook to fetch a user's avatar accent override from the ProfileRegistry contract.
 */
export function useAvatarAccent(address?: string) {
  const {
    data: avatarAccentData,
    isLoading,
    refetch,
  } = useScaffoldReadContract({
    contractName: "ProfileRegistry" as any,
    functionName: "getAvatarAccent",
    args: [address],
    query: {
      enabled: !!address,
    },
  } as any);

  const avatarAccent: AvatarAccent | null = avatarAccentData
    ? (() => {
        const tuple = avatarAccentData as unknown as Record<string, unknown> & unknown[];
        const enabled = tuple.enabled === true || tuple[0] === true;
        const rgb = typeof tuple.rgb === "bigint" ? tuple.rgb : typeof tuple[1] === "bigint" ? tuple[1] : null;
        return {
          enabled,
          rgb: enabled ? rgb : null,
          hex: enabled && rgb !== null ? avatarAccentRgbToHex(rgb) : null,
        };
      })()
    : null;

  return {
    avatarAccent,
    isLoading,
    refetch,
  };
}

/**
 * Hook to store an avatar accent override.
 */
export function useSetAvatarAccent() {
  const { isPending, writeProfileRegistry } = useProfileRegistryWrite();

  const setAvatarAccent = async (rgb: number) => {
    await writeProfileRegistry("setAvatarAccent", [BigInt(rgb)], "avatar color update");
  };

  return {
    setAvatarAccent,
    isPending,
  };
}

/**
 * Hook to clear an avatar accent override.
 */
export function useClearAvatarAccent() {
  const { isPending, writeProfileRegistry } = useProfileRegistryWrite();

  const clearAvatarAccent = async () => {
    await writeProfileRegistry("clearAvatarAccent", [], "avatar color reset");
  };

  return {
    clearAvatarAccent,
    isPending,
  };
}
