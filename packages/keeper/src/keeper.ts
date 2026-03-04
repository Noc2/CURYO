/**
 * Core keeper logic: reveal tlock votes, settle rounds, and sweep dormant content.
 *
 * With tlock commit-reveal voting, the keeper has three jobs:
 *   1. Reveal committed votes after each epoch ends (using drand beacon decryption).
 *   2. Call `settleRound(contentId, roundId)` when ≥minVoters are revealed.
 *   3. Call `cancelExpiredRound(contentId, roundId)` for rounds past maxDuration.
 *   4. Call `markDormant(contentId)` for stale content.
 *
 * Vote ciphertext is tlock-encrypted to a future drand round. After the epoch ends,
 * the drand beacon makes the decryption key available and the keeper can decrypt.
 */
import type { PublicClient, WalletClient, Chain, Account } from "viem";
import { BaseError, ContractFunctionRevertedError, decodeErrorResult } from "viem";
import { timelockDecrypt, mainnetClient } from "tlock-js";
import { RoundVotingEngineAbi } from "./abis/RoundVotingEngineAbi.js";
import { ContentRegistryAbi } from "./abis/ContentRegistryAbi.js";
import { config } from "./config.js";
import type { Logger } from "./logger.js";

const tlockClient = mainnetClient();

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
  votesRevealed: number;
  contentMarkedDormant: number;
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

function emptyResult(): KeeperResult {
  return {
    roundsSettled: 0,
    roundsCancelled: 0,
    votesRevealed: 0,
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
    "RoundNotOpen",
    "EpochNotEnded",
    "NotEnoughVotes",

    "AlreadyRevealed",
    "AlreadyCancelled",
    "ThresholdReached",
  ];
  const lower = msg.toLowerCase();
  return benign.some(phrase => lower.includes(phrase.toLowerCase()));
}

/**
 * Decrypt a tlock-encrypted ciphertext using the drand beacon.
 * Ciphertext on-chain is hex-encoded UTF-8 armored AGE string.
 * Plaintext is 33 bytes: [uint8 isUp (0|1), bytes32 salt].
 */
async function decryptTlockCiphertext(
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
 * Main keeper loop: iterate all content, reveal votes, settle rounds, sweep dormant content.
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

  // --- Read config ---
  let epochDuration: bigint = 1200n; // default 20 minutes
  let maxDuration: bigint = 604800n; // default 7 days
  let minVoters: bigint = 3n;

  try {
    const configResult = (await publicClient.readContract({
      address: engineAddr,
      abi: RoundVotingEngineAbi,
      functionName: "config",
      args: [],
    })) as readonly [bigint, bigint, bigint, bigint];
    // config() returns: [epochDuration, maxDuration, minVoters, maxVoters]
    epochDuration = configResult[0];
    maxDuration = configResult[1];
    minVoters = configResult[2];
  } catch {
    logger.error("Could not read config from RoundVotingEngine");
    return emptyResult();
  }

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

      if (activeRoundId > 0n) {
        // --- 1. REVEAL LOOP: Decrypt and reveal unrevealed commits ---
        const revealCount = await _revealCommits(
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
        result.votesRevealed += revealCount;

        // Re-read round after reveals to get updated state
        let round: { startTime: bigint; state: number; thresholdReachedAt: bigint; revealedCount: bigint };
        try {
          round = (await publicClient.readContract({
            address: engineAddr,
            abi: RoundVotingEngineAbi,
            functionName: "getRound",
            args: [contentId, activeRoundId],
          })) as any;
        } catch {
          continue;
        }

        // --- 2. SETTLE: If threshold reached (enough votes revealed) ---
        if (
          round.state === RoundState.Open &&
          round.thresholdReachedAt > 0n
        ) {
          try {
            await walletClient.writeContract({
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

        // --- 3. CANCEL: Open rounds past maxDuration deadline ---
        if (round.state === RoundState.Open && round.startTime > 0n && now > round.startTime + maxDuration) {
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

      // --- 4. Dormancy sweep ---
      try {
        const content = (await publicClient.readContract({
          address: registryAddr,
          abi: ContentRegistryAbi,
          functionName: "getContent",
          args: [contentId],
        })) as { status: number; lastActivityAt: bigint };

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
        logger.debug("tlock decryption not yet available", {
          contentId: Number(contentId),
          roundId: Number(roundId),
          commitKey,
          error: (err as any)?.message || String(err),
        });
        continue;
      }

      if (!decrypted) {
        logger.warn("Failed to decode tlock ciphertext", {
          contentId: Number(contentId),
          roundId: Number(roundId),
          commitKey,
        });
        continue;
      }

      // Submit reveal to chain
      try {
        await walletClient.writeContract({
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
