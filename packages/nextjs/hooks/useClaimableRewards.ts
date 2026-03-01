"use client";

import { useAccount } from "wagmi";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";

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
 * Hook to check if user has claimable rewards for a specific content from the active round.
 * Queries the contract directly for vote data (no localStorage needed -- votes are public).
 * Returns reward amount if won, or lost amount if lost.
 */
export function useClaimableRewards(contentId: bigint): ClaimableReward {
  const { address } = useAccount();

  // Get active round ID
  const { data: rawActiveRoundId } = useScaffoldReadContract({
    contractName: "RoundVotingEngine" as any,
    functionName: "getActiveRoundId" as any,
    args: [contentId] as any,
    query: { enabled: contentId !== undefined },
  } as any);
  const roundId = (rawActiveRoundId as unknown as bigint) ?? 0n;

  // Check if user voted in this round
  const { data: hasVoted } = useScaffoldReadContract({
    contractName: "RoundVotingEngine" as any,
    functionName: "hasVoted" as any,
    args: [contentId, roundId, address] as any,
    query: { enabled: !!address && roundId > 0n },
  } as any);

  // Get the user's vote data
  const { data: rawVoteData } = useScaffoldReadContract({
    contractName: "RoundVotingEngine" as any,
    functionName: "getVote" as any,
    args: [contentId, roundId, address] as any,
    query: { enabled: !!address && roundId > 0n && (hasVoted as unknown as boolean) === true },
  } as any);

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

  // Parse vote data
  const voteData = rawVoteData as unknown as
    | { voter: string; stake: bigint; shares: bigint; isUp: boolean; frontend: string }
    | undefined;
  const stakeWei = voteData?.stake ?? 0n;
  const isUp = voteData?.isUp ?? false;

  // No vote or not applicable
  if (roundId === 0n || !roundData || !hasVoted || alreadyClaimed || isLoading || stakeWei === 0n) {
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
  const state = Number(round.state ?? round[2] ?? 0);
  const upWins = round.upWins ?? round[11] ?? false;

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

  // User won -- calculate reward (stake returned + proportional pool share)
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
