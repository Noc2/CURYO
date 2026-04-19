import { DEFAULT_ROUND_CONFIG, ROUND_STATE } from "@curyo/contracts/protocol";
import { RoundData } from "~~/types/votingTypes";

export { buildStakeAmountWei, resolveFrontendCode } from "@curyo/sdk/vote";

export type RoundPhase = "voting" | "settled" | "cancelled" | "tied" | "revealFailed" | "none";

export interface VotingConfig {
  epochDuration: number;
  maxDuration: number;
  minVoters: number;
  maxVoters: number;
}

export interface OpenRoundFallbackData {
  roundId: bigint;
  voteCount: number;
  revealedCount: number;
  totalStake: bigint;
  upPool: bigint;
  downPool: bigint;
  upCount?: number;
  downCount?: number;
  startTime: bigint | null;
  epochDuration?: number;
  maxDuration?: number;
  minVoters?: number;
  maxVoters?: number;
}

interface OptimisticRoundDelta {
  voteCount: number;
  stake: bigint;
}

interface RoundTiming {
  epoch1EndTime: number;
  epoch1Remaining: number;
  currentEpochRemaining: number;
  roundTimeRemaining: number;
  isEpoch1: boolean;
}

interface VoteDeadlines extends RoundTiming {
  deadline: number;
  nextActionRemaining: number;
}

