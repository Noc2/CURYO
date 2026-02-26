"use client";

import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/**
 * Hook to read and manage delegation state for a VoterIdNFT holder.
 */
export function useDelegation(address?: string) {
  const {
    data: currentDelegateTo,
    isLoading: delegateToLoading,
    refetch: refetchDelegateTo,
  } = useScaffoldReadContract({
    contractName: "VoterIdNFT" as any,
    functionName: "delegateTo",
    args: [address],
    query: { enabled: !!address },
  } as any);

  const {
    data: currentDelegateOf,
    isLoading: delegateOfLoading,
    refetch: refetchDelegateOf,
  } = useScaffoldReadContract({
    contractName: "VoterIdNFT" as any,
    functionName: "delegateOf",
    args: [address],
    query: { enabled: !!address },
  } as any);

  const { writeContractAsync, isPending } = useScaffoldWriteContract({
    contractName: "VoterIdNFT" as any,
  } as any);

  const refetch = () => {
    refetchDelegateTo();
    refetchDelegateOf();
  };

  const delegateTo = typeof currentDelegateTo === "string" ? currentDelegateTo : ZERO_ADDRESS;
  const delegateOf = typeof currentDelegateOf === "string" ? currentDelegateOf : ZERO_ADDRESS;
  const hasDelegate = !!delegateTo && delegateTo !== ZERO_ADDRESS;
  const isDelegate = !!delegateOf && delegateOf !== ZERO_ADDRESS;

  return {
    delegateTo,
    delegateOf,
    hasDelegate,
    isDelegate,
    isLoading: delegateToLoading || delegateOfLoading,
    isPending,
    writeContractAsync,
    refetch,
  };
}
