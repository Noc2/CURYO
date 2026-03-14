"use client";

import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";

export interface Profile {
  name: string;
  imageUrl: string;
  strategy: string;
  createdAt: bigint;
  updatedAt: bigint;
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
          imageUrl: typeof d.imageUrl === "string" ? d.imageUrl : "",
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

  const setProfile = async (name: string, imageUrl: string, strategy: string) => {
    await (writeContractAsync as any)({
      functionName: "setProfile",
      args: [name, imageUrl, strategy],
    });
  };

  return {
    setProfile,
    isPending,
  };
}
