"use client";

import { useMemo } from "react";
import { useReadContracts } from "wagmi";
import { useDeployedContractInfo, useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { usePonderQuery } from "~~/hooks/usePonderQuery";
import { ponderApi } from "~~/services/ponder/client";

const SUBMISSION_STAKE_CREP = 10; // 10 cREP (contract constant MIN_SUBMITTER_STAKE)

/**
 * Hook that returns the total active submission stakes for a given address.
 * Uses Ponder API when available (single SQL query), falls back to RPC multicall.
 */
export function useSubmissionStakes(address?: string) {
  // --- RPC fallback: fetch all content via multicall ---
  const { data: registryInfo } = useDeployedContractInfo({ contractName: "ContentRegistry" });
  const { data: nextContentId } = useScaffoldReadContract({
    contractName: "ContentRegistry",
    functionName: "nextContentId",
  });

  const contentCount = nextContentId ? Number(nextContentId) - 1 : 0;

  const contracts = useMemo(() => {
    if (!registryInfo || contentCount === 0) return [];
    return Array.from({ length: contentCount }, (_, i) => ({
      address: registryInfo.address,
      abi: registryInfo.abi,
      functionName: "getContent" as const,
      args: [BigInt(i + 1)],
    }));
  }, [registryInfo, contentCount]);

  const { data: results } = useReadContracts({
    contracts,
    query: { enabled: contracts.length > 0 && !!address },
  });

  const rpcResult = useMemo(() => {
    if (!results || !address) return { totalSubmissionStake: 0, activeSubmissionCount: 0 };

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
  }, [results, address]);

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
    enabled: !!address,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  return result?.data ?? rpcResult;
}
