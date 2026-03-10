import { DEFAULT_ROUND_CONFIG, ROUND_STATE } from "@curyo/contracts/protocol";
import { RoundData } from "~~/types/votingTypes";

export type RoundPhase = "voting" | "settled" | "cancelled" | "tied" | "revealFailed" | "none";

export interface VotingConfig {
  epochDuration: number;
  maxDuration: number;
  minVoters: number;
  maxVoters: number;
}

export interface OptimisticRoundDelta {
  voteCount: number;
  stake: bigint;
}

export interface RoundTiming {
  epoch1EndTime: number;
  epoch1Remaining: number;
  currentEpochRemaining: number;
  roundTimeRemaining: number;
  isEpoch1: boolean;
}

export interface RoundSnapshot {
  roundId: bigint;
  phase: RoundPhase;
  hasRound: boolean;
  state: number;
  startTime: number;
  voteCount: number;
  voteCountBigInt: bigint;
  revealedCount: number;
  totalStake: bigint;
  upPool: bigint;
  downPool: bigint;
  upCount: number;
  downCount: number;
  upWins: boolean;
  thresholdReachedAt: number;
  settlementTime: number;
  settlementCountdown: number;
  votersNeeded: number;
  readyToSettle: boolean;
  isRoundFull: boolean;
  minVoters: number;
  maxVoters: number;
  epochDuration: number;
  maxDuration: number;
  epoch1EndTime: number;
  epoch1Remaining: number;
  currentEpochRemaining: number;
  roundTimeRemaining: number;
  isEpoch1: boolean;
  round: {
    state: number;
    startTime: number;
    voteCount: bigint;
    revealedCount: number;
    totalStake: bigint;
    upPool: bigint;
    downPool: bigint;
    upCount: bigint;
    downCount: bigint;
    upWins: boolean;
    thresholdReachedAt: number;
  };
}

export const DEFAULT_VOTING_CONFIG: VotingConfig = {
  epochDuration: DEFAULT_ROUND_CONFIG.epochDurationSeconds,
  maxDuration: DEFAULT_ROUND_CONFIG.maxDurationSeconds,
  minVoters: DEFAULT_ROUND_CONFIG.minVoters,
  maxVoters: DEFAULT_ROUND_CONFIG.maxVoters,
};

function toBigInt(value: unknown, fallback = 0n): bigint {
  return typeof value === "bigint" ? value : fallback;
}

function toNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" ? value : typeof value === "bigint" ? Number(value) : fallback;
}

export function parseVotingConfig(rawConfig: unknown): VotingConfig {
  if (!rawConfig) return DEFAULT_VOTING_CONFIG;

  const config = rawConfig as Record<string, unknown> & unknown[];

  if (config.epochDuration != null) {
    return {
      epochDuration: toNumber(config.epochDuration, DEFAULT_VOTING_CONFIG.epochDuration),
      maxDuration: toNumber(config.maxDuration, DEFAULT_VOTING_CONFIG.maxDuration),
      minVoters: toNumber(config.minVoters, DEFAULT_VOTING_CONFIG.minVoters),
      maxVoters: toNumber(config.maxVoters, DEFAULT_VOTING_CONFIG.maxVoters),
    };
  }

  if (Array.isArray(config) && config.length >= 4) {
    return {
      epochDuration: toNumber(config[0], DEFAULT_VOTING_CONFIG.epochDuration),
      maxDuration: toNumber(config[1], DEFAULT_VOTING_CONFIG.maxDuration),
      minVoters: toNumber(config[2], DEFAULT_VOTING_CONFIG.minVoters),
      maxVoters: toNumber(config[3], DEFAULT_VOTING_CONFIG.maxVoters),
    };
  }

  return DEFAULT_VOTING_CONFIG;
}

export function parseRound(rawRoundData: unknown): RoundData | undefined {
  if (!rawRoundData) return undefined;

  const round = rawRoundData as Record<string, unknown> & unknown[];

  if (round.startTime != null) {
    return {
      startTime: toBigInt(round.startTime),
      state: toNumber(round.state),
      voteCount: toBigInt(round.voteCount),
      revealedCount: toBigInt(round.revealedCount),
      totalStake: toBigInt(round.totalStake),
      upPool: toBigInt(round.upPool),
      downPool: toBigInt(round.downPool),
      upCount: toBigInt(round.upCount),
      downCount: toBigInt(round.downCount),
      upWins: Boolean(round.upWins),
      settledAt: toBigInt(round.settledAt),
      thresholdReachedAt: toBigInt(round.thresholdReachedAt),
      weightedUpPool: toBigInt(round.weightedUpPool),
      weightedDownPool: toBigInt(round.weightedDownPool),
    };
  }

  if (Array.isArray(round) && round.length >= 14) {
    return {
      startTime: toBigInt(round[0]),
      state: toNumber(round[1]),
      voteCount: toBigInt(round[2]),
      revealedCount: toBigInt(round[3]),
      totalStake: toBigInt(round[4]),
      upPool: toBigInt(round[5]),
      downPool: toBigInt(round[6]),
      upCount: toBigInt(round[7]),
      downCount: toBigInt(round[8]),
      upWins: Boolean(round[9]),
      settledAt: toBigInt(round[10]),
      thresholdReachedAt: toBigInt(round[11]),
      weightedUpPool: toBigInt(round[12]),
      weightedDownPool: toBigInt(round[13]),
    };
  }

  return undefined;
}

