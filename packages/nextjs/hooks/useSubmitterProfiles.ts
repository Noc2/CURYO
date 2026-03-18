"use client";

import { useMemo } from "react";
import { useReadContracts } from "wagmi";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";
import { usePonderQuery } from "~~/hooks/usePonderQuery";
import { ponderApi } from "~~/services/ponder/client";

export interface SubmitterProfile {
  username: string | null;
  winRate?: number;
  totalSettledVotes?: number;
}

/**
 * Hook to batch-fetch submitter profiles.
 * Uses Ponder API when available, falls back to on-chain multicall.
 */
export function useSubmitterProfiles(addresses: string[]) {
  // Dedupe and normalize addresses
  const uniqueAddresses = useMemo(() => {
    const seen = new Set<string>();
    return addresses
      .filter(a => a)
      .map(a => a.toLowerCase())
      .filter(a => {
        if (seen.has(a)) return false;
        seen.add(a);
        return true;
      });
  }, [addresses]);

  // --- RPC fallback: multicall getProfile ---
  const { data: registryInfo } = useDeployedContractInfo({ contractName: "ProfileRegistry" as any });

  const profileCalls = useMemo(() => {
    if (!registryInfo || uniqueAddresses.length === 0) return [];
    return uniqueAddresses.map(addr => ({
      address: registryInfo.address,
      abi: registryInfo.abi,
      functionName: "getProfile" as const,
      args: [addr as `0x${string}`],
    }));
  }, [registryInfo, uniqueAddresses]);

  const { data: profilesData, isLoading: rpcLoading } = useReadContracts({
    contracts: profileCalls,
    query: {
      enabled: profileCalls.length > 0,
    },
  });

  const rpcProfiles = useMemo((): Record<string, SubmitterProfile> => {
    if (!profilesData || uniqueAddresses.length === 0) return {};

    const result: Record<string, SubmitterProfile> = {};

    profilesData.forEach((response, index) => {
      const addr = uniqueAddresses[index];
      if (response.status === "success" && response.result) {
        const profile = response.result as {
          name: string;
          createdAt: bigint;
          updatedAt: bigint;
        };
        if (profile.createdAt > 0n) {
          result[addr] = {
            username: profile.name || null,
          };
        } else {
          result[addr] = { username: null };
        }
      } else {
        result[addr] = { username: null };
      }
    });

    return result;
  }, [profilesData, uniqueAddresses]);

  // --- Ponder-first with RPC fallback ---
  const addressesKey = uniqueAddresses.join(",");
  const { data: result, isLoading: ponderLoading } = usePonderQuery({
    queryKey: ["submitterProfiles", addressesKey],
    ponderFn: async () => {
      if (uniqueAddresses.length === 0) return {};
      const profileMap = await ponderApi.getProfiles(uniqueAddresses);
      const mapped: Record<string, SubmitterProfile> = {};
      for (const addr of uniqueAddresses) {
        const p = profileMap[addr];
        if (p) {
          mapped[addr] = {
            username: p.name || null,
          };
        } else {
          mapped[addr] = { username: null };
        }
      }
      return mapped;
    },
    rpcFn: async () => rpcProfiles,
    enabled: uniqueAddresses.length > 0,
    staleTime: 30_000,
  });

  return {
    profiles: result?.data ?? rpcProfiles,
    isLoading: ponderLoading && rpcLoading,
  };
}
