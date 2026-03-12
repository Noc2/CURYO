/**
 * Core keeper logic: reveal tlock votes, advance round terminal states, clean up
 * unrevealed commits, and sweep dormant content.
 *
 * With tlock commit-reveal voting, the keeper has five jobs:
 *   1. Reveal committed votes after each epoch ends (using drand beacon decryption).
 *   2. Call `settleRound(contentId, roundId)` when ≥minVoters are revealed.
 *   3. Call `finalizeRevealFailedRound(contentId, roundId)` once the last reveal grace
 *      deadline has passed without reveal quorum.
 *   4. Call `processUnrevealedVotes(contentId, roundId, startIndex, count)` for
 *      terminal rounds that still have unrevealed stake to sweep/refund.
 *   5. Call `cancelExpiredRound(contentId, roundId)` for rounds past maxDuration that
 *      never reached commit quorum, and `markDormant(contentId)` for stale content.
 *
 * Vote ciphertext is tlock-encrypted to a future drand round. After the epoch ends,
 * the drand beacon makes the decryption key available and the keeper can decrypt.
 */
import type { PublicClient, WalletClient, Chain, Account } from "viem";
import { timelockDecrypt, mainnetClient } from "tlock-js";
import { ContentRegistryAbi, RoundVotingEngineAbi } from "@curyo/contracts/abis";
import { config } from "./config.js";
import type { Logger } from "./logger.js";
import { incrementCounter } from "./metrics.js";
import { getRevertReason, isExpectedRevert } from "./revert-utils.js";

const tlockClient = mainnetClient();

// --- Round states (mirrors RoundLib.RoundState enum) ---
const RoundState = {
  Open: 0,
  Settled: 1,
  Cancelled: 2,
  Tied: 3,
  RevealFailed: 4,
} as const;

// --- Types ---
export interface KeeperResult {
  roundsSettled: number;
  roundsCancelled: number;
  roundsRevealFailedFinalized: number;
  votesRevealed: number;
  cleanupBatchesProcessed: number;
  contentMarkedDormant: number;
}

export interface RoundVotingConfig {
  epochDuration: bigint;
  maxDuration: bigint;
  minVoters: bigint;
  maxVoters: bigint;
}

interface CommitData {
  voter: `0x${string}`;
  stakeAmount: bigint;
  ciphertext: `0x${string}`;
  frontend: `0x${string}`;
  revealableAfter: bigint;
  revealed: boolean;
  isUp: boolean;
  epochIndex: number;
}

interface RoundData {
  startTime: bigint;
  state: number;
  voteCount: bigint;
  revealedCount: bigint;
  settledAt: bigint;
  thresholdReachedAt: bigint;
}

interface CleanupCursor {
  contentId: bigint;
  roundId: bigint;
  nextIndex: number;
}

const MAX_CLEANUP_BATCHES_PER_TICK = 4;
const cleanupQueue = new Map<string, CleanupCursor>();
const cleanupCompletedRounds = new Set<string>();
const cleanupDiscoveryRoundByContent = new Map<bigint, bigint>();

function emptyResult(): KeeperResult {
  return {
    roundsSettled: 0,
    roundsCancelled: 0,
    roundsRevealFailedFinalized: 0,
    votesRevealed: 0,
    cleanupBatchesProcessed: 0,
    contentMarkedDormant: 0,
  };
}

export { getRevertReason, isExpectedRevert } from "./revert-utils.js";

export function resetKeeperStateForTests(): void {
  cleanupQueue.clear();
  cleanupCompletedRounds.clear();
  cleanupDiscoveryRoundByContent.clear();
}

function cleanupRoundKey(contentId: bigint, roundId: bigint): string {
  return `${contentId}:${roundId}`;
}

function isCleanupEligibleRoundState(state: number): boolean {
  return state === RoundState.Settled || state === RoundState.Tied || state === RoundState.RevealFailed;
}

