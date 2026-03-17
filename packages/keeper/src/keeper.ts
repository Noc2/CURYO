import type { PublicClient, WalletClient, Chain, Account } from "viem";
import { ContentRegistryAbi, RoundVotingEngineAbi } from "@curyo/contracts/abis";
import { config } from "./config.js";
import type { Logger } from "./logger.js";
import { getRevertReason, isExpectedRevert } from "./revert-utils.js";
import { enqueueRoundForCleanup } from "./cleanup-state.js";
import {
  discoverCleanupCandidate,
  readCurrentRoundIds,
  readRound,
  readRoundConfigForRound,
  readRoundRevealGracePeriod,
  writeContractAndConfirm,
} from "./contract-io.js";
import {
  emptyResult,
  RoundState,
  type KeeperResult,
  type RoundData,
  type RoundVotingConfig,
} from "./round-data.js";
import { processQueuedCleanupRounds, revealCommits } from "./round-actions.js";

export { getRevertReason, isExpectedRevert } from "./revert-utils.js";
export { resetKeeperStateForTests } from "./cleanup-state.js";
export { assertContractDeployed, readRoundVotingConfig, validateKeeperContracts } from "./contract-io.js";
export { decryptTlockCiphertext } from "./tlock.js";
export type { KeeperResult, RoundData, RoundVotingConfig } from "./round-data.js";

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
    console.warn("[Keeper] RPC block fetch failed, using local clock fallback");
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
        ({ activeRoundId, latestRoundId } = await readCurrentRoundIds(publicClient, engineAddr, contentId));
      } catch {
        activeRoundId = 0n;
        latestRoundId = 0n;
      }

      if (activeRoundId > 0n) {
        // --- 1. REVEAL LOOP: Decrypt and reveal unrevealed commits ---
        const revealedCount = await revealCommits(
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

      // --- 6. Resolve submitter stakes once their policy window opens ---
      try {
        const submitterStakeResolvable = (await publicClient.readContract({
          address: engineAddr,
          abi: RoundVotingEngineAbi,
          functionName: "isSubmitterStakeResolvable",
          args: [contentId],
        })) as boolean;

        if (submitterStakeResolvable) {
          await writeContractAndConfirm(publicClient, walletClient, {
            chain,
            account,
            address: engineAddr,
            abi: RoundVotingEngineAbi,
            functionName: "resolveSubmitterStake",
            args: [contentId],
          });
          logger.info("Resolved submitter stake", { contentId: Number(contentId) });
          result.submitterStakesResolved++;
        }
      } catch (err: unknown) {
        const reason = getRevertReason(err);
        if (!isExpectedRevert(reason) && !reason.includes("ActiveRoundStillOpen")) {
          logger.debug("Could not resolve submitter stake", {
            contentId: Number(contentId),
            error: reason,
          });
        }
      }

      // --- 7. Dormancy sweep ---
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
        if (!reason.includes("pending votes") && !reason.includes("Content has active round")) {
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

  result.cleanupBatchesProcessed += await processQueuedCleanupRounds(
    publicClient,
    walletClient,
    chain,
    account,
    logger,
    engineAddr,
  );

  return result;
}
