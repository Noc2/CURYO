import type { PublicClient, WalletClient } from "viem";
import { ContentRegistryAbi, RoundVotingEngineAbi } from "@curyo/contracts/abis";
import { config } from "./config.js";
import {
  advanceCleanupDiscoveryRound,
  enqueueRoundForCleanup,
  hasQueuedOrCompletedCleanup,
  isCleanupEligibleRoundState,
} from "./cleanup-state.js";
import {
  parseRoundVotingConfig,
  parseRoundData,
  RoundState,
  type RoundData,
  type RoundVotingConfig,
} from "./round-data.js";
import { getRevertReason } from "./revert-utils.js";

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
    const rawConfig = await publicClient.readContract({
      address: engineAddr,
      abi: RoundVotingEngineAbi,
      functionName: "config",
      args: [],
    });

    return parseRoundVotingConfig(rawConfig);
  } catch (err: unknown) {
    throw new Error(
      `Failed to read RoundVotingEngine.config() at ${engineAddr}: ${getRevertReason(err)}`,
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

  return (await publicClient.readContract({
    address: engineAddr,
    abi: RoundVotingEngineAbi,
    functionName: "revealGracePeriod",
    args: [],
  })) as bigint;
}

export async function readRoundCommitKeys(
  publicClient: Pick<PublicClient, "readContract">,
  engineAddr: `0x${string}`,
  contentId: bigint,
  roundId: bigint,
): Promise<readonly `0x${string}`[]> {
  const count = (await publicClient.readContract({
    address: engineAddr,
    abi: RoundVotingEngineAbi,
    functionName: "getRoundCommitCount",
    args: [contentId, roundId],
  })) as bigint;

  if (count === 0n) {
    return [];
  }

  return (await Promise.all(
    Array.from({ length: Number(count) }, (_, index) =>
      publicClient.readContract({
        address: engineAddr,
        abi: RoundVotingEngineAbi,
        functionName: "roundCommitHashes",
        args: [contentId, roundId, BigInt(index)],
      }) as Promise<`0x${string}`>,
    ),
  )) as readonly `0x${string}`[];
}

export async function discoverCleanupCandidate(
  publicClient: Pick<PublicClient, "readContract">,
  engineAddr: `0x${string}`,
  contentId: bigint,
  latestRoundId: bigint,
): Promise<void> {
  const roundId = advanceCleanupDiscoveryRound(contentId, latestRoundId);
  if (roundId == null) return;
  if (hasQueuedOrCompletedCleanup(contentId, roundId)) return;

  const round = await readRound(publicClient, engineAddr, contentId, roundId);
  if (isCleanupEligibleRoundState(round.state)) {
    enqueueRoundForCleanup(contentId, roundId);
  }
}

export async function writeContractAndConfirm(
  publicClient: Pick<PublicClient, "waitForTransactionReceipt">,
  walletClient: WalletClient,
  request: Parameters<WalletClient["writeContract"]>[0],
): Promise<`0x${string}`> {
  if (!request.gas && config.maxGasPerTx > 0) {
    request.gas = BigInt(config.maxGasPerTx);
  }

  const hash = await walletClient.writeContract(request);

  const waitForReceipt = (publicClient as {
    waitForTransactionReceipt?: (args: { hash: `0x${string}` }) => Promise<unknown>;
  }).waitForTransactionReceipt;
  if (waitForReceipt) {
    await waitForReceipt.call(publicClient, { hash });
  }

  return hash;
}
