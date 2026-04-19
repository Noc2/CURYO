import { DEFAULT_ROUND_CONFIG } from "@curyo/contracts/protocol";

export type BotRoundConfig = {
  epochDuration: bigint;
  maxDuration: bigint;
  minVoters: bigint;
  maxVoters: bigint;
};

export type BotRoundConfigOverrides = Partial<BotRoundConfig>;

export const DEFAULT_BOT_ROUND_CONFIG: BotRoundConfig = {
  epochDuration: BigInt(DEFAULT_ROUND_CONFIG.epochDurationSeconds),
  maxDuration: BigInt(DEFAULT_ROUND_CONFIG.maxDurationSeconds),
  minVoters: BigInt(DEFAULT_ROUND_CONFIG.minVoters),
  maxVoters: BigInt(DEFAULT_ROUND_CONFIG.maxVoters),
};

function toBigInt(value: unknown, fallback: bigint): bigint {
  if (value === undefined || value === null) {
    return fallback;
  }
  try {
    return BigInt(value as bigint | boolean | number | string);
  } catch {
    return fallback;
  }
}

export function parseRoundConfig(value: unknown, fallback: BotRoundConfig = DEFAULT_BOT_ROUND_CONFIG): BotRoundConfig {
  const source = (value ?? {}) as Record<string | number, unknown>;

  return {
    epochDuration: toBigInt(source?.epochDuration ?? source?.[0], fallback.epochDuration),
    maxDuration: toBigInt(source?.maxDuration ?? source?.[1], fallback.maxDuration),
    minVoters: toBigInt(source?.minVoters ?? source?.[2], fallback.minVoters),
    maxVoters: toBigInt(source?.maxVoters ?? source?.[3], fallback.maxVoters),
  };
}

export function applyRoundConfigOverrides(
  base: BotRoundConfig,
  overrides: BotRoundConfigOverrides,
): BotRoundConfig {
  return {
    epochDuration: overrides.epochDuration ?? base.epochDuration,
    maxDuration: overrides.maxDuration ?? base.maxDuration,
    minVoters: overrides.minVoters ?? base.minVoters,
    maxVoters: overrides.maxVoters ?? base.maxVoters,
  };
}

export function assertRoundConfigShape(config: BotRoundConfig): void {
  if (config.epochDuration <= 0n) {
    throw new Error("Submission round blind phase must be greater than zero.");
  }
  if (config.maxDuration <= 0n) {
    throw new Error("Submission round max duration must be greater than zero.");
  }
  if (config.minVoters <= 0n) {
    throw new Error("Submission round min voters must be greater than zero.");
  }
  if (config.maxVoters <= 0n) {
    throw new Error("Submission round max voters must be greater than zero.");
  }
  if (config.maxVoters < config.minVoters) {
    throw new Error("Submission round max voters must be greater than or equal to min voters.");
  }
}

export function roundConfigToAbi(config: BotRoundConfig) {
  return {
    epochDuration: Number(config.epochDuration),
    maxDuration: Number(config.maxDuration),
    minVoters: Number(config.minVoters),
    maxVoters: Number(config.maxVoters),
  };
}

export function serializeRoundConfig(config: BotRoundConfig) {
  return {
    epochDuration: config.epochDuration.toString(),
    maxDuration: config.maxDuration.toString(),
    minVoters: config.minVoters.toString(),
    maxVoters: config.maxVoters.toString(),
  };
}

export function formatDuration(seconds: bigint): string {
  if (seconds % 86_400n === 0n) return `${seconds / 86_400n}d`;
  if (seconds % 3_600n === 0n) return `${seconds / 3_600n}h`;
  if (seconds % 60n === 0n) return `${seconds / 60n}m`;
  return `${seconds}s`;
}