export function deriveRoundTiming(params: {
  startTime: number;
  now: number;
  epochDuration: number;
  maxDuration: number;
}): RoundTiming {
  if (params.startTime <= 0) {
    return {
      epoch1EndTime: 0,
      epoch1Remaining: 0,
      currentEpochRemaining: 0,
      roundTimeRemaining: 0,
      isEpoch1: false,
    };
  }

  const epoch1EndTime = params.startTime + params.epochDuration;
  const elapsed = params.now - params.startTime;
  const epochProgress = elapsed >= 0 ? elapsed % params.epochDuration : 0;
  const currentEpochRemaining =
    elapsed >= 0 ? (epochProgress === 0 ? params.epochDuration : params.epochDuration - epochProgress) : 0;

  return {
    epoch1EndTime,
    epoch1Remaining: Math.max(0, epoch1EndTime - params.now),
    currentEpochRemaining,
    roundTimeRemaining: Math.max(0, params.startTime + params.maxDuration - params.now),
    isEpoch1: params.now < epoch1EndTime,
  };
}

function deriveRoundPhase(state: number, hasRound: boolean): RoundPhase {
  if (!hasRound) return "none";

  switch (state) {
    case ROUND_STATE.Open:
      return "voting";
    case ROUND_STATE.Settled:
      return "settled";
    case ROUND_STATE.Cancelled:
      return "cancelled";
    case ROUND_STATE.Tied:
      return "tied";
    case ROUND_STATE.RevealFailed:
      return "revealFailed";
    default:
      return "none";
  }
}

export function deriveRoundSnapshot(params: {
  roundId: bigint;
  round?: RoundData;
  config: VotingConfig;
  optimisticDelta?: OptimisticRoundDelta;
  now: number;
}): RoundSnapshot {
  const round = params.round;
  const hasRound = params.roundId > 0n && !!round;
  const state = round?.state ?? 0;
  const startTime = round ? Number(round.startTime) : 0;
  const optimisticVoteCount = BigInt(params.optimisticDelta?.voteCount ?? 0);
  const optimisticStake = params.optimisticDelta?.stake ?? 0n;
  const baseVoteCount = round?.voteCount ?? 0n;
  const voteCountBigInt = baseVoteCount + optimisticVoteCount;
  const voteCount = Number(voteCountBigInt);
  const revealedCount = Number(round?.revealedCount ?? 0n);
  const totalStake = (round?.totalStake ?? 0n) + optimisticStake;
  const thresholdReachedAt = round ? Number(round.thresholdReachedAt) : 0;
  const timing = deriveRoundTiming({
    startTime,
    now: params.now,
    epochDuration: params.config.epochDuration,
    maxDuration: params.config.maxDuration,
  });

  return {
    roundId: params.roundId,
    phase: deriveRoundPhase(state, hasRound),
    hasRound,
    state,
    startTime,
    voteCount,
    voteCountBigInt,
    revealedCount,
    totalStake,
    upPool: round?.upPool ?? 0n,
    downPool: round?.downPool ?? 0n,
    upCount: Number(round?.upCount ?? 0n),
    downCount: Number(round?.downCount ?? 0n),
    upWins: round?.upWins ?? false,
    thresholdReachedAt,
    settlementTime: thresholdReachedAt > 0 ? thresholdReachedAt : 0,
    settlementCountdown: 0,
    votersNeeded: Math.max(0, params.config.minVoters - voteCount),
    readyToSettle: state === ROUND_STATE.Open && voteCount >= params.config.minVoters,
    isRoundFull: voteCount >= params.config.maxVoters,
    minVoters: params.config.minVoters,
    maxVoters: params.config.maxVoters,
    epochDuration: params.config.epochDuration,
    maxDuration: params.config.maxDuration,
    epoch1EndTime: timing.epoch1EndTime,
    epoch1Remaining: timing.epoch1Remaining,
    currentEpochRemaining: timing.currentEpochRemaining,
    roundTimeRemaining: timing.roundTimeRemaining,
    isEpoch1: timing.isEpoch1,
    round: {
      state,
      startTime,
      voteCount: voteCountBigInt,
      revealedCount,
      totalStake,
      upPool: round?.upPool ?? 0n,
      downPool: round?.downPool ?? 0n,
      upCount: round?.upCount ?? 0n,
      downCount: round?.downCount ?? 0n,
      upWins: round?.upWins ?? false,
      thresholdReachedAt,
    },
  };
}
