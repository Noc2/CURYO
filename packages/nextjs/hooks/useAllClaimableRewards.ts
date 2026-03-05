"use client";

import { useMemo } from "react";
import { useAccount, useReadContracts } from "wagmi";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";
import { usePonderQuery } from "~~/hooks/usePonderQuery";
import { ponderApi } from "~~/services/ponder/client";

export interface ClaimableItem {
  contentId: bigint;
  epochId: bigint; // roundId (kept as epochId for backwards compat with ClaimAll)
  reward: bigint;
  isTie: boolean;
}

// RoundState enum (matching Solidity)
const RoundState = { Open: 0, Settled: 1, Cancelled: 2, Tied: 3 } as const;

// epochWeightBps: epoch-1 = 10000 (100%), epoch-2+ = 2500 (25%)
function epochWeightBps(epochIndex: number): number {
  return epochIndex === 0 ? 10000 : 2500;
}

/**
 * Hook that identifies all claimable rewards across all rounds and content.
 * Uses Ponder API to find the user's recent votes, then checks on-chain state.
 */
export function useAllClaimableRewards() {
  const { address } = useAccount();

  // --- Step 1: Fetch user's votes from Ponder ---
  const { data: ponderResult, refetch: refetchVotes } = usePonderQuery({
    queryKey: ["allClaimableVotes", address],
    ponderFn: async () => {
      if (!address) return [];
      const res = await ponderApi.getVotes({ voter: address, limit: "200" });
      return res.items ?? [];
    },
    rpcFn: async () => [],
    enabled: !!address,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const votes = ponderResult?.data ?? [];

  // --- Step 2: Filter to terminal rounds only (Settled+revealed, Cancelled, Tied) ---
  const terminalVotes = useMemo(() => {
    return votes.filter(v => {
      const state = v.roundState;
      if (state === RoundState.Cancelled || state === RoundState.Tied) return true;
      if (state === RoundState.Settled && v.revealed && v.isUp !== null) return true;
      return false;
    });
  }, [votes]);

  // --- Step 3: Multicall rewardClaimed to filter out already claimed ---
  const { data: distributorInfo } = useDeployedContractInfo({ contractName: "RoundRewardDistributor" });
  const { data: engineInfo } = useDeployedContractInfo({ contractName: "RoundVotingEngine" as any });

  const claimedContracts = useMemo(() => {
    if (!distributorInfo || !address || terminalVotes.length === 0) return [];
    return terminalVotes.map(v => ({
      address: distributorInfo.address,
      abi: distributorInfo.abi,
      functionName: "rewardClaimed" as const,
      args: [BigInt(v.contentId), BigInt(v.roundId), address],
    }));
  }, [distributorInfo, address, terminalVotes]);

  const { data: claimedResults, isLoading: claimedLoading } = useReadContracts({
    contracts: claimedContracts,
    query: { enabled: claimedContracts.length > 0 },
  });

  // --- Step 4: Classify unclaimed votes into wins and ties ---
  const unclaimedVotes = useMemo(() => {
    if (!claimedResults || claimedResults.length !== terminalVotes.length) return [];
    return terminalVotes.filter((_, i) => {
      const r = claimedResults[i];
      return r?.status === "success" && r.result === false;
    });
  }, [terminalVotes, claimedResults]);

  // Separate winners and ties/cancelled (losses are not claimable)
  const { winners, ties } = useMemo(() => {
    const w: typeof unclaimedVotes = [];
    const t: typeof unclaimedVotes = [];
    for (const v of unclaimedVotes) {
      const state = v.roundState;
      if (state === RoundState.Cancelled || state === RoundState.Tied) {
        t.push(v);
      } else if (state === RoundState.Settled && v.isUp === v.roundUpWins) {
        w.push(v);
      }
      // losses: not claimable, skip
    }
    return { winners: w, ties: t };
  }, [unclaimedVotes]);

  // --- Step 5: Multicall roundVoterPool + roundWinningStake for winners ---
  const rewardContracts = useMemo(() => {
    if (!engineInfo || winners.length === 0) return [];
    return winners.flatMap(v => [
      {
        address: engineInfo.address,
        abi: engineInfo.abi,
        functionName: "roundVoterPool" as const,
        args: [BigInt(v.contentId), BigInt(v.roundId)],
      },
      {
        address: engineInfo.address,
        abi: engineInfo.abi,
        functionName: "roundWinningStake" as const,
        args: [BigInt(v.contentId), BigInt(v.roundId)],
      },
    ]);
  }, [engineInfo, winners]);

  const { data: rewardResults, isLoading: rewardsLoading } = useReadContracts({
    contracts: rewardContracts,
    query: { enabled: rewardContracts.length > 0 },
  });

  // --- Step 6: Build claimable items with calculated rewards ---
  const { claimableItems, totalClaimable, activeStake } = useMemo(() => {
    const items: ClaimableItem[] = [];
    let total = 0n;

    // Add ties/cancelled (refund = stake)
    for (const v of ties) {
      const stake = BigInt(v.stake);
      items.push({
        contentId: BigInt(v.contentId),
        epochId: BigInt(v.roundId),
        reward: stake,
        isTie: true,
      });
      total += stake;
    }

    // Add winners (calculated reward)
    if (rewardResults && rewardResults.length === winners.length * 2) {
      for (let i = 0; i < winners.length; i++) {
        const v = winners[i];
        const stake = BigInt(v.stake);
        const poolResult = rewardResults[i * 2];
        const winStakeResult = rewardResults[i * 2 + 1];

        let reward = stake; // at minimum, get stake back
        if (poolResult?.status === "success" && winStakeResult?.status === "success") {
          const pool = BigInt(poolResult.result as any);
          const weighted = BigInt(winStakeResult.result as any);
          if (weighted > 0n) {
            const w = BigInt(epochWeightBps(v.epochIndex));
            const effectiveStake = (stake * w) / 10000n;
            const poolShare = (effectiveStake * pool) / weighted;
            reward += poolShare;
          }
        }

        items.push({
          contentId: BigInt(v.contentId),
          epochId: BigInt(v.roundId),
          reward,
          isTie: false,
        });
        total += reward;
      }
    }

    // Active stake = sum of stakes in open rounds
    let active = 0n;
    for (const v of votes) {
      if (v.roundState === RoundState.Open) {
        active += BigInt(v.stake);
      }
    }

    return { claimableItems: items, totalClaimable: total, activeStake: active };
  }, [ties, winners, rewardResults, votes]);

  const isLoading = claimedLoading || rewardsLoading;

  return {
    claimableItems,
    totalClaimable,
    activeStake,
    isLoading,
    refetch: refetchVotes,
  };
}
