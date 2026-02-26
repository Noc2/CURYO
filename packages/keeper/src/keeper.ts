/**
 * Core keeper logic: process all round lifecycle transitions.
 *
 * Extracted from packages/nextjs/app/api/keeper/route.ts.
 * Stateless and trustless — reads only public on-chain data + drand beacons.
 */
import type { PublicClient, WalletClient, Chain, Account } from "viem";
import { BaseError, ContractFunctionRevertedError, decodeErrorResult } from "viem";
import { RoundVotingEngineAbi } from "./abis/RoundVotingEngineAbi.js";
import { ContentRegistryAbi } from "./abis/ContentRegistryAbi.js";
import { decryptVote } from "./tlock.js";
import { config } from "./config.js";
import type { Logger } from "./logger.js";

// --- Round states (mirrors RoundVotingEngine.RoundState enum) ---
const RoundState = {
  Open: 0,
  Settled: 1,
  Cancelled: 2,
  Tied: 3,
} as const;

// --- Types ---
export interface KeeperResult {
  votesRevealed: number;
  roundsSettled: number;
  roundsCancelled: number;
  unrevealedProcessed: number;
  contentMarkedDormant: number;
}

interface CommitData {
  voter: string;
  stakeAmount: bigint;
  ciphertext: `0x${string}`;
  frontend: string;
  revealableAfter: bigint;
  revealed: boolean;
  isUp: boolean;
}

function emptyResult(): KeeperResult {
  return {
    votesRevealed: 0,
    roundsSettled: 0,
    roundsCancelled: 0,
    unrevealedProcessed: 0,
    contentMarkedDormant: 0,
  };
}

/** Extract the human-readable revert reason from a viem error. */
function getRevertReason(err: unknown): string {
  if (err instanceof BaseError) {
    // Walk the cause chain to find a ContractFunctionRevertedError
    const revertError = err.walk(e => e instanceof ContractFunctionRevertedError);
    if (revertError instanceof ContractFunctionRevertedError) {
      return revertError.data?.errorName ?? revertError.shortMessage;
    }
    // Try decoding raw revert data from the cause chain
    const cause = err.walk() as any;
    if (cause?.data && typeof cause.data === "string" && cause.data.startsWith("0x")) {
      try {
        const decoded = decodeErrorResult({
          abi: RoundVotingEngineAbi,
          data: cause.data as `0x${string}`,
        });
        return decoded.errorName;
      } catch {
        // Could not decode — fall through
      }
    }
    return err.shortMessage;
  }
  return (err as any)?.shortMessage || (err as any)?.message || String(err);
}

/** Returns true if the error message indicates an expected/benign revert. */
function isExpectedRevert(msg: string): boolean {
  const benign = [
    "already settled",
    "already revealed",
    "AlreadyRevealed",
    "round not open",
    "RoundNotOpen",
    "not in reveal phase",
    "already processed",
    "no unrevealed",
    "NoCommit",
    "EpochNotEnded",
  ];
  const lower = msg.toLowerCase();
  return benign.some(phrase => lower.toLowerCase().includes(phrase.toLowerCase()));
}

