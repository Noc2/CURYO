import type { PublicClient } from "viem";
import { ContentRegistryAbi, ProtocolConfigAbi, RoundVotingEngineAbi } from "@curyo/contracts/abis";
import { getRevertReason } from "./revert-utils.js";

export const RoundState = {
  Open: 0,
  Settled: 1,
  Cancelled: 2,
  Tied: 3,
  RevealFailed: 4,
} as const;

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

function parseRoundVotingConfig(rawConfig: unknown): RoundVotingConfig {
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

function parseRoundData(rawRound: unknown): RoundData {
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

export async function assertContractDeployed(
  publicClient: Pick<PublicClient, "getCode">,
  address: `0x${string}`,
  contractName: string,
): Promise<void> {
  const code = await publicClient.getCode({ address });
  if (!code || code === "0x") {
    throw new Error(
      `${contractName} has no bytecode at ${address}. Check RPC_URL, CHAIN_ID, and the configured contract address.`,
    );
  }
}

export async function readRoundVotingConfig(
  publicClient: Pick<PublicClient, "readContract">,
  engineAddr: `0x${string}`,
): Promise<RoundVotingConfig> {
  try {
    const protocolConfig = (await publicClient.readContract({
      address: engineAddr,
      abi: RoundVotingEngineAbi,
      functionName: "protocolConfig",
      args: [],
    })) as `0x${string}`;

    const rawConfig = await publicClient.readContract({
      address: protocolConfig,
      abi: ProtocolConfigAbi,
      functionName: "config",
      args: [],
    });

    return parseRoundVotingConfig(rawConfig);
  } catch (err: unknown) {
    throw new Error(
      `Failed to read RoundVotingEngine protocol config at ${engineAddr}: ${getRevertReason(err)}`,
    );
  }
}

export async function validateKeeperContracts(
  publicClient: Pick<PublicClient, "getCode" | "readContract">,
  engineAddr: `0x${string}`,
  registryAddr: `0x${string}`,
): Promise<void> {
  await assertContractDeployed(publicClient, engineAddr, "RoundVotingEngine");
  await readRoundVotingConfig(publicClient, engineAddr);

  await assertContractDeployed(publicClient, registryAddr, "ContentRegistry");

  try {
    await publicClient.readContract({
      address: registryAddr,
      abi: ContentRegistryAbi,
      functionName: "nextContentId",
      args: [],
    });
  } catch (err: unknown) {
    throw new Error(
      `Failed to read ContentRegistry.nextContentId() at ${registryAddr}: ${getRevertReason(err)}`,
    );
  }
}

export async function readRound(
  publicClient: Pick<PublicClient, "readContract">,
  engineAddr: `0x${string}`,
  contentId: bigint,
  roundId: bigint,
): Promise<RoundData> {
  const rawRound = await publicClient.readContract({
    address: engineAddr,
    abi: RoundVotingEngineAbi,
    functionName: "rounds",
    args: [contentId, roundId],
  });

  return parseRoundData(rawRound);
}

export async function readRoundConfigForRound(
  publicClient: Pick<PublicClient, "readContract">,
  engineAddr: `0x${string}`,
  contentId: bigint,
  roundId: bigint,
): Promise<RoundVotingConfig> {
  const rawSnapshot = await publicClient.readContract({
    address: engineAddr,
    abi: RoundVotingEngineAbi,
    functionName: "roundConfigSnapshot",
    args: [contentId, roundId],
  });
  const snapshot = parseRoundVotingConfig(rawSnapshot);

  if (snapshot.epochDuration > 0n) {
    return snapshot;
  }

  return readRoundVotingConfig(publicClient, engineAddr);
}

export async function readCurrentRoundIds(
  publicClient: Pick<PublicClient, "readContract">,
  engineAddr: `0x${string}`,
  contentId: bigint,
): Promise<{ activeRoundId: bigint; latestRoundId: bigint }> {
  const roundId = (await publicClient.readContract({
    address: engineAddr,
    abi: RoundVotingEngineAbi,
    functionName: "currentRoundId",
    args: [contentId],
  })) as bigint;

  if (roundId === 0n) {
    return { activeRoundId: 0n, latestRoundId: 0n };
  }

  const round = await readRound(publicClient, engineAddr, contentId, roundId);
  return {
    activeRoundId: round.state === RoundState.Open ? roundId : 0n,
    latestRoundId: roundId,
  };
}

export async function readRoundRevealGracePeriod(
  publicClient: Pick<PublicClient, "readContract">,
  engineAddr: `0x${string}`,
  contentId: bigint,
  roundId: bigint,
): Promise<bigint> {
  const snapshot = (await publicClient.readContract({
    address: engineAddr,
    abi: RoundVotingEngineAbi,
    functionName: "roundRevealGracePeriodSnapshot",
    args: [contentId, roundId],
  })) as bigint;

  if (snapshot > 0n) {
    return snapshot;
  }

  const protocolConfig = (await publicClient.readContract({
    address: engineAddr,
    abi: RoundVotingEngineAbi,
    functionName: "protocolConfig",
    args: [],
  })) as `0x${string}`;

  return (await publicClient.readContract({
    address: protocolConfig,
    abi: ProtocolConfigAbi,
    functionName: "revealGracePeriod",
    args: [],
  })) as bigint;
}

const RPC_BATCH_SIZE = 50;

export async function readRoundCommitKeys(
  publicClient: Pick<PublicClient, "readContract">,
  engineAddr: `0x${string}`,
  contentId: bigint,
  roundId: bigint,
): Promise<readonly `0x${string}`[]> {
  const count = (await readRound(publicClient, engineAddr, contentId, roundId)).voteCount;

  if (count === 0n) {
    return [];
  }

  const total = Number(count);
  const results: `0x${string}`[] = [];

  for (let offset = 0; offset < total; offset += RPC_BATCH_SIZE) {
    const batchSize = Math.min(RPC_BATCH_SIZE, total - offset);
    const batch = await Promise.all(
      Array.from({ length: batchSize }, (_, i) =>
        publicClient.readContract({
          address: engineAddr,
          abi: RoundVotingEngineAbi,
          functionName: "roundCommitHashes",
          args: [contentId, roundId, BigInt(offset + i)],
        }) as Promise<`0x${string}`>,
      ),
    );
    results.push(...batch);
  }

  return results;
}
