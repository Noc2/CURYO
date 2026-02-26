"use client";

import { usePonderQuery } from "~~/hooks/usePonderQuery";
import { ponderApi } from "~~/services/ponder/client";
import { getRoundSalts } from "~~/utils/tlock";

export interface VotingStakes {
  /** Stake in cREP locked in active rounds */
  currentStaked: number;
  /** Stake in cREP in reveal/settle phase */
  revealingStaked: number;
  /** Sum of currentStaked + revealingStaked */
  totalVotingStake: number;
}

const EMPTY: VotingStakes = { currentStaked: 0, revealingStaked: 0, totalVotingStake: 0 };

/**
 * Hook that returns active voting stakes for a given address.
 * Uses Ponder API when available (on-chain indexed data, works cross-browser).
 * Falls back to voter-filtered localStorage round salts.
 */
export function useVotingStakes(address?: string): VotingStakes {
  // RPC fallback: count all stored round salts as active stake
  // (round timing is per-content, so we can't distinguish current/revealing without per-round reads)
  const rpcResult = (() => {
    if (!address) return EMPTY;

    const salts = getRoundSalts(address);
    const totalStaked = salts.reduce((sum, s) => sum + (s.stakeAmount ?? 0), 0);

    return { currentStaked: totalStaked, revealingStaked: 0, totalVotingStake: totalStaked };
  })();

  // --- Ponder-first with RPC fallback ---
  const { data: result } = usePonderQuery({
    queryKey: ["votingStakes", address],
    ponderFn: async () => {
      if (!address) return EMPTY;
      const data = await ponderApi.getVotingStakes(address);
      const pending = Number(data.pendingStake) / 1e6;
      const revealing = Number(data.revealingStake) / 1e6;
      return { currentStaked: pending, revealingStaked: revealing, totalVotingStake: pending + revealing };
    },
    rpcFn: async () => rpcResult,
    enabled: !!address,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  // Use localStorage when it has data — it's updated instantly after voting.
  // Only prefer Ponder when it reports a higher total (cross-browser votes).
  const localSalts = address ? getRoundSalts(address) : [];
  const hasExpiredSalts = localSalts.length > 0 && rpcResult.totalVotingStake === 0;

  const queryResult = result?.data;
  if (queryResult) {
    if (rpcResult.totalVotingStake >= queryResult.totalVotingStake) {
      return rpcResult;
    }
    // localStorage had salts but they all expired — Ponder's data is stale
    // (same votes the keeper hasn't revealed/processed yet)
    if (hasExpiredSalts) {
      return rpcResult;
    }
    return queryResult;
  }

  return rpcResult;
}
