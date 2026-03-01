/**
 * Core keeper logic: settle rounds and sweep dormant content.
 *
 * With public voting + random settlement, the keeper no longer needs to
 * reveal votes.  Its only jobs are:
 *   1. Call `trySettle(contentId)` for every content with an active round.
 *   2. Call `cancelExpiredRound(contentId, roundId)` for rounds past maxDuration.
 *   3. Call `markDormant(contentId)` for stale content.
 */
import type { PublicClient, WalletClient, Chain, Account } from "viem";
import { BaseError, ContractFunctionRevertedError, decodeErrorResult } from "viem";
import { RoundVotingEngineAbi } from "./abis/RoundVotingEngineAbi.js";
import { ContentRegistryAbi } from "./abis/ContentRegistryAbi.js";
import { config } from "./config.js";
import type { Logger } from "./logger.js";

// --- Round states (mirrors RoundLib.RoundState enum) ---
const RoundState = {
  Open: 0,
  Settled: 1,
  Cancelled: 2,
  Tied: 3,
} as const;

// --- Types ---
export interface KeeperResult {
  roundsSettled: number;
  roundsCancelled: number;
  contentMarkedDormant: number;
}

function emptyResult(): KeeperResult {
  return {
    roundsSettled: 0,
    roundsCancelled: 0,
    contentMarkedDormant: 0,
  };
}

/** Extract the human-readable revert reason from a viem error. */
function getRevertReason(err: unknown): string {
  if (err instanceof BaseError) {
    const revertError = err.walk(e => e instanceof ContractFunctionRevertedError);
    if (revertError instanceof ContractFunctionRevertedError) {
      return revertError.data?.errorName ?? revertError.shortMessage;
    }
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
    "RoundNotOpen",
    "EpochNotEnded",
    "NotSettleable",
    "NoActiveRound",
    "AlreadyCancelled",
  ];
  const lower = msg.toLowerCase();
  return benign.some(phrase => lower.includes(phrase.toLowerCase()));
}

/**
 * Main keeper loop: iterate all content, settle rounds, sweep dormant content.
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

  // --- Read engine config (for maxDuration / cancel check) ---
  let maxDuration: bigint;
  try {
    const configResult = (await publicClient.readContract({
      address: engineAddr,
      abi: RoundVotingEngineAbi,
      functionName: "config",
      args: [],
    })) as readonly [bigint, bigint, bigint, bigint, bigint, number, number, number];
    // config() returns: [minEpochBlocks, maxEpochBlocks, maxDuration, minVoters, maxVoters, ...]
    maxDuration = configResult[2];
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

      // --- 1. TRY SETTLE: Call trySettle for content with an active round ---
      if (activeRoundId > 0n) {
        try {
          await walletClient.writeContract({
            chain,
            account,
            address: engineAddr,
            abi: RoundVotingEngineAbi,
            functionName: "trySettle",
            args: [contentId],
          });
          logger.info("Settled round", {
            contentId: Number(contentId),
            roundId: Number(activeRoundId),
          });
          result.roundsSettled++;
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

        // --- 2. CANCEL: Open rounds past maxDuration deadline ---
        // Only attempt cancel if trySettle didn't succeed (round still open)
        try {
          const round = (await publicClient.readContract({
            address: engineAddr,
            abi: RoundVotingEngineAbi,
            functionName: "getRound",
            args: [contentId, activeRoundId],
          })) as { startTime: bigint; state: number };

          if (round.state === RoundState.Open && round.startTime > 0n) {
            if (now > round.startTime + maxDuration) {
              try {
                await walletClient.writeContract({
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
        } catch {
          // Could not read round — skip cancel check
        }
      }

      // --- 3. Dormancy sweep ---
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