export interface RoundSnapshot {
  roundId: bigint;
  phase: RoundPhase;
  hasRound: boolean;
  state: number;
  startTime: number;
  revealedCount: number;
  voteCount: number;
  voteCountBigInt: bigint;
  totalStake: bigint;
  upPool: bigint;
  downPool: bigint;
  weightedUpPool: bigint;
  weightedDownPool: bigint;
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
    weightedUpPool: bigint;
    weightedDownPool: bigint;
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

function toPositiveNumber(value: unknown, fallback: number): number {
  const parsed = toNumber(value, fallback);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function maxBigInt(left: bigint, right: bigint): bigint {
  return left > right ? left : right;
}

function preferPositiveBigInt(
  primary: bigint | undefined,
  fallback: bigint | null | undefined,
  defaultValue = 0n,
): bigint {
  if (primary != null && primary > 0n) return primary;
  if (fallback != null && fallback > 0n) return fallback;
  if (primary != null) return primary;
  if (fallback != null) return fallback;
  return defaultValue;
}

export function parseVotingConfig(rawConfig: unknown): VotingConfig {
  if (!rawConfig) return DEFAULT_VOTING_CONFIG;

  const config = rawConfig as Record<string, unknown> & unknown[];

  if (config.epochDuration != null) {
    return {
      epochDuration: toPositiveNumber(config.epochDuration, DEFAULT_VOTING_CONFIG.epochDuration),
      maxDuration: toPositiveNumber(config.maxDuration, DEFAULT_VOTING_CONFIG.maxDuration),
      minVoters: toPositiveNumber(config.minVoters, DEFAULT_VOTING_CONFIG.minVoters),
      maxVoters: toPositiveNumber(config.maxVoters, DEFAULT_VOTING_CONFIG.maxVoters),
    };
  }

  if (Array.isArray(config) && config.length >= 4) {
    return {
      epochDuration: toPositiveNumber(config[0], DEFAULT_VOTING_CONFIG.epochDuration),
      maxDuration: toPositiveNumber(config[1], DEFAULT_VOTING_CONFIG.maxDuration),
      minVoters: toPositiveNumber(config[2], DEFAULT_VOTING_CONFIG.minVoters),
      maxVoters: toPositiveNumber(config[3], DEFAULT_VOTING_CONFIG.maxVoters),
    };
  }

  return DEFAULT_VOTING_CONFIG;
}

export function parseRound(rawRoundData: unknown): RoundData | undefined {
  if (!rawRoundData) return undefined;

  const round = rawRoundData as Record<string, unknown> & unknown[];

  // viem/abitype tuples can arrive as arrays with partially attached named properties.
  // Prefer indexed decoding when possible so missing named keys do not silently zero fields.
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

  return undefined;
}

export function mergeRoundDataWithFallback(params: {
  roundId: bigint;
  round?: RoundData;
  fallback?: OpenRoundFallbackData;
}): { roundId: bigint; round?: RoundData } {
  const { fallback, round } = params;

  if (!fallback) {
    return { roundId: params.roundId, round };
  }

  if (params.roundId > 0n && fallback.roundId > 0n && params.roundId !== fallback.roundId) {
    return { roundId: params.roundId, round };
  }

  if (
    round?.startTime != null &&
    round.startTime > 0n &&
    fallback.startTime != null &&
    round.startTime !== fallback.startTime
  ) {
    return { roundId: params.roundId, round };
  }

  const fallbackVoteCount = BigInt(Math.max(0, fallback.voteCount));
  const fallbackRevealedCount = BigInt(Math.max(0, fallback.revealedCount));
  const fallbackUpCount = BigInt(Math.max(0, fallback.upCount ?? 0));
  const fallbackDownCount = BigInt(Math.max(0, fallback.downCount ?? 0));
  const resolvedRoundId = params.roundId > 0n ? params.roundId : fallback.roundId;

  return {
    roundId: resolvedRoundId,
    round: {
      startTime: preferPositiveBigInt(round?.startTime, fallback.startTime),
      state: round?.state ?? ROUND_STATE.Open,
      voteCount: maxBigInt(round?.voteCount ?? 0n, fallbackVoteCount),
      revealedCount: maxBigInt(round?.revealedCount ?? 0n, fallbackRevealedCount),
      totalStake: maxBigInt(round?.totalStake ?? 0n, fallback.totalStake),
      upPool: maxBigInt(round?.upPool ?? 0n, fallback.upPool),
      downPool: maxBigInt(round?.downPool ?? 0n, fallback.downPool),
      upCount: maxBigInt(round?.upCount ?? 0n, fallbackUpCount),
      downCount: maxBigInt(round?.downCount ?? 0n, fallbackDownCount),
      upWins: round?.upWins ?? false,
      settledAt: round?.settledAt ?? 0n,
      thresholdReachedAt: round?.thresholdReachedAt ?? 0n,
      weightedUpPool: round?.weightedUpPool ?? 0n,
      weightedDownPool: round?.weightedDownPool ?? 0n,
    },
  };
}

function deriveRoundTiming(params: {
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

export function deriveVoteDeadlines(params: {
  startTime: number;
  now: number;
  epochDuration: number;
  maxDuration: number;
}): VoteDeadlines {
  const timing = deriveRoundTiming(params);
  const deadline = params.startTime > 0 ? params.startTime + params.maxDuration : 0;

  return {
    ...timing,
    deadline,
    nextActionRemaining: timing.epoch1Remaining > 0 ? timing.epoch1Remaining : timing.roundTimeRemaining,
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
  const revealedCount = Number(round?.revealedCount ?? 0n);
  const voteCount = Number(voteCountBigInt);
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
    revealedCount,
    voteCount,
    voteCountBigInt,
    totalStake,
    upPool: round?.upPool ?? 0n,
    downPool: round?.downPool ?? 0n,
    weightedUpPool: round?.weightedUpPool ?? 0n,
    weightedDownPool: round?.weightedDownPool ?? 0n,
    upCount: Number(round?.upCount ?? 0n),
    downCount: Number(round?.downCount ?? 0n),
    upWins: round?.upWins ?? false,
    thresholdReachedAt,
    settlementTime: thresholdReachedAt > 0 ? thresholdReachedAt : 0,
    settlementCountdown: 0,
    votersNeeded: Math.max(0, params.config.minVoters - revealedCount),
    readyToSettle: state === ROUND_STATE.Open && revealedCount >= params.config.minVoters,
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
      weightedUpPool: round?.weightedUpPool ?? 0n,
      weightedDownPool: round?.weightedDownPool ?? 0n,
      upCount: round?.upCount ?? 0n,
      downCount: round?.downCount ?? 0n,
      upWins: round?.upWins ?? false,
      thresholdReachedAt,
    },
  };
}