/**
 * Main keeper loop: iterate all content, process round lifecycle.
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

  // Use on-chain block.timestamp — this is what the contract uses for epoch checks.
  // Using Date.now() can cause EpochNotEnded reverts when wall-clock is ahead of block time.
  let now: bigint;
  try {
    const block = await publicClient.getBlock({ blockTag: "latest" });
    now = block.timestamp;
  } catch {
    // Fallback to wall-clock with a safety buffer if block fetch fails
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

  // --- Read engine config ---
  // config() returns individual outputs: [epochDuration, maxDuration, minVoters, maxVoters]
  let epochDuration: bigint, maxDuration: bigint, minVoters: bigint;
  try {
    const configResult = (await publicClient.readContract({
      address: engineAddr,
      abi: RoundVotingEngineAbi,
      functionName: "config",
      args: [],
    })) as readonly [bigint, bigint, bigint, bigint];
    [epochDuration, maxDuration, minVoters] = configResult;
  } catch {
    logger.error("Could not read config from RoundVotingEngine");
    return emptyResult();
  }

  // --- Process each content item ---
  for (let contentId = 1n; contentId < nextContentId; contentId++) {
    try {
      // Get the active round for this content
      let activeRoundId: bigint;
      try {
        activeRoundId = (await publicClient.readContract({
          address: engineAddr,
          abi: RoundVotingEngineAbi,
          functionName: "getActiveRoundId",
          args: [contentId],
        })) as bigint;
      } catch {
        activeRoundId = 0n;
      }

      // Check active round + lookback window
      const roundsToCheck: bigint[] = [];
      if (activeRoundId > 0n) {
        roundsToCheck.push(activeRoundId);
      }
      const startRound = activeRoundId > config.roundLookback ? activeRoundId - config.roundLookback : 1n;
      for (let roundId = startRound; roundId <= activeRoundId; roundId++) {
        if (!roundsToCheck.includes(roundId)) {
          roundsToCheck.push(roundId);
        }
      }

      for (const roundId of roundsToCheck) {
        // getRound returns a tuple struct
        let round: {
          startTime: bigint;
          state: number;
          voteCount: bigint;
          revealedCount: bigint;
          totalStake: bigint;
          upPool: bigint;
          downPool: bigint;
          upCount: bigint;
          downCount: bigint;
          upWins: boolean;
          settledAt: bigint;
          thresholdReachedAt: bigint;
        };
        try {
          round = (await publicClient.readContract({
            address: engineAddr,
            abi: RoundVotingEngineAbi,
            functionName: "getRound",
            args: [contentId, roundId],
          })) as typeof round;
        } catch {
          continue;
        }

        const { state } = round;

        // --- 1. REVEAL: Decrypt tlock ciphertexts whose epoch has ended ---
        if (state === RoundState.Open) {
          let commitCount: bigint;
          try {
            commitCount = (await publicClient.readContract({
              address: engineAddr,
              abi: RoundVotingEngineAbi,
              functionName: "getRoundCommitCount",
              args: [contentId, roundId],
            })) as bigint;
          } catch {
            commitCount = 0n;
          }

          for (let i = 0n; i < commitCount; i++) {
            let commitKey: `0x${string}`;
            try {
              commitKey = (await publicClient.readContract({
                address: engineAddr,
                abi: RoundVotingEngineAbi,
                functionName: "getRoundCommitHash",
                args: [contentId, roundId, i],
              })) as `0x${string}`;
            } catch {
              continue;
            }

            let commit: CommitData;
            try {
              commit = (await publicClient.readContract({
                address: engineAddr,
                abi: RoundVotingEngineAbi,
                functionName: "getCommit",
                args: [contentId, roundId, commitKey],
              })) as CommitData;
            } catch {
              continue;
            }

            // Skip already revealed or empty commits
            if (commit.revealed || commit.voter === "0x0000000000000000000000000000000000000000") {
              continue;
            }

            // Skip if epoch hasn't ended yet
            if (now < commit.revealableAfter) {
              continue;
            }

            // Decrypt the on-chain ciphertext using tlock/drand
            let decrypted: { isUp: boolean; salt: `0x${string}`; contentId: bigint };
            try {
              decrypted = await decryptVote(commit.ciphertext as `0x${string}`);
            } catch (err: any) {
              logger.warn("Failed to decrypt vote", {
                contentId: Number(contentId),
                roundId: Number(roundId),
                error: err.message,
              });
              continue;
            }

            // Validate: decrypted contentId must match the round's contentId
            if (decrypted.contentId !== contentId) {
              logger.warn("Decrypted contentId mismatch — skipping reveal", {
                expected: Number(contentId),
                got: Number(decrypted.contentId),
                roundId: Number(roundId),
                voter: commit.voter,
              });
              continue;
            }

            // Submit the reveal on-chain
            try {
              await walletClient.writeContract({
                chain,
                account,
                address: engineAddr,
                abi: RoundVotingEngineAbi,
                functionName: "revealVoteByCommitKey",
                args: [contentId, roundId, commitKey, decrypted.isUp, decrypted.salt],
              });
              result.votesRevealed++;
              logger.info("Revealed vote", {
                voter: commit.voter,
                contentId: Number(contentId),
                roundId: Number(roundId),
              });
            } catch (err: unknown) {
              const reason = getRevertReason(err);
              if (isExpectedRevert(reason)) {
                logger.debug("Reveal skipped (already done)", {
                  contentId: Number(contentId),
                  roundId: Number(roundId),
                });
              } else {
                logger.warn("Failed to reveal vote", {
                  error: reason,
                  contentId: Number(contentId),
                  roundId: Number(roundId),
                  voter: commit.voter,
                  revealableAfter: Number(commit.revealableAfter),
                  blockTimestamp: Number(now),
                  isUp: decrypted.isUp,
                });
              }
            }
          }
        }

        // --- 2. SETTLE: If enough votes have been revealed ---
        let currentRevealedCount = round.revealedCount;
        if (result.votesRevealed > 0) {
          try {
            const freshRound = (await publicClient.readContract({
              address: engineAddr,
              abi: RoundVotingEngineAbi,
              functionName: "getRound",
              args: [contentId, roundId],
            })) as typeof round;
            currentRevealedCount = freshRound.revealedCount;
          } catch {
            // Fall back to stale count
          }
        }
        if (state === RoundState.Open && currentRevealedCount >= minVoters) {
          try {
            await walletClient.writeContract({
              chain,
              account,
              address: engineAddr,
              abi: RoundVotingEngineAbi,
              functionName: "settleRound",
              args: [contentId, roundId],
            });
            logger.info("Settled round", {
              contentId: Number(contentId),
              roundId: Number(roundId),
            });
            result.roundsSettled++;
            continue;
          } catch (err: unknown) {
            const reason = getRevertReason(err);
            if (!isExpectedRevert(reason)) {
              logger.warn("Failed to settle round", {
                contentId: Number(contentId),
                roundId: Number(roundId),
                error: reason,
              });
            }
          }
        }

        // --- 3. PROCESS: Forfeit/refund unrevealed votes after settlement ---
        if (state === RoundState.Settled || state === RoundState.Tied) {
          let commitCount: bigint;
          try {
            commitCount = (await publicClient.readContract({
              address: engineAddr,
              abi: RoundVotingEngineAbi,
              functionName: "getRoundCommitCount",
              args: [contentId, roundId],
            })) as bigint;
          } catch {
            commitCount = 0n;
          }

          if (commitCount > 0n) {
            let hasUnrevealed = false;
            for (let i = 0n; i < commitCount; i++) {
              try {
                const commitKey = (await publicClient.readContract({
                  address: engineAddr,
                  abi: RoundVotingEngineAbi,
                  functionName: "getRoundCommitHash",
                  args: [contentId, roundId, i],
                })) as `0x${string}`;
                const commit = (await publicClient.readContract({
                  address: engineAddr,
                  abi: RoundVotingEngineAbi,
                  functionName: "getCommit",
                  args: [contentId, roundId, commitKey],
                })) as CommitData;
                if (!commit.revealed && commit.stakeAmount > 0n) {
                  hasUnrevealed = true;
                  break;
                }
              } catch {
                continue;
              }
            }

            if (hasUnrevealed) {
              try {
                await walletClient.writeContract({
                  chain,
                  account,
                  address: engineAddr,
                  abi: RoundVotingEngineAbi,
                  functionName: "processUnrevealedVotes",
                  args: [contentId, roundId, 0n, config.unrevealedBatchSize],
                });
                logger.info("Processed unrevealed votes", {
                  contentId: Number(contentId),
                  roundId: Number(roundId),
                });
                result.unrevealedProcessed++;
              } catch (err: unknown) {
                const reason = getRevertReason(err);
                if (!isExpectedRevert(reason)) {
                  logger.warn("Could not process unrevealed votes", {
                    contentId: Number(contentId),
                    roundId: Number(roundId),
                    error: reason,
                  });
                }
              }
            }
          }
        }

        // --- 4. CANCEL: Open rounds past maxDuration deadline ---
        if (state === RoundState.Open && round.startTime > 0n) {
          if (now > round.startTime + maxDuration) {
            try {
              await walletClient.writeContract({
                chain,
                account,
                address: engineAddr,
                abi: RoundVotingEngineAbi,
                functionName: "cancelExpiredRound",
                args: [contentId, roundId],
              });
              logger.info("Cancelled expired round", {
                contentId: Number(contentId),
                roundId: Number(roundId),
              });
              result.roundsCancelled++;
            } catch (err: unknown) {
              const reason = getRevertReason(err);
              if (!isExpectedRevert(reason)) {
                logger.warn("Failed to cancel expired round", {
                  contentId: Number(contentId),
                  roundId: Number(roundId),
                  error: reason,
                });
              }
            }
          }
        }
      }

      // --- 5. Dormancy sweep ---
      try {
        const content = (await publicClient.readContract({
          address: registryAddr,
          abi: ContentRegistryAbi,
          functionName: "getContent",
          args: [contentId],
        })) as { status: number; lastActivityAt: bigint };

        // Only process Active content (status === 0)
        if (content.status === 0 && now > content.lastActivityAt + config.dormancyPeriod) {
          await walletClient.writeContract({
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

  return result;
}
