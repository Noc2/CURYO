"use client";

import { encodePacked, keccak256 } from "viem";
import { useAccount } from "wagmi";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";

// RoundState enum (matching Solidity)
const RoundState = { Open: 0, Settled: 1, Cancelled: 2, Tied: 3 } as const;

// epochWeightBps: epoch-1 = 10000 (100%), epoch-2+ = 2500 (25%)
function epochWeightBps(epochIndex: number): number {
  return epochIndex === 0 ? 10000 : 2500;
}

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
 * Uses voterCommitHash + getCommit for tlock commit-reveal (no getVote/hasVoted).
 * Reward is epoch-weighted: effectiveStake * voterPool / weightedWinningStake.
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

  // Get user's commitHash for this round (0 = not committed)
  const { data: rawCommitHash } = useScaffoldReadContract({
    contractName: "RoundVotingEngine" as any,
    functionName: "voterCommitHash" as any,
    args: [contentId, roundId, address] as any,
    query: { enabled: !!address && roundId > 0n },
  } as any);
  const commitHash = rawCommitHash as unknown as `0x${string}` | undefined;
  const hasCommitted =
    commitHash != null && commitHash !== "0x0000000000000000000000000000000000000000000000000000000000000000";

  // Compute commitKey = keccak256(abi.encodePacked(voter, commitHash)) for getCommit lookup
  const commitKey =
    hasCommitted && address && commitHash
      ? keccak256(encodePacked(["address", "bytes32"], [address as `0x${string}`, commitHash]))
      : undefined;

  // Get the full commit data (stake, epochIndex, isUp, revealed)
  const { data: rawCommitData } = useScaffoldReadContract({
    contractName: "RoundVotingEngine" as any,
    functionName: "getCommit" as any,
    args: [contentId, roundId, commitKey] as any,
    query: { enabled: !!commitKey },
  } as any);

  // Get round state
  const { data: roundData, isLoading: roundLoading } = useScaffoldReadContract({
    contractName: "RoundVotingEngine" as any,
    functionName: "getRound" as any,
    args: [contentId, roundId] as any,
    query: { enabled: roundId > 0n },
  } as any);

  // Check if already claimed (rewardClaimed mapping in RoundRewardDistributor)
  const { data: alreadyClaimed, isLoading: claimedLoading } = useScaffoldReadContract({
    contractName: "RoundRewardDistributor" as any,
    functionName: "rewardClaimed" as any,
    args: [contentId, roundId, address] as any,
    query: { enabled: !!address && roundId > 0n },
  } as any);

  // Get reward pool data
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

  // Parse commit data
  const commitData = rawCommitData as unknown as
    | { voter: string; stakeAmount: bigint; epochIndex: number; revealed: boolean; isUp: boolean }
    | undefined;

  const stakeWei = commitData?.stakeAmount ?? 0n;
  const isUp = commitData?.isUp ?? false;
  const epochIndex = commitData?.epochIndex ?? 0;

  // No commit or not applicable
  if (roundId === 0n || !roundData || !hasCommitted || alreadyClaimed || isLoading || stakeWei === 0n) {
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

  // User won — calculate reward using epoch-weighted effective stake
  // effectiveStake = stakeAmount * epochWeightBps / 10000
  // reward = stakeAmount + (effectiveStake * voterPool / weightedWinningStake)
  let reward = stakeWei;

  if (voterPool != null && winningStake != null) {
    const pool = BigInt(voterPool as any);
    const weighted = BigInt(winningStake as any);
    if (weighted > 0n) {
      const w = BigInt(epochWeightBps(epochIndex));
      const effectiveStake = (stakeWei * w) / 10000n;
      const poolShare = (effectiveStake * pool) / weighted;
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
