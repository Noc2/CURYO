export const RoundState = {
  Open: 0,
  Settled: 1,
  Cancelled: 2,
  Tied: 3,
  RevealFailed: 4,
} as const;

export interface KeeperResult {
  roundsSettled: number;
  roundsCancelled: number;
  roundsRevealFailedFinalized: number;
  votesRevealed: number;
  cleanupBatchesProcessed: number;
  submitterStakesResolved: number;
  contentMarkedDormant: number;
}

export interface RoundVotingConfig {
  epochDuration: bigint;
  maxDuration: bigint;
  minVoters: bigint;
  maxVoters: bigint;
}

export interface CommitData {
  voter: `0x${string}`;
  stakeAmount: bigint;
  ciphertext: `0x${string}`;
  frontend: `0x${string}`;
  revealableAfter: bigint;
  revealed: boolean;
  isUp: boolean;
  epochIndex: number;
}

export interface RoundData {
  startTime: bigint;
  state: number;
  voteCount: bigint;
  revealedCount: bigint;
  settledAt: bigint;
  thresholdReachedAt: bigint;
}

function toBigInt(value: unknown, fallback = 0n): bigint {
  return typeof value === "bigint" ? value : typeof value === "number" ? BigInt(value) : fallback;
}

function toNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" ? value : typeof value === "bigint" ? Number(value) : fallback;
}

export function parseRoundVotingConfig(rawConfig: unknown): RoundVotingConfig {
  if (!rawConfig) {
    return {
      epochDuration: 0n,
      maxDuration: 0n,
      minVoters: 0n,
      maxVoters: 0n,
    };
  }

  const config = rawConfig as Record<string, unknown> & unknown[];
  if (config.epochDuration != null) {
    return {
      epochDuration: toBigInt(config.epochDuration),
      maxDuration: toBigInt(config.maxDuration),
      minVoters: toBigInt(config.minVoters),
      maxVoters: toBigInt(config.maxVoters),
    };
  }

  if (Array.isArray(config) && config.length >= 4) {
    return {
      epochDuration: toBigInt(config[0]),
      maxDuration: toBigInt(config[1]),
      minVoters: toBigInt(config[2]),
      maxVoters: toBigInt(config[3]),
    };
  }

  return {
    epochDuration: 0n,
    maxDuration: 0n,
    minVoters: 0n,
    maxVoters: 0n,
  };
}

export function parseRoundData(rawRound: unknown): RoundData {
  const round = rawRound as Record<string, unknown> & unknown[];
  if (round?.startTime != null) {
    return {
      startTime: toBigInt(round.startTime),
      state: toNumber(round.state),
      voteCount: toBigInt(round.voteCount),
      revealedCount: toBigInt(round.revealedCount),
      settledAt: toBigInt(round.settledAt),
      thresholdReachedAt: toBigInt(round.thresholdReachedAt),
    };
  }

  if (Array.isArray(round) && round.length >= 12) {
    return {
      startTime: toBigInt(round[0]),
      state: toNumber(round[1]),
      voteCount: toBigInt(round[2]),
      revealedCount: toBigInt(round[3]),
      settledAt: toBigInt(round[10]),
      thresholdReachedAt: toBigInt(round[11]),
    };
  }

  throw new Error("Unexpected round payload");
}

export function parseCommitData(rawCommit: unknown): CommitData {
  const commit = rawCommit as Record<string, unknown> & unknown[];
  if (commit?.voter != null) {
    return {
      voter: commit.voter as `0x${string}`,
      stakeAmount: toBigInt(commit.stakeAmount),
      ciphertext: commit.ciphertext as `0x${string}`,
      frontend: commit.frontend as `0x${string}`,
      revealableAfter: toBigInt(commit.revealableAfter),
      revealed: Boolean(commit.revealed),
      isUp: Boolean(commit.isUp),
      epochIndex: toNumber(commit.epochIndex),
    };
  }

  if (Array.isArray(commit) && commit.length >= 8) {
    return {
      voter: commit[0] as `0x${string}`,
      stakeAmount: toBigInt(commit[1]),
      ciphertext: commit[2] as `0x${string}`,
      frontend: commit[3] as `0x${string}`,
      revealableAfter: toBigInt(commit[4]),
      revealed: Boolean(commit[5]),
      isUp: Boolean(commit[6]),
      epochIndex: toNumber(commit[7]),
    };
  }

  throw new Error("Unexpected commit payload");
}

export function emptyResult(): KeeperResult {
  return {
    roundsSettled: 0,
    roundsCancelled: 0,
    roundsRevealFailedFinalized: 0,
    votesRevealed: 0,
    cleanupBatchesProcessed: 0,
    submitterStakesResolved: 0,
    contentMarkedDormant: 0,
  };
}
