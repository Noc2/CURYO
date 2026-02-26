"use client";

import { useEffect, useMemo } from "react";
import { useState } from "react";
import { useAccount, useReadContracts } from "wagmi";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";
import { ROUND_SALTS_UPDATED_EVENT, getRoundSalts, removeRoundSalt } from "~~/utils/tlock";

const RoundState = { Open: 0, Settled: 1, Cancelled: 2, Tied: 3 } as const;

export interface ClaimableItem {
  contentId: bigint;
  epochId: bigint; // roundId (kept as epochId for backwards compat with ClaimAll)
  reward: bigint;
  isTie: boolean;
}

interface SaltCallMap {
  getRound: number;
  claimed: number;
  voterPool: number;
  winStake: number;
}

/**
 * Hook that scans all vote history (localStorage round salts) and identifies
 * all claimable rewards across all rounds and content.
 */
export function useAllClaimableRewards() {
  const { address } = useAccount();
  const { data: votingEngineInfo } = useDeployedContractInfo({ contractName: "RoundVotingEngine" as any });
  const { data: distributorInfo } = useDeployedContractInfo({ contractName: "RoundRewardDistributor" as any });
  const [saltVersion, setSaltVersion] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const bumpVersion = () => setSaltVersion(v => v + 1);
    const handleStorage = () => bumpVersion();

    window.addEventListener(ROUND_SALTS_UPDATED_EVENT, bumpVersion);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener(ROUND_SALTS_UPDATED_EVENT, bumpVersion);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const salts = useMemo(() => getRoundSalts(address), [address, saltVersion]);

  // Build multicall requests for all salts
  const { contracts, saltCallMap } = useMemo(() => {
    if (!votingEngineInfo || !distributorInfo || !address || salts.length === 0)
      return { contracts: [] as any[], saltCallMap: [] as SaltCallMap[] };

    const calls: any[] = [];
    const mapping: SaltCallMap[] = [];

    // Dedup maps for pool/stake lookups
    const voterPoolMap = new Map<string, number>();
    const winStakeMap = new Map<string, number>();

    for (const s of salts) {
      const contentId = BigInt(s.contentId);
      const roundId = BigInt(s.roundId);
      const key = `${s.contentId}-${s.roundId}`;

      // getRound(contentId, roundId)
      const getRoundIdx = calls.length;
      calls.push({
        address: votingEngineInfo.address,
        abi: votingEngineInfo.abi,
        functionName: "getRound",
        args: [contentId, roundId],
      });

      // rewardClaimed(contentId, roundId, address)
      const claimedIdx = calls.length;
      calls.push({
        address: distributorInfo.address,
        abi: distributorInfo.abi,
        functionName: "rewardClaimed",
        args: [contentId, roundId, address],
      });

      // roundVoterPool(contentId, roundId) — deduplicate
      let voterPoolIdx = voterPoolMap.get(key);
      if (voterPoolIdx === undefined) {
        voterPoolIdx = calls.length;
        calls.push({
          address: votingEngineInfo.address,
          abi: votingEngineInfo.abi,
          functionName: "roundVoterPool",
          args: [contentId, roundId],
        });
        voterPoolMap.set(key, voterPoolIdx);
      }

      // roundWinningStake(contentId, roundId) — deduplicate
      let winStakeIdx = winStakeMap.get(key);
      if (winStakeIdx === undefined) {
        winStakeIdx = calls.length;
        calls.push({
          address: votingEngineInfo.address,
          abi: votingEngineInfo.abi,
          functionName: "roundWinningStake",
          args: [contentId, roundId],
        });
        winStakeMap.set(key, winStakeIdx);
      }

      mapping.push({
        getRound: getRoundIdx,
        claimed: claimedIdx,
        voterPool: voterPoolIdx,
        winStake: winStakeIdx,
      });
    }

    return { contracts: calls, saltCallMap: mapping };
  }, [votingEngineInfo, distributorInfo, address, salts]);

  const {
    data: results,
    isLoading,
    refetch,
  } = useReadContracts({
    contracts,
    query: { enabled: contracts.length > 0 },
  });

  // Process results
  const { claimableItems, totalClaimable, pendingStake } = useMemo(() => {
    const items: ClaimableItem[] = [];
    let total = 0n;
    let pendingStake = 0n;

    if (!results || results.length === 0) return { claimableItems: items, totalClaimable: total, pendingStake };

    for (let i = 0; i < salts.length; i++) {
      const map = saltCallMap[i];
      if (!map) continue;

      const roundResult = results[map.getRound];
      const claimedResult = results[map.claimed];

      if (roundResult?.status !== "success" || claimedResult?.status !== "success") continue;

      const round = roundResult.result as any;
      const alreadyClaimed = claimedResult.result as boolean;

      if (alreadyClaimed) continue;

      const stakeAmount = salts[i].stakeAmount ?? 0;
      if (stakeAmount === 0) continue;
      const stakeWei = BigInt(stakeAmount) * 1000000n;

      const state = Number(round.state ?? round[1] ?? 0);
      const upWins = round.upWins ?? round[9] ?? false;
      const contentId = BigInt(salts[i].contentId);
      const roundId = BigInt(salts[i].roundId);

      // Tied or Cancelled: full refund
      if (state === RoundState.Tied || state === RoundState.Cancelled) {
        items.push({ contentId, epochId: roundId, reward: stakeWei, isTie: true });
        total += stakeWei;
        continue;
      }

      // Still open: count as pending
      if (state === RoundState.Open) {
        pendingStake += stakeWei;
        continue;
      }

      // Only process settled rounds
      if (state !== RoundState.Settled) continue;

      const isUp = salts[i].isUp ?? false;
      const isWinner = isUp === upWins;

      if (!isWinner) continue;

      // Calculate reward: stake + pool share
      let reward = stakeWei;

      const voterPoolResult = results[map.voterPool];
      const winStakeResult = results[map.winStake];

      if (voterPoolResult?.status === "success" && winStakeResult?.status === "success") {
        const voterPool = voterPoolResult.result as bigint;
        const winStake = winStakeResult.result as bigint;
        if (winStake > 0n) {
          reward += (stakeWei * voterPool) / winStake;
        }
      }

      items.push({ contentId, epochId: roundId, reward, isTie: false });
      total += reward;
    }

    return { claimableItems: items, totalClaimable: total, pendingStake };
  }, [results, salts, saltCallMap]);

  // Clean up localStorage salts that have already been claimed on-chain
  useEffect(() => {
    if (!results || results.length === 0) return;
    for (let i = 0; i < salts.length; i++) {
      const map = saltCallMap[i];
      if (!map) continue;
      const claimedResult = results[map.claimed];
      if (claimedResult?.status === "success" && claimedResult.result === true) {
        removeRoundSalt(BigInt(salts[i].contentId), BigInt(salts[i].roundId));
      }
    }
  }, [results, salts, saltCallMap]);

  return {
    claimableItems,
    totalClaimable,
    pendingStake,
    isLoading,
    refetch,
  };
}
