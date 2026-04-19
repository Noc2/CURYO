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

export const DEFAULT_QUESTION_ROUND_CONFIG: QuestionRoundConfig = {
  epochDuration: BigInt(DEFAULT_ROUND_CONFIG.epochDurationSeconds),
  maxDuration: BigInt(DEFAULT_ROUND_CONFIG.maxDurationSeconds),
  minVoters: BigInt(DEFAULT_ROUND_CONFIG.minVoters),
  maxVoters: BigInt(DEFAULT_ROUND_CONFIG.maxVoters),
};

export const DEFAULT_QUESTION_ROUND_CONFIG_BOUNDS = {
  minEpochDuration: 5 * 60,
  maxEpochDuration: 60 * 60,
  minRoundDuration: 60 * 60,
  maxRoundDuration: 30 * 24 * 60 * 60,
  minSettlementVoters: 2,
  maxSettlementVoters: 100,
  minVoterCap: 2,
  maxVoterCap: 10_000,
} as const;

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

export function formatDurationLabel(seconds: bigint | number): string {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) return "0m";
  if (value % 86_400 === 0) return `${value / 86_400}d`;
  if (value % 3_600 === 0) return `${value / 3_600}h`;
  if (value % 60 === 0) return `${value / 60}m`;
  return `${value}s`;
}