function enqueueRoundForCleanup(contentId: bigint, roundId: bigint, startIndex = 0): void {
  const key = cleanupRoundKey(contentId, roundId);
  if (cleanupCompletedRounds.has(key)) return;

  const existing = cleanupQueue.get(key);
  if (existing) {
    existing.nextIndex = Math.min(existing.nextIndex, startIndex);
    return;
  }

  cleanupQueue.set(key, { contentId, roundId, nextIndex: startIndex });
}

function markCleanupCompleted(contentId: bigint, roundId: bigint): void {
  const key = cleanupRoundKey(contentId, roundId);
  cleanupQueue.delete(key);
  cleanupCompletedRounds.add(key);
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
    const [epochDuration, maxDuration, minVoters, maxVoters] = (await publicClient.readContract({
      address: engineAddr,
      abi: RoundVotingEngineAbi,
      functionName: "config",
      args: [],
    })) as readonly [bigint, bigint, bigint, bigint];

    return { epochDuration, maxDuration, minVoters, maxVoters };
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

async function readRound(
  publicClient: Pick<PublicClient, "readContract">,
  engineAddr: `0x${string}`,
  contentId: bigint,
  roundId: bigint,
): Promise<RoundData> {
  return (await publicClient.readContract({
    address: engineAddr,
    abi: RoundVotingEngineAbi,
    functionName: "getRound",
    args: [contentId, roundId],
  })) as RoundData;
}

async function readRoundConfigForRound(
  publicClient: Pick<PublicClient, "readContract">,
  engineAddr: `0x${string}`,
  contentId: bigint,
  roundId: bigint,
): Promise<RoundVotingConfig> {
  return (await publicClient.readContract({
    address: engineAddr,
    abi: RoundVotingEngineAbi,
    functionName: "getRoundConfig",
    args: [contentId, roundId],
  })) as RoundVotingConfig;
}

async function readRoundRevealGracePeriod(
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

async function discoverCleanupCandidate(
  publicClient: Pick<PublicClient, "readContract">,
  engineAddr: `0x${string}`,
  contentId: bigint,
  latestRoundId: bigint,
): Promise<void> {
  if (latestRoundId == 0n) {
    cleanupDiscoveryRoundByContent.delete(contentId);
    return;
  }

  let roundId = cleanupDiscoveryRoundByContent.get(contentId) ?? 1n;
  if (roundId > latestRoundId) {
    roundId = 1n;
  }

  cleanupDiscoveryRoundByContent.set(contentId, roundId >= latestRoundId ? 1n : roundId + 1n);

  const key = cleanupRoundKey(contentId, roundId);
  if (cleanupCompletedRounds.has(key) || cleanupQueue.has(key)) {
    return;
  }

  const round = await readRound(publicClient, engineAddr, contentId, roundId);
  if (isCleanupEligibleRoundState(round.state)) {
    enqueueRoundForCleanup(contentId, roundId);
  }
}

/**
 * Decrypt a tlock-encrypted ciphertext using the drand beacon.
 * Ciphertext on-chain is hex-encoded UTF-8 armored AGE string.
 * Plaintext is 33 bytes: [uint8 isUp (0|1), bytes32 salt].
 */
export async function decryptTlockCiphertext(
  ciphertext: `0x${string}`,
): Promise<{ isUp: boolean; salt: `0x${string}` } | null> {
  const hex = ciphertext.startsWith("0x") ? ciphertext.slice(2) : ciphertext;
  // Convert hex bytes back to UTF-8 armored string
  const armored = Buffer.from(hex, "hex").toString("utf-8");

  const plaintext = await timelockDecrypt(armored, tlockClient);
  if (plaintext.length !== 33) return null;

  const isUp = plaintext[0] === 1;
  const salt = `0x${plaintext.subarray(1, 33).toString("hex")}` as `0x${string}`;
  return { isUp, salt };
}

/**
 * Main keeper loop: iterate all content, reveal votes, progress rounds, clean terminal
 * round leftovers, and sweep dormant content.
 */
export async function resolveRounds(
  publicClient: PublicClient,
  walletClient: WalletClient,
  chain: Chain,
  account: Account,
  logger: Logger,
): Promise<KeeperResult> {
  const engineAddr = config.contracts.votingEngine;
  const registryAddr = config.contracts.contentRegistry;

  // Use on-chain block.timestamp — this is what the contract uses for checks.
  let now: bigint;
  try {
    const block = await publicClient.getBlock({ blockTag: "latest" });
    now = block.timestamp;
  } catch {
    now = BigInt(Math.floor(Date.now() / 1000)) - 30n;
  }

  const result: KeeperResult = emptyResult();

  // --- Get total content count ---
  let nextContentId: bigint;
  try {
    nextContentId = (await publicClient.readContract({
      address: registryAddr,
      abi: ContentRegistryAbi,
      functionName: "nextContentId",
      args: [],
    })) as bigint;
  } catch {
    logger.error("Could not connect to chain");
    return emptyResult();
  }

  // --- Process each content item ---
  for (let contentId = 1n; contentId < nextContentId; contentId++) {
    try {
      // Get the current round IDs for this content.
      let activeRoundId: bigint;
      let latestRoundId: bigint;
      try {
        [activeRoundId, latestRoundId] = (await Promise.all([
          publicClient.readContract({
            address: engineAddr,
            abi: RoundVotingEngineAbi,
            functionName: "getActiveRoundId",
            args: [contentId],
          }) as Promise<bigint>,
          publicClient.readContract({
            address: engineAddr,
            abi: RoundVotingEngineAbi,
            functionName: "nextRoundId",
            args: [contentId],
          }) as Promise<bigint>,
        ])) as [bigint, bigint];
      } catch {
        activeRoundId = 0n;
        latestRoundId = 0n;
      }

      if (activeRoundId > 0n) {
        // --- 1. REVEAL LOOP: Decrypt and reveal unrevealed commits ---
        const revealedCount = await _revealCommits(
          publicClient,
          walletClient,
          chain,
          account,
          logger,
          engineAddr,
          contentId,
          activeRoundId,
          now,
        );
        result.votesRevealed += revealedCount;

        // Re-read round after reveals to get updated state
        let round: RoundData;
        let roundConfig: RoundVotingConfig;
        try {
          [round, roundConfig] = await Promise.all([
            readRound(publicClient, engineAddr, contentId, activeRoundId),
            readRoundConfigForRound(publicClient, engineAddr, contentId, activeRoundId),
          ]);
        } catch {
          continue;
        }

        // --- 2. SETTLE: If threshold reached (enough votes revealed) ---
        if (round.state === RoundState.Open && round.revealedCount >= roundConfig.minVoters) {
          try {
            await writeContractAndConfirm(publicClient, walletClient, {
              chain,
              account,
              address: engineAddr,
              abi: RoundVotingEngineAbi,
              functionName: "settleRound",
              args: [contentId, activeRoundId],
            });
            logger.info("Settled round", {
              contentId: Number(contentId),
              roundId: Number(activeRoundId),
            });
            result.roundsSettled++;
            enqueueRoundForCleanup(contentId, activeRoundId);
          } catch (err: unknown) {
            const reason = getRevertReason(err);
            if (!isExpectedRevert(reason)) {
              logger.warn("Failed to settle round", {
                contentId: Number(contentId),
                roundId: Number(activeRoundId),
                error: reason,
              });
            }
          }
        }

        // --- 3. REVEAL FAILED: commit quorum reached, reveal quorum never did ---
        if (
          round.state === RoundState.Open &&
          round.voteCount >= roundConfig.minVoters &&
          round.revealedCount < roundConfig.minVoters
        ) {
          try {
            const [lastCommitRevealableAfter, revealGracePeriod] = await Promise.all([
              publicClient.readContract({
                address: engineAddr,
                abi: RoundVotingEngineAbi,
                functionName: "lastCommitRevealableAfter",
                args: [contentId, activeRoundId],
              }) as Promise<bigint>,
              readRoundRevealGracePeriod(publicClient, engineAddr, contentId, activeRoundId),
            ]);

            const revealFailedEligibleAt =
              lastCommitRevealableAfter > round.startTime + roundConfig.maxDuration
                ? lastCommitRevealableAfter + revealGracePeriod
                : round.startTime + roundConfig.maxDuration + revealGracePeriod;

            if (lastCommitRevealableAfter > 0n && now >= revealFailedEligibleAt) {
              await writeContractAndConfirm(publicClient, walletClient, {
                chain,
                account,
                address: engineAddr,
                abi: RoundVotingEngineAbi,
                functionName: "finalizeRevealFailedRound",
                args: [contentId, activeRoundId],
              });
              logger.info("Finalized reveal-failed round", {
                contentId: Number(contentId),
                roundId: Number(activeRoundId),
              });
              result.roundsRevealFailedFinalized++;
              enqueueRoundForCleanup(contentId, activeRoundId);
            }
          } catch (err: unknown) {
            const reason = getRevertReason(err);
            if (!isExpectedRevert(reason)) {
              logger.warn("Failed to finalize reveal-failed round", {
                contentId: Number(contentId),
                roundId: Number(activeRoundId),
                error: reason,
              });
            }
          }
        }

        // --- 4. CANCEL: Open rounds past maxDuration deadline without commit quorum ---
        if (
          round.state === RoundState.Open &&
          round.voteCount < roundConfig.minVoters &&
          round.startTime > 0n &&
          now >= round.startTime + roundConfig.maxDuration
        ) {
          try {
            await writeContractAndConfirm(publicClient, walletClient, {
              chain,
              account,
              address: engineAddr,
              abi: RoundVotingEngineAbi,
              functionName: "cancelExpiredRound",
              args: [contentId, activeRoundId],
            });
            logger.info("Cancelled expired round", {
              contentId: Number(contentId),
              roundId: Number(activeRoundId),
            });
            result.roundsCancelled++;
          } catch (err: unknown) {
            const reason = getRevertReason(err);
            if (!isExpectedRevert(reason)) {
              logger.warn("Failed to cancel expired round", {
                contentId: Number(contentId),
                roundId: Number(activeRoundId),
                error: reason,
              });
            }
          }
        }
      }

      // --- 5. CLEANUP DISCOVERY: inspect at most one historical round per content ---
      try {
        await discoverCleanupCandidate(publicClient, engineAddr, contentId, latestRoundId);
      } catch (err: unknown) {
        logger.debug("Could not discover cleanup candidate", {
          contentId: Number(contentId),
          error: getRevertReason(err),
        });
      }

      // --- 6. Dormancy sweep ---
      try {
        const dormancyEligible = (await publicClient.readContract({
          address: registryAddr,
          abi: ContentRegistryAbi,
          functionName: "isDormancyEligible",
          args: [contentId],
        })) as boolean;

        if (dormancyEligible) {
          await writeContractAndConfirm(publicClient, walletClient, {
            chain,
            account,
            address: registryAddr,
            abi: ContentRegistryAbi,
            functionName: "markDormant",
            args: [contentId],
          });
          logger.info("Marked content as dormant", { contentId: Number(contentId) });
          result.contentMarkedDormant++;
        }
      } catch (err: unknown) {
        const reason = getRevertReason(err);
        if (!reason.includes("pending votes")) {
          logger.debug("Could not check dormancy", {
            contentId: Number(contentId),
            error: reason,
          });
        }
      }
    } catch (err: unknown) {
      logger.error("Error processing content", {
        contentId: Number(contentId),
        error: getRevertReason(err),
      });
    }
  }

  result.cleanupBatchesProcessed += await _processQueuedCleanupRounds(
    publicClient,
    walletClient,
    chain,
    account,
    logger,
    engineAddr,
  );

  return result;
}

async function writeContractAndConfirm(
  publicClient: Pick<PublicClient, "waitForTransactionReceipt">,
  walletClient: WalletClient,
  request: Parameters<WalletClient["writeContract"]>[0],
): Promise<`0x${string}`> {
  const hash = await walletClient.writeContract(request);

  const waitForReceipt = (publicClient as { waitForTransactionReceipt?: (args: { hash: `0x${string}` }) => Promise<unknown> })
    .waitForTransactionReceipt;
  if (waitForReceipt) {
    await waitForReceipt.call(publicClient, { hash });
  }

  return hash;
}

/**
 * Reveal all unrevealed commits for a round whose epoch has ended.
 * Returns the number of votes revealed in this call.
 */
async function _revealCommits(
  publicClient: PublicClient,
  walletClient: WalletClient,
  chain: Chain,
  account: Account,
  logger: Logger,
  engineAddr: `0x${string}`,
  contentId: bigint,
  roundId: bigint,
  now: bigint,
): Promise<number> {
  let revealed = 0;

  // Get all commit keys for this round
  let commitKeys: readonly `0x${string}`[];
  try {
    commitKeys = (await publicClient.readContract({
      address: engineAddr,
      abi: RoundVotingEngineAbi,
      functionName: "getRoundCommitHashes",
      args: [contentId, roundId],
    })) as readonly `0x${string}`[];
  } catch {
    return 0;
  }

  for (const commitKey of commitKeys) {
    try {
      // Read commit data
      const commit = (await publicClient.readContract({
        address: engineAddr,
        abi: RoundVotingEngineAbi,
        functionName: "getCommit",
        args: [contentId, roundId, commitKey],
      })) as CommitData;

      // Skip if already revealed or epoch not ended
      if (commit.revealed) continue;
      if (now < commit.revealableAfter) continue;

      // Decrypt the tlock ciphertext using the drand beacon
      let decrypted: { isUp: boolean; salt: `0x${string}` } | null;
      try {
        decrypted = await decryptTlockCiphertext(commit.ciphertext as `0x${string}`);
      } catch (err: unknown) {
        // Beacon not yet available — retry on next tick
        incrementCounter("keeper_decrypt_failures_total");
        logger.warn("tlock decryption failed", {
          contentId: Number(contentId),
          roundId: Number(roundId),
          commitKey,
          error: (err as any)?.message || String(err),
        });
        continue;
      }

      if (!decrypted) {
        incrementCounter("keeper_decrypt_failures_total");
        logger.warn("Failed to decode tlock ciphertext", {
          contentId: Number(contentId),
          roundId: Number(roundId),
          commitKey,
        });
        continue;
      }

      // Submit reveal to chain
      try {
        await writeContractAndConfirm(publicClient, walletClient, {
          chain,
          account,
          address: engineAddr,
          abi: RoundVotingEngineAbi,
          functionName: "revealVoteByCommitKey",
          args: [contentId, roundId, commitKey, decrypted.isUp, decrypted.salt],
        });
        logger.info("Revealed vote", {
          contentId: Number(contentId),
          roundId: Number(roundId),
          voter: commit.voter,
        });
        revealed++;
      } catch (err: unknown) {
        const reason = getRevertReason(err);
        if (!isExpectedRevert(reason)) {
          logger.warn("Failed to reveal vote", {
            contentId: Number(contentId),
            roundId: Number(roundId),
            commitKey,
            error: reason,
          });
        }
      }
    } catch (err: unknown) {
      logger.debug("Error processing commit", {
        contentId: Number(contentId),
        roundId: Number(roundId),
        commitKey,
        error: getRevertReason(err),
      });
    }
  }

  return revealed;
}

async function _processQueuedCleanupRounds(
  publicClient: PublicClient,
  walletClient: WalletClient,
  chain: Chain,
  account: Account,
  logger: Logger,
  engineAddr: `0x${string}`,
): Promise<number> {
  let batchesProcessed = 0;

  for (const cursor of Array.from(cleanupQueue.values())) {
    if (batchesProcessed >= MAX_CLEANUP_BATCHES_PER_TICK) {
      break;
    }

    let round: RoundData;
    try {
      round = await readRound(publicClient, engineAddr, cursor.contentId, cursor.roundId);
    } catch (err: unknown) {
      logger.debug("Could not refresh cleanup round", {
        contentId: Number(cursor.contentId),
        roundId: Number(cursor.roundId),
        error: getRevertReason(err),
      });
      continue;
    }

    if (!isCleanupEligibleRoundState(round.state)) {
      cleanupQueue.delete(cleanupRoundKey(cursor.contentId, cursor.roundId));
      continue;
    }

    const cleanupResult = await _processRoundCleanupBatch(
      publicClient,
      walletClient,
      chain,
      account,
      logger,
      engineAddr,
      cursor.contentId,
      cursor.roundId,
      cursor.nextIndex,
    );

    batchesProcessed += cleanupResult.batchesProcessed;

    if (cleanupResult.done) {
      markCleanupCompleted(cursor.contentId, cursor.roundId);
    } else {
      cursor.nextIndex = cleanupResult.nextIndex;
    }
  }

  return batchesProcessed;
}

async function _processRoundCleanupBatch(
  publicClient: PublicClient,
  walletClient: WalletClient,
  chain: Chain,
  account: Account,
  logger: Logger,
  engineAddr: `0x${string}`,
  contentId: bigint,
  roundId: bigint,
  startIndex: number,
): Promise<{ batchesProcessed: number; done: boolean; nextIndex: number }> {
  let commitKeys: readonly `0x${string}`[];
  try {
    commitKeys = (await publicClient.readContract({
      address: engineAddr,
      abi: RoundVotingEngineAbi,
      functionName: "getRoundCommitHashes",
      args: [contentId, roundId],
    })) as readonly `0x${string}`[];
  } catch {
    return { batchesProcessed: 0, done: false, nextIndex: startIndex };
  }

  if (commitKeys.length === 0) {
    return { batchesProcessed: 0, done: true, nextIndex: startIndex };
  }

  const pendingIndex = await _findNextPendingCleanupIndex(
    publicClient,
    engineAddr,
    contentId,
    roundId,
    commitKeys,
    startIndex,
  );
  if (pendingIndex < 0) {
    return { batchesProcessed: 0, done: true, nextIndex: startIndex };
  }

  try {
    await writeContractAndConfirm(publicClient, walletClient, {
      chain,
      account,
      address: engineAddr,
      abi: RoundVotingEngineAbi,
      functionName: "processUnrevealedVotes",
      args: [contentId, roundId, BigInt(pendingIndex), BigInt(config.cleanupBatchSize)],
    });
    logger.info("Processed unrevealed vote cleanup", {
      contentId: Number(contentId),
      roundId: Number(roundId),
      startIndex: pendingIndex,
      batchSize: config.cleanupBatchSize,
    });
    return {
      batchesProcessed: 1,
      done: pendingIndex + config.cleanupBatchSize >= commitKeys.length,
      nextIndex: pendingIndex + config.cleanupBatchSize,
    };
  } catch (err: unknown) {
    const reason = getRevertReason(err);
    if (!isExpectedRevert(reason)) {
      logger.warn("Failed to process unrevealed votes", {
        contentId: Number(contentId),
        roundId: Number(roundId),
        startIndex: pendingIndex,
        batchSize: config.cleanupBatchSize,
        error: reason,
      });
      return { batchesProcessed: 0, done: false, nextIndex: pendingIndex };
    }

    const nextPendingIndex = await _findNextPendingCleanupIndex(
      publicClient,
      engineAddr,
      contentId,
      roundId,
      commitKeys,
      pendingIndex,
    );
    return {
      batchesProcessed: 0,
      done: nextPendingIndex < 0,
      nextIndex: nextPendingIndex < 0 ? pendingIndex : nextPendingIndex,
    };
  }
}

async function _findNextPendingCleanupIndex(
  publicClient: Pick<PublicClient, "readContract">,
  engineAddr: `0x${string}`,
  contentId: bigint,
  roundId: bigint,
  commitKeys: readonly `0x${string}`[],
  startIndex: number,
): Promise<number> {
  for (let i = startIndex; i < commitKeys.length; i++) {
    const commit = (await publicClient.readContract({
      address: engineAddr,
      abi: RoundVotingEngineAbi,
      functionName: "getCommit",
      args: [contentId, roundId, commitKeys[i]],
    })) as CommitData;

    if (!commit.revealed && commit.stakeAmount > 0n) {
      return i;
    }
  }

  return -1;
}
