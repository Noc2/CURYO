import { BPS_SCALE, EPOCH_WEIGHT_BPS, REWARD_SPLIT_BPS } from "@curyo/contracts/protocol";
import type { RoundSnapshot } from "~~/lib/contracts/roundVotingEngine";

const REMAINING_LOSING_POOL_BPS = BPS_SCALE - REWARD_SPLIT_BPS.revealedLoserRefund;
const VOTER_POOL_SHARE_BPS = Math.floor((REMAINING_LOSING_POOL_BPS * REWARD_SPLIT_BPS.voter) / BPS_SCALE);
type ProgressTone = "primary" | "warning" | "success" | "neutral";

type IncentiveSnapshot = Pick<
  RoundSnapshot,
  | "phase"
  | "isEpoch1"
  | "epoch1Remaining"
  | "readyToSettle"
  | "thresholdReachedAt"
  | "voteCount"
  | "revealedCount"
  | "minVoters"
  | "upPool"
  | "downPool"
  | "weightedUpPool"
  | "weightedDownPool"
>;

export interface RoundProgressMessaging {
  badgeLabel: string;
  badgeTone: ProgressTone;
  detailLabel: string | null;
  detailTone: ProgressTone;
  tooltip: string;
}

export interface VoteReturnEstimate {
  effectiveStakeMicro: bigint;
  projectedVoterPoolMicro: bigint;
  projectedPoolShareMicro: bigint;
  estimatedGrossReturnMicro: bigint;
  revealedLoserRefundMicro: bigint;
}

function formatPercent(value: number): string {
  const maximumFractionDigits = value >= 10 ? 0 : 1;
  return `${value.toLocaleString(undefined, { maximumFractionDigits })}%`;
}

export function formatPreciseDuration(seconds: number): string {
  if (seconds <= 0) return "00:00";

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  if (days > 0) {
    return `${days}d ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
  }

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

export function formatCompactDuration(seconds: number): string {
  if (seconds <= 0) return "0m";

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

export function formatCrepAmount(amountMicro: bigint | number, maximumFractionDigits = 1): string {
  const value = typeof amountMicro === "bigint" ? Number(amountMicro) / 1e6 : amountMicro;
  return value.toLocaleString(undefined, { maximumFractionDigits });
}

export function getBlindParticipationLabel(ratePercent?: number): string | null {
  if (ratePercent === undefined) return null;
  return `+${formatPercent(ratePercent)} bonus`;
}

export function getRoundProgressMessaging(
  snapshot: IncentiveSnapshot,
  ratePercent?: number,
): RoundProgressMessaging | null {
  if (snapshot.phase !== "voting") {
    return null;
  }

  if (snapshot.isEpoch1) {
    const bonusLabel = getBlindParticipationLabel(ratePercent);
    const urgencyLabel =
      snapshot.epoch1Remaining > 0 ? `${formatPreciseDuration(snapshot.epoch1Remaining)} left` : "Vote early";

    return {
      badgeLabel: "Blind",
      badgeTone: "primary",
      detailLabel: bonusLabel ? `${bonusLabel} · ${urgencyLabel}` : urgencyLabel,
      detailTone: snapshot.epoch1Remaining <= 15 * 60 ? "warning" : "primary",
      tooltip:
        "Blind votes stay hidden and earn full reward weight. Open-phase votes use 25% informed weight, so early voters keep the 4x advantage.",
    };
  }

  const votersNeeded = Math.max(0, snapshot.minVoters - snapshot.voteCount);
  const revealsNeeded = Math.max(0, snapshot.minVoters - snapshot.revealedCount);

  if (snapshot.readyToSettle || snapshot.thresholdReachedAt > 0) {
    return {
      badgeLabel: "Open",
      badgeTone: "warning",
      detailLabel: "Near settlement",
      detailTone: "success",
      tooltip:
        "Open votes can see live pools and revealed signal. Informed votes use 25% weight, but they help push rounds to settlement faster.",
    };
  }

  if (votersNeeded > 0) {
    return {
      badgeLabel: "Open",
      badgeTone: "warning",
      detailLabel: null,
      detailTone: votersNeeded === 1 ? "success" : "warning",
      tooltip:
        "Open votes can use the revealed market signal. This round still needs more voters before settlement can begin.",
    };
  }

  if (revealsNeeded > 0) {
    return {
      badgeLabel: "Open",
      badgeTone: "warning",
      detailLabel: `${revealsNeeded} more reveal${revealsNeeded === 1 ? "" : "s"} before settlement`,
      detailTone: "warning",
      tooltip:
        "Open votes can use the revealed market signal. Settlement starts once the reveal threshold and past-epoch checks clear.",
    };
  }

  return {
    badgeLabel: "Open",
    badgeTone: "warning",
    detailLabel: "Help settle this round",
    detailTone: "success",
    tooltip:
      "Open votes can use the revealed market signal. Informed votes use 25% weight, but they often help rounds close faster.",
  };
}

function getEpochWeightBps(isEpoch1: boolean) {
  return isEpoch1 ? EPOCH_WEIGHT_BPS.blind : EPOCH_WEIGHT_BPS.informed;
}

export function estimateVoteReturn(
  snapshot: Pick<IncentiveSnapshot, "isEpoch1" | "upPool" | "downPool" | "weightedUpPool" | "weightedDownPool">,
  isUp: boolean,
  stakeAmount: number,
): VoteReturnEstimate {
  const stakeMicro = BigInt(Math.round(stakeAmount * 1e6));
  const effectiveStakeMicro = (stakeMicro * BigInt(getEpochWeightBps(snapshot.isEpoch1))) / BigInt(BPS_SCALE);
  const losingPoolMicro = isUp ? snapshot.downPool : snapshot.upPool;
  const currentWinningWeightedMicro = isUp ? snapshot.weightedUpPool : snapshot.weightedDownPool;
  const projectedWinningWeightedMicro = currentWinningWeightedMicro + effectiveStakeMicro;
  const projectedVoterPoolMicro = (losingPoolMicro * BigInt(VOTER_POOL_SHARE_BPS)) / BigInt(BPS_SCALE);
  const projectedPoolShareMicro =
    projectedWinningWeightedMicro > 0n
      ? (effectiveStakeMicro * projectedVoterPoolMicro) / projectedWinningWeightedMicro
      : 0n;
  const estimatedGrossReturnMicro = stakeMicro + projectedPoolShareMicro;
  const revealedLoserRefundMicro = (stakeMicro * BigInt(REWARD_SPLIT_BPS.revealedLoserRefund)) / BigInt(BPS_SCALE);

  return {
    effectiveStakeMicro,
    projectedVoterPoolMicro,
    projectedPoolShareMicro,
    estimatedGrossReturnMicro,
    revealedLoserRefundMicro,
  };
}
