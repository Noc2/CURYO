"use client";

import { useMemo } from "react";
import { useReadContracts } from "wagmi";
import { useDeployedContractInfo, useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { usePageVisibility } from "~~/hooks/usePageVisibility";
import { usePonderQuery } from "~~/hooks/usePonderQuery";
import { ponderApi } from "~~/services/ponder/client";
import { publicEnv } from "~~/utils/env/public";

const SUBMISSION_STAKE_CREP = 10; // 10 cREP (contract constant MIN_SUBMITTER_STAKE)

/**
 * Hook that returns the total active submission stakes for a given address.
 * Uses Ponder API when available (single SQL query), falls back to RPC multicall.
 */
export function useSubmissionStakes(address?: string) {
  const rpcFallbackEnabled = publicEnv.rpcFallbackEnabled;
  const isPageVisible = usePageVisibility();
  // --- RPC fallback: fetch all content via multicall ---
  const { data: registryInfo } = useDeployedContractInfo({ contractName: "ContentRegistry" });
  const { data: nextContentId } = useScaffoldReadContract({
    contractName: "ContentRegistry",
    functionName: "nextContentId",
    query: {
      enabled: rpcFallbackEnabled,
      staleTime: 300_000,
    },
  });

  const contentCount = nextContentId ? Number(nextContentId) - 1 : 0;

  const contracts = useMemo(() => {
    if (!rpcFallbackEnabled || !registryInfo || contentCount === 0) return [];
    return Array.from({ length: contentCount }, (_, i) => ({
      address: registryInfo.address,
      abi: registryInfo.abi,
      functionName: "getContent" as const,
      args: [BigInt(i + 1)],
    }));
  }, [rpcFallbackEnabled, registryInfo, contentCount]);

  const { data: results } = useReadContracts({
    contracts,
    query: { enabled: rpcFallbackEnabled && contracts.length > 0 && !!address },
  });

  const rpcResult = useMemo(() => {
    if (!rpcFallbackEnabled || !results || !address) return { totalSubmissionStake: 0, activeSubmissionCount: 0 };

    let count = 0;
    const addr = address.toLowerCase();

    for (const r of results) {
      if (r?.status !== "success") continue;
      const content = r.result as any;
      if (content.submitter?.toLowerCase() === addr && !content.submitterStakeReturned && content.submitterStake > 0n) {
        count++;
      }
    }

    return { totalSubmissionStake: count * SUBMISSION_STAKE_CREP, activeSubmissionCount: count };
  }, [rpcFallbackEnabled, results, address]);

  // --- Ponder-first with RPC fallback ---
  const { data: result } = usePonderQuery({
    queryKey: ["submissionStakes", address],
    ponderFn: async () => {
      if (!address) return { totalSubmissionStake: 0, activeSubmissionCount: 0 };
      const data = await ponderApi.getSubmissionStakes(address);
      return {
        totalSubmissionStake: data.activeCount * SUBMISSION_STAKE_CREP,
        activeSubmissionCount: data.activeCount,
      };
    },
    rpcFn: async () => rpcResult,
    rpcEnabled: rpcFallbackEnabled,
    enabled: !!address,
    staleTime: 30_000,
    refetchInterval: isPageVisible ? 120_000 : false,
  });

  return result?.data ?? rpcResult;
}
