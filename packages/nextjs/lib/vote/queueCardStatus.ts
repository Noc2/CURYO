import { type RoundPhase, type VotingConfig, deriveRoundTiming } from "~~/lib/contracts/roundVotingEngine";

type QueueCardPhaseTone = "blind" | "open";
type QueueCardUrgencyTone = "neutral" | "warning" | "success";

export interface QueueCardStatusSnapshot {
  phase: RoundPhase;
  isEpoch1: boolean;
  epoch1Remaining: number;
  voteCount: number;
  minVoters: number;
  readyToSettle: boolean;
  thresholdReachedAt: number;
}

export interface QueueCardStatus {
  phaseLabel: "Blind" | "Open";
  phaseTone: QueueCardPhaseTone;
  urgencyLabel: string;
  urgencyTone: QueueCardUrgencyTone;
}

export interface QueueCardStatusOpenRound {
  voteCount: number;
  startTime: bigint | null;
}

function formatQueueCountdown(seconds: number): string {
  if (seconds <= 0) return "0m";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (minutes > 0) {
    return `${minutes}m`;
  }

  return `${seconds}s`;
}

export function getQueueCardStatus(snapshot: QueueCardStatusSnapshot): QueueCardStatus | null {
  if (snapshot.phase !== "voting") {
    return null;
  }

  if (snapshot.isEpoch1) {
    return {
      phaseLabel: "Blind",
      phaseTone: "blind",
      urgencyLabel: `${formatQueueCountdown(snapshot.epoch1Remaining)} left`,
      urgencyTone: snapshot.epoch1Remaining <= 15 * 60 ? "warning" : "neutral",
    };
  }

  const votesNeeded = Math.max(0, snapshot.minVoters - snapshot.voteCount);

  if (snapshot.readyToSettle || snapshot.thresholdReachedAt > 0 || votesNeeded === 0) {
    return {
      phaseLabel: "Open",
      phaseTone: "open",
      urgencyLabel: "Near settlement",
      urgencyTone: "success",
    };
  }

  return {
    phaseLabel: "Open",
    phaseTone: "open",
    urgencyLabel: `Needs ${votesNeeded} more vote${votesNeeded === 1 ? "" : "s"}`,
    urgencyTone: "warning",
  };
}

export function getQueueCardStatusFromOpenRound(params: {
  openRound: QueueCardStatusOpenRound | null;
  now: number;
  config: Pick<VotingConfig, "epochDuration" | "maxDuration" | "minVoters">;
}): QueueCardStatus | null {
  if (!params.openRound) {
    return null;
  }

  const startTime = Number(params.openRound.startTime ?? 0n);
  const timing = deriveRoundTiming({
    startTime,
    now: params.now,
    epochDuration: params.config.epochDuration,
    maxDuration: params.config.maxDuration,
  });

  return getQueueCardStatus({
    phase: "voting",
    isEpoch1: timing.isEpoch1,
    epoch1Remaining: timing.epoch1Remaining,
    voteCount: params.openRound.voteCount,
    minVoters: params.config.minVoters,
    readyToSettle: params.openRound.voteCount >= params.config.minVoters,
    thresholdReachedAt: 0,
  });
}
