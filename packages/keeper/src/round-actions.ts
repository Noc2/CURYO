import type { Account, Chain, PublicClient, WalletClient } from "viem";
import { RoundVotingEngineAbi } from "@curyo/contracts/abis";
import { config } from "./config.js";
import type { Logger } from "./logger.js";
import { incrementCounter } from "./metrics.js";
import { getRevertReason, isExpectedRevert } from "./revert-utils.js";
import {
  MAX_CLEANUP_BATCHES_PER_TICK,
  isCleanupEligibleRoundState,
  listQueuedCleanupRounds,
  markCleanupCompleted,
  removeQueuedCleanupRound,
} from "./cleanup-state.js";
import { readRound, readRoundCommitKeys, writeContractAndConfirm } from "./contract-io.js";
import { parseCommitData, type RoundData } from "./round-data.js";
import { decryptTlockCiphertext } from "./tlock.js";

export async function revealCommits(
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

  let commitKeys: readonly `0x${string}`[];
  try {
    commitKeys = await readRoundCommitKeys(publicClient, engineAddr, contentId, roundId);
  } catch {
    return 0;
  }

  for (const commitKey of commitKeys) {
    try {
      const rawCommit = await publicClient.readContract({
        address: engineAddr,
        abi: RoundVotingEngineAbi,
        functionName: "commits",
        args: [contentId, roundId, commitKey],
      });
      const commit = parseCommitData(rawCommit);

      if (commit.revealed) continue;
      if (now < commit.revealableAfter) continue;

      let decrypted: { isUp: boolean; salt: `0x${string}` } | null;
      try {
        decrypted = await decryptTlockCiphertext(commit.ciphertext as `0x${string}`);
      } catch (err: unknown) {
        incrementCounter("keeper_decrypt_failures_total");
        logger.warn("tlock decryption failed", {
          contentId: Number(contentId),
          roundId: Number(roundId),
          commitKey,
          error: (err as { message?: string })?.message || String(err),
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

export async function processQueuedCleanupRounds(
  publicClient: PublicClient,
  walletClient: WalletClient,
  chain: Chain,
  account: Account,
  logger: Logger,
  engineAddr: `0x${string}`,
): Promise<number> {
  let batchesProcessed = 0;

  for (const cursor of listQueuedCleanupRounds()) {
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
      removeQueuedCleanupRound(cursor.contentId, cursor.roundId);
      continue;
    }

    const cleanupResult = await processRoundCleanupBatch(
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

async function processRoundCleanupBatch(
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
    commitKeys = await readRoundCommitKeys(publicClient, engineAddr, contentId, roundId);
  } catch {
    return { batchesProcessed: 0, done: false, nextIndex: startIndex };
  }

  if (commitKeys.length === 0) {
    return { batchesProcessed: 0, done: true, nextIndex: startIndex };
  }

  const pendingIndex = await findNextPendingCleanupIndex(
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

    const nextPendingIndex = await findNextPendingCleanupIndex(
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

async function findNextPendingCleanupIndex(
  publicClient: Pick<PublicClient, "readContract">,
  engineAddr: `0x${string}`,
  contentId: bigint,
  roundId: bigint,
  commitKeys: readonly `0x${string}`[],
  startIndex: number,
): Promise<number> {
  for (let i = startIndex; i < commitKeys.length; i++) {
    const rawCommit = await publicClient.readContract({
      address: engineAddr,
      abi: RoundVotingEngineAbi,
      functionName: "commits",
      args: [contentId, roundId, commitKeys[i]],
    });
    const commit = parseCommitData(rawCommit);

    if (!commit.revealed && commit.stakeAmount > 0n) {
      return i;
    }
  }

  return -1;
}
