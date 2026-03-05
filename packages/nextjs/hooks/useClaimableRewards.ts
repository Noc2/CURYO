"use client";

import { encodePacked, keccak256 } from "viem";
import { useAccount } from "wagmi";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { CommitData, RoundData } from "~~/types/votingTypes";

// RoundState enum (matching Solidity)
const RoundState = { Open: 0, Settled: 1, Cancelled: 2, Tied: 3 } as const;

const ZERO_BYTES32 = "0x0000000000000000000000000000000000000000000000000000000000000000";

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
 * Hook to check if user has claimable rewards for a specific content.
 *
 * Round resolution strategy:
 * 1. Try getActiveRoundId (non-zero when an open round exists)
 * 2. Fall back to currentRoundId (always points to the latest round, even terminal)
 * 3. If the user has no commit in that round, check the previous round (roundId - 1)
 *    — handles the case where a new round started after the user's winning round settled
 */
export function useClaimableRewards(contentId: bigint): ClaimableReward {
  const { address } = useAccount();

  // --- Step 1: Determine candidate round IDs ---

  const { data: rawActiveRoundId } = useScaffoldReadContract({
    contractName: "RoundVotingEngine" as any,
    functionName: "getActiveRoundId" as any,
    args: [contentId] as any,
    query: { enabled: contentId !== undefined },
  } as any);
  const activeRoundId = (rawActiveRoundId as unknown as bigint) ?? 0n;

  const { data: rawCurrentRoundId } = useScaffoldReadContract({
    contractName: "RoundVotingEngine" as any,
    functionName: "currentRoundId" as any,
    args: [contentId] as any,
    query: { enabled: contentId !== undefined },
  } as any);
  const latestRoundId = (rawCurrentRoundId as unknown as bigint) ?? 0n;

  const primaryRoundId = activeRoundId > 0n ? activeRoundId : latestRoundId;
  const prevRoundId = primaryRoundId > 1n ? primaryRoundId - 1n : 0n;

  // --- Step 2: Check user's commit in primary and previous rounds ---

  const { data: rawPrimaryCommitHash } = useScaffoldReadContract({
    contractName: "RoundVotingEngine" as any,
    functionName: "voterCommitHash" as any,
    args: [contentId, primaryRoundId, address] as any,
    query: { enabled: !!address && primaryRoundId > 0n },
  } as any);
  const primaryCommitHash = rawPrimaryCommitHash as unknown as `0x${string}` | undefined;
  const hasPrimaryCommit = primaryCommitHash != null && primaryCommitHash !== ZERO_BYTES32;

  const { data: rawPrevCommitHash } = useScaffoldReadContract({
    contractName: "RoundVotingEngine" as any,
    functionName: "voterCommitHash" as any,
    args: [contentId, prevRoundId, address] as any,
    query: { enabled: !!address && prevRoundId > 0n && !hasPrimaryCommit },
  } as any);
  const prevCommitHash = rawPrevCommitHash as unknown as `0x${string}` | undefined;
  const hasPrevCommit = prevCommitHash != null && prevCommitHash !== ZERO_BYTES32;

  // --- Step 3: Choose the effective round ---

  const roundId = hasPrimaryCommit ? primaryRoundId : hasPrevCommit ? prevRoundId : primaryRoundId;
  const commitHash = hasPrimaryCommit ? primaryCommitHash : hasPrevCommit ? prevCommitHash : undefined;
  const hasCommitted = hasPrimaryCommit || hasPrevCommit;

  // --- Step 4: Read commit data, round state, and reward info for the chosen round ---

  const commitKey =
    hasCommitted && address && commitHash
      ? keccak256(encodePacked(["address", "bytes32"], [address as `0x${string}`, commitHash]))
      : undefined;

  const { data: rawCommitData } = useScaffoldReadContract({
    contractName: "RoundVotingEngine" as any,
    functionName: "getCommit" as any,
    args: [contentId, roundId, commitKey] as any,
    query: { enabled: !!commitKey },
  } as any);

  const { data: roundData, isLoading: roundLoading } = useScaffoldReadContract({
    contractName: "RoundVotingEngine" as any,
    functionName: "getRound" as any,
    args: [contentId, roundId] as any,
    query: { enabled: roundId > 0n },
  } as any);

  const { data: alreadyClaimed, isLoading: claimedLoading } = useScaffoldReadContract({
    contractName: "RoundRewardDistributor" as any,
    functionName: "rewardClaimed" as any,
    args: [contentId, roundId, address] as any,
    query: { enabled: !!address && roundId > 0n },
  } as any);

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

  const commitData = rawCommitData as unknown as CommitData | undefined;

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

  const round = roundData as unknown as RoundData;
  const state = Number(round.state);
  const upWins = round.upWins;

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
