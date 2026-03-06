"use client";

import { useRoundSnapshot } from "~~/hooks/useRoundSnapshot";
import { RoundPhase } from "~~/lib/contracts/roundVotingEngine";

export interface RoundPhaseInfo {
  /** Current phase of the round for this content */
  phase: RoundPhase;
  /** Active round ID for this content (0 if none) */
  roundId: bigint;
  /** Number of vote commits cast so far */
  voteCount: number;
  /** Number of votes that have been revealed (direction known) */
  revealedCount: number;
  /** Total stake committed in this round (raw, 6 decimals) */
  totalStake: bigint;
  /** How many more voters needed to reach minVoters (0 if already met) */
  votersNeeded: number;
  /** Seconds remaining until round expiry (maxDuration from startTime) */
  roundTimeRemaining: number;
  /** Seconds remaining in epoch 1 (0 if epoch 1 has ended) */
  epoch1Remaining: number;
  /** Seconds remaining in the current epoch (time until next epoch boundary) */
  currentEpochRemaining: number;
  /** Whether we are still in epoch 1 (blind voting, full reward weight) */
  isEpoch1: boolean;
  /** Unix timestamp when epoch 1 ends for this round */
  epoch1EndTime: number;
  /** Epoch duration in seconds (from contract config) */
  epochDuration: number;
  /** Unix timestamp when the round started */
  startTime: number;
  /** Minimum voters required for settlement */
  minVoters: number;
  /** Maximum voters allowed per round */
  maxVoters: number;
  /** Timestamp when revealedCount first reached minVoters (0 = not yet) */
  thresholdReachedAt: number;
  /** Unix timestamp when settlement becomes possible (0 = not yet) */
  settlementTime: number;
  /** Seconds remaining until settlement is possible (0 = ready or not applicable) */
  settlementCountdown: number;
  /** Whether contract data has loaded */
  isReady: boolean;
}

/**
 * Per-content round state tracking for tlock commit-reveal voting.
 * Reads from RoundVotingEngine: getActiveRoundId(contentId) and getRound(contentId, roundId).
 * Polls every 5 seconds for updates and ticks locally every second for countdowns.
 *
 * Epoch 1 (blind) = first epochDuration seconds after round start — full reward weight (100%)
 * Epoch 2+ (informed) = after epoch 1 ends — reduced reward weight (25%)
 */
export function useRoundPhase(contentId?: bigint): RoundPhaseInfo {
  const snapshot = useRoundSnapshot(contentId);

  const defaultResult: RoundPhaseInfo = {
    phase: "none",
    roundId: 0n,
    voteCount: 0,
    revealedCount: 0,
    totalStake: 0n,
    votersNeeded: 0,
    roundTimeRemaining: 0,
    epoch1Remaining: 0,
    currentEpochRemaining: 0,
    isEpoch1: false,
    epoch1EndTime: 0,
    epochDuration: snapshot.epochDuration,
    startTime: 0,
    minVoters: snapshot.minVoters,
    maxVoters: snapshot.maxVoters,
    thresholdReachedAt: 0,
    settlementTime: 0,
    settlementCountdown: 0,
    isReady: snapshot.isReady,
  };

  if (!snapshot.hasRound) {
    return defaultResult;
  }

  return {
    phase: snapshot.phase,
    roundId: snapshot.roundId,
    voteCount: snapshot.voteCount,
    revealedCount: snapshot.revealedCount,
    totalStake: snapshot.totalStake,
    votersNeeded: snapshot.votersNeeded,
    roundTimeRemaining: snapshot.roundTimeRemaining,
    epoch1Remaining: snapshot.epoch1Remaining,
    currentEpochRemaining: snapshot.currentEpochRemaining,
    isEpoch1: snapshot.isEpoch1,
    epoch1EndTime: snapshot.epoch1EndTime,
    epochDuration: snapshot.epochDuration,
    startTime: snapshot.startTime,
    minVoters: snapshot.minVoters,
    maxVoters: snapshot.maxVoters,
    thresholdReachedAt: snapshot.thresholdReachedAt,
    settlementTime: snapshot.settlementTime,
    settlementCountdown: snapshot.settlementCountdown,
    isReady: snapshot.isReady,
  };
}
