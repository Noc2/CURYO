import { DEFAULT_ROUND_CONFIG } from "@curyo/contracts/protocol";

export type QuestionRoundConfig = {
  epochDuration: bigint;
  maxDuration: bigint;
  minVoters: bigint;
  maxVoters: bigint;
};

export type SerializedQuestionRoundConfig = {
  epochDuration: string;
  maxDuration: string;
  minVoters: string;
  maxVoters: string;
};

export type QuestionRoundConfigBounds = {
  minEpochDuration: number;
  maxEpochDuration: number;
  minRoundDuration: number;
  maxRoundDuration: number;
  minSettlementVoters: number;
  maxSettlementVoters: number;
  minVoterCap: number;
  maxVoterCap: number;
};

export const QUESTION_ROUND_MAX_EPOCH_COUNT = 2016;
export const MAX_QUESTION_BUNDLE_ROUND_VOTERS = 100;

export const DEFAULT_QUESTION_ROUND_CONFIG: QuestionRoundConfig = {
  epochDuration: BigInt(DEFAULT_ROUND_CONFIG.epochDurationSeconds),
  maxDuration: BigInt(DEFAULT_ROUND_CONFIG.maxDurationSeconds),
  minVoters: BigInt(DEFAULT_ROUND_CONFIG.minVoters),
  maxVoters: BigInt(DEFAULT_ROUND_CONFIG.maxVoters),
};

export const DEFAULT_QUESTION_ROUND_CONFIG_BOUNDS: QuestionRoundConfigBounds = {
  minEpochDuration: 5 * 60,
  maxEpochDuration: 60 * 60,
  minRoundDuration: 60 * 60,
  maxRoundDuration: 30 * 24 * 60 * 60,
  minSettlementVoters: 2,
  maxSettlementVoters: 100,
  minVoterCap: 2,
  maxVoterCap: 10_000,
};

export function serializeQuestionRoundConfig(config: QuestionRoundConfig): SerializedQuestionRoundConfig {
  return {
    epochDuration: config.epochDuration.toString(),
    maxDuration: config.maxDuration.toString(),
    minVoters: config.minVoters.toString(),
    maxVoters: config.maxVoters.toString(),
  };
}

export function questionRoundConfigsEqual(left: QuestionRoundConfig, right: QuestionRoundConfig): boolean {
  return (
    left.epochDuration === right.epochDuration &&
    left.maxDuration === right.maxDuration &&
    left.minVoters === right.minVoters &&
    left.maxVoters === right.maxVoters
  );
}

export function questionRoundConfigToAbi(config: QuestionRoundConfig) {
  return {
    epochDuration: Number(config.epochDuration),
    maxDuration: Number(config.maxDuration),
    minVoters: Number(config.minVoters),
    maxVoters: Number(config.maxVoters),
  };
}

export function coerceQuestionRoundConfig(
  value: Partial<SerializedQuestionRoundConfig> | Partial<QuestionRoundConfig> | null | undefined,
): QuestionRoundConfig {
  if (!value) return DEFAULT_QUESTION_ROUND_CONFIG;
  const source = value as Record<string, bigint | number | string | undefined>;
  return {
    epochDuration: BigInt(source.epochDuration ?? DEFAULT_QUESTION_ROUND_CONFIG.epochDuration),
    maxDuration: BigInt(source.maxDuration ?? DEFAULT_QUESTION_ROUND_CONFIG.maxDuration),
    minVoters: BigInt(source.minVoters ?? DEFAULT_QUESTION_ROUND_CONFIG.minVoters),
    maxVoters: BigInt(source.maxVoters ?? DEFAULT_QUESTION_ROUND_CONFIG.maxVoters),
  };
}

export function getQuestionRoundMaxDurationForEpoch(
  epochDurationSeconds: number,
  configuredMaxDurationSeconds: number,
): number {
  const normalizedEpochDuration = Math.max(1, Math.floor(epochDurationSeconds));
  const normalizedMaxDuration = Math.max(0, Math.floor(configuredMaxDurationSeconds));
  const epochLimitedMaxDuration = normalizedEpochDuration * (QUESTION_ROUND_MAX_EPOCH_COUNT + 1) - 1;

  return Math.min(normalizedMaxDuration, epochLimitedMaxDuration);
}

export function isQuestionRoundMaxDurationValidForEpoch(
  epochDurationSeconds: number,
  maxDurationSeconds: number,
): boolean {
  return (
    epochDurationSeconds > 0 && Math.floor(maxDurationSeconds / epochDurationSeconds) <= QUESTION_ROUND_MAX_EPOCH_COUNT
  );
}

export function formatDurationLabel(seconds: bigint | number): string {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) return "0m";
  if (value % 86_400 === 0) return `${value / 86_400}d`;
  if (value % 3_600 === 0) return `${value / 3_600}h`;
  if (value % 60 === 0) return `${value / 60}m`;
  return `${value}s`;
}
