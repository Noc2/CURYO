"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { ROUND_SALTS_UPDATED_EVENT, getRoundSalts } from "~~/utils/tlock";

// RoundState enum (matching Solidity)
const RoundState = { Open: 0, Settled: 1, Cancelled: 2, Tied: 3 } as const;

interface ClaimableReward {
  hasClaimable: boolean;
  epochId: bigint; // roundId (kept as "epochId" for backwards compat with consumers)
  reward: bigint;
  lost: bigint;
  isWinner: boolean;
  isTie: boolean;
  isLoading: boolean;
}

/**
 * Hook to check if user has claimable rewards for a specific content from any round.
 * Uses localStorage salts to find the user's most recent vote, then checks round state.
 * Returns reward amount if won, or lost amount if lost.
 */
export function useClaimableRewards(contentId: bigint): ClaimableReward {
  const { address } = useAccount();
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

  // Find the most recent round salt for this content from localStorage
  const { roundId, stakeAmount, isUp } = useMemo(() => {
    const salts = getRoundSalts(address);
    const matching = salts
      .filter(s => s.contentId === contentId.toString())
      .sort((a, b) => Number(b.roundId) - Number(a.roundId));
    if (matching.length === 0) return { roundId: 0n, stakeAmount: 0, isUp: false };
    const latest = matching[0];
    return {
      roundId: BigInt(latest.roundId),
      stakeAmount: latest.stakeAmount ?? 0,
      isUp: latest.isUp ?? false,
    };
  }, [contentId, address, saltVersion]);

  // Get round state
  const { data: roundData, isLoading: roundLoading } = useScaffoldReadContract({
    contractName: "RoundVotingEngine" as any,
    functionName: "getRound" as any,
    args: [contentId, roundId] as any,
    query: { enabled: roundId > 0n },
  } as any);

  // Check if already claimed
  const { data: alreadyClaimed, isLoading: claimedLoading } = useScaffoldReadContract({
    contractName: "RoundRewardDistributor" as any,
    functionName: "rewardClaimed" as any,
    args: [contentId, roundId, address] as any,
    query: { enabled: !!address && roundId > 0n },
  } as any);

  // Get reward pool data for calculating reward amount
  const { data: voterPool } = useScaffoldReadContract({
    contractName: "RoundVotingEngine" as any,
    functionName: "roundVoterPool" as any,
    args: [contentId, roundId] as any,
    query: { enabled: roundId > 0n },
  } as any);

  const { data: winningStake } = useScaffoldReadContract({
    contractName: "RoundVotingEngine" as any,
    functionName: "roundWinningStake" as any,
    args: [contentId, roundId] as any,
    query: { enabled: roundId > 0n },
  } as any);

  const isLoading = roundLoading || claimedLoading;
  const stakeWei = BigInt(stakeAmount) * 1000000n;

  // No vote or not applicable
  if (roundId === 0n || !roundData || alreadyClaimed || isLoading || stakeAmount === 0) {
    return {
      hasClaimable: false,
      epochId: roundId,
      reward: 0n,
      lost: 0n,
      isWinner: false,
      isTie: false,
      isLoading,
    };
  }

  // roundData may be returned as a named struct or positional tuple depending on ABI encoding
  const round = roundData as any;
  const state = Number(round.state ?? round[1] ?? 0);
  const upWins = round.upWins ?? round[9] ?? false;

  // Tied: full refund of stake
  if (state === RoundState.Tied) {
    return {
      hasClaimable: true,
      epochId: roundId,
      reward: stakeWei,
      lost: 0n,
      isWinner: false,
      isTie: true,
      isLoading: false,
    };
  }

  // Cancelled: full refund via claimCancelledRoundRefund
  if (state === RoundState.Cancelled) {
    return {
      hasClaimable: true,
      epochId: roundId,
      reward: stakeWei,
      lost: 0n,
      isWinner: false,
      isTie: true, // treat as tie for UI (same refund behavior)
      isLoading: false,
    };
  }

  // Not settled yet
  if (state !== RoundState.Settled) {
    return {
      hasClaimable: false,
      epochId: roundId,
      reward: 0n,
      lost: 0n,
      isWinner: false,
      isTie: false,
      isLoading: false,
    };
  }

  // Check if user won
  const isWinner = isUp === upWins;

  if (!isWinner) {
    return {
      hasClaimable: true,
      epochId: roundId,
      reward: 0n,
      lost: stakeWei,
      isWinner: false,
      isTie: false,
      isLoading: false,
    };
  }

  // User won — calculate reward (stake returned + proportional pool share)
  let reward = stakeWei;

  if (voterPool != null && winningStake != null) {
    const pool = BigInt(voterPool as any);
    const winning = BigInt(winningStake as any);
    if (winning > 0n) {
      const poolShare = (stakeWei * pool) / winning;
      reward += poolShare;
    }
  }

  return {
    hasClaimable: true,
    epochId: roundId,
    reward,
    lost: 0n,
    isWinner: true,
    isTie: false,
    isLoading: false,
  };
}
