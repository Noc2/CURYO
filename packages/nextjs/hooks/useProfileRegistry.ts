"use client";

import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { avatarAccentRgbToHex } from "~~/lib/avatar/avatarAccent";

export interface Profile {
  name: string;
  strategy: string;
  createdAt: bigint;
  updatedAt: bigint;
}

export interface AvatarAccent {
  enabled: boolean;
  rgb: bigint | null;
  hex: string | null;
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
  const { writeContractAsync, isPending } = useScaffoldWriteContract({
    contractName: "ProfileRegistry" as any,
  });

  const setProfile = async (name: string, strategy: string) => {
    await (writeContractAsync as any)({
      functionName: "setProfile",
      args: [name, strategy],
    });
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
  const { writeContractAsync, isPending } = useScaffoldWriteContract({
    contractName: "ProfileRegistry" as any,
  });

  const setAvatarAccent = async (rgb: number) => {
    await (writeContractAsync as any)({
      functionName: "setAvatarAccent",
      args: [BigInt(rgb)],
    });
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
  const { writeContractAsync, isPending } = useScaffoldWriteContract({
    contractName: "ProfileRegistry" as any,
  });

  const clearAvatarAccent = async () => {
    await (writeContractAsync as any)({
      functionName: "clearAvatarAccent",
      args: [],
    });
  };

  return {
    clearAvatarAccent,
    isPending,
  };
}
