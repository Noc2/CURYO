import { randomBytes } from "crypto";
import { ProtocolConfigAbi } from "@curyo/contracts/abis";
import { createTlockVoteCommit } from "@curyo/contracts/voting";
import { ensureHrepAllowance } from "../allowance.js";
import { publicClient, getWalletClient, getAccount } from "../client.js";
import { contractConfig } from "../contracts.js";
import { config, log } from "../config.js";
import { ponder } from "../ponder.js";
import { parseRoundConfig, type BotRoundConfig } from "../roundConfig.js";
import { getStrategy } from "../strategies/index.js";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as `0x${string}`;
const ROUND_STATE_OPEN = 0;
type IndexedRoundConfig = {
  epochDuration?: bigint | number | string;
  maxDuration?: bigint | number | string;
  minVoters?: bigint | number | string;
  maxVoters?: bigint | number | string;
};

function parseRound(value: unknown): { startTime: bigint; state: number } | null {
  const source = value as { startTime?: bigint; state?: number } & Record<number, unknown>;
  const startTime = source?.startTime ?? source?.[0];
  const state = source?.state ?? source?.[1];
  if (startTime === undefined || state === undefined) {
    return null;
  }

  return {
    startTime: BigInt(startTime as bigint | number | string),
    state: Number(state),
  };
}

function clampNewRoundTargetBufferSeconds(epochDurationSeconds: number, bufferSeconds: number) {
  const safeEpochDurationSeconds = Math.max(1, Math.floor(epochDurationSeconds));
  if (safeEpochDurationSeconds <= 1) {
    return 0;
  }

  return Math.min(Math.max(1, Math.floor(bufferSeconds)), safeEpochDurationSeconds - 1);
}

function deriveCommitVoteRuntimeNowMs(params: {
  latestBlockTimestampSeconds: number;
  epochDurationSeconds: number;
  roundStartTimeSeconds?: number | null;
}) {
  const latestBlockTimestampSeconds = Math.max(0, Math.floor(params.latestBlockTimestampSeconds));
  const epochDurationSeconds = Math.max(1, Math.floor(params.epochDurationSeconds));
  const roundStartTimeSeconds = params.roundStartTimeSeconds != null ? Math.floor(params.roundStartTimeSeconds) : null;

  if (roundStartTimeSeconds != null && roundStartTimeSeconds > 0) {
    const elapsedSeconds = Math.max(0, latestBlockTimestampSeconds - roundStartTimeSeconds);
    const currentEpochIndex = Math.floor(elapsedSeconds / epochDurationSeconds);
    const nextEpochBoundarySeconds = roundStartTimeSeconds + (currentEpochIndex + 1) * epochDurationSeconds;
    return (nextEpochBoundarySeconds + 1 - epochDurationSeconds) * 1000;
  }

  const newRoundTargetBufferSeconds = clampNewRoundTargetBufferSeconds(epochDurationSeconds, 60);
  return (latestBlockTimestampSeconds + newRoundTargetBufferSeconds) * 1000;
}

async function readProtocolRoundConfig(blockNumber?: bigint): Promise<BotRoundConfig> {
  const protocolConfigAddress = (await publicClient.readContract({
    ...contractConfig.votingEngine,
    functionName: "protocolConfig",
    args: [],
    blockNumber,
  })) as `0x${string}`;

  return parseRoundConfig(
    await publicClient.readContract({
      address: protocolConfigAddress,
      abi: ProtocolConfigAbi,
      functionName: "config",
      args: [],
      blockNumber,
    }),
  );
}

async function resolveVoteRuntime(params: { contentId: bigint; indexedRoundConfig?: IndexedRoundConfig | null }) {
  const latestBlock = await publicClient.getBlock({ blockTag: "latest" });
  const snapshotBlockNumber = latestBlock.number;
  const fallbackRoundConfig = await readProtocolRoundConfig(snapshotBlockNumber);
  const currentRoundId = (await publicClient.readContract({
    ...contractConfig.votingEngine,
    functionName: "currentRoundId",
    args: [params.contentId],
    blockNumber: snapshotBlockNumber,
  })) as bigint;

  let epochDuration = fallbackRoundConfig.epochDuration;
  let roundStartTimeSeconds: number | null = null;
  if (currentRoundId > 0n) {
    const [rawRound, rawRoundConfig] = await Promise.all([
      publicClient.readContract({
        ...contractConfig.votingEngine,
        functionName: "rounds",
        args: [params.contentId, currentRoundId],
        blockNumber: snapshotBlockNumber,
      }),
      publicClient.readContract({
        ...contractConfig.votingEngine,
        functionName: "roundConfigSnapshot",
        args: [params.contentId, currentRoundId],
        blockNumber: snapshotBlockNumber,
      }),
    ]);
    const round = parseRound(rawRound);
    const roundConfig = parseRoundConfig(rawRoundConfig, fallbackRoundConfig);
    if (round?.state === ROUND_STATE_OPEN && round.startTime > 0n && roundConfig.epochDuration > 0n) {
      epochDuration = roundConfig.epochDuration;
      roundStartTimeSeconds = Number(round.startTime);
    }
  }

  if (roundStartTimeSeconds === null) {
    const contentRoundConfig = parseRoundConfig(params.indexedRoundConfig, fallbackRoundConfig);
    epochDuration = contentRoundConfig.epochDuration;
  }

  const roundReferenceRatingBps = Number(
    await publicClient.readContract({
      ...contractConfig.votingEngine,
      functionName: "previewCommitReferenceRatingBps",
      args: [params.contentId],
      blockNumber: snapshotBlockNumber,
    }),
  );

  return {
    epochDuration: Number(epochDuration),
    now: () =>
      deriveCommitVoteRuntimeNowMs({
        latestBlockTimestampSeconds: Number(latestBlock.timestamp),
        epochDurationSeconds: Number(epochDuration),
        roundStartTimeSeconds,
      }),
    roundReferenceRatingBps,
  };
}

export async function runVote() {
  const account = getAccount(config.rateBot);
  const wallet = getWalletClient(config.rateBot, account);
  const votingEngineAddress = config.contracts.votingEngine;
  if (!votingEngineAddress) {
    log.error("RoundVotingEngine address is not configured.");
    return;
  }
  const frontendAddress = config.voteFrontendAddress ?? ZERO_ADDRESS;
  log.info(`Rating bot address: ${account.address}`);
  log.info(
    frontendAddress === ZERO_ADDRESS
      ? "Vote frontend attribution: disabled"
      : `Vote frontend attribution: ${frontendAddress}`,
  );

  // 1. Check Voter ID NFT
  const hasVoterId = await publicClient.readContract({
    ...contractConfig.voterIdNFT,
    functionName: "hasVoterId",
    args: [account.address],
  });
  if (!hasVoterId) {
    log.error("Account does not have a Voter ID NFT. Cannot vote.");
    return;
  }
  log.info("Voter ID: confirmed");

  // 2. Check HREP balance
  const balance = (await publicClient.readContract({
    ...contractConfig.token,
    functionName: "balanceOf",
    args: [account.address],
  })) as bigint;
  log.info(`HREP balance: ${Number(balance) / 1e6} HREP`);

  if (balance < config.voteStake) {
    log.error(`Insufficient HREP. Need ${Number(config.voteStake) / 1e6}, have ${Number(balance) / 1e6}`);
    return;
  }

  // 3. Fetch active content from Ponder
  if (!(await ponder.isAvailable())) {
    log.error("Ponder indexer is not available. Start it with: yarn ponder:dev");
    return;
  }

  let items: Awaited<ReturnType<typeof ponder.getContent>>["items"];
  try {
    const result = await ponder.getContent({ status: "0", sortBy: "newest", limit: "50" });
    items = result.items;
  } catch (err: any) {
    log.error(`Failed to fetch content from Ponder: ${err.message}`);
    return;
  }
  log.info(`Found ${items.length} active content items`);

  let votesPlaced = 0;

  for (const item of items) {
    if (votesPlaced >= config.maxVotesPerRun) {
      log.info(`Reached max votes per run (${config.maxVotesPerRun}), stopping`);
      break;
    }

    // Skip own submissions
    if (item.submitter.toLowerCase() === account.address.toLowerCase()) {
      log.debug(`Skipping content #${item.id} (own submission)`);
      continue;
    }

    // Check if we have a strategy for this URL
    const strategy = getStrategy(item.url);
    if (!strategy) {
      log.debug(`Skipping content #${item.id} (no rating strategy for URL)`);
      continue;
    }

    const contentId = BigInt(item.id);

    // Preflight current-round duplicate commits; longer-term cooldown is still enforced by the contract on commit.
    try {
      const currentRoundId = (await publicClient.readContract({
        ...contractConfig.votingEngine,
        functionName: "currentRoundId",
        args: [contentId],
      })) as bigint;
      if (currentRoundId > 0n) {
        const commitHash = (await publicClient.readContract({
          ...contractConfig.votingEngine,
          functionName: "voterCommitHash",
          args: [contentId, currentRoundId, account.address],
        })) as `0x${string}`;
        if (commitHash !== "0x0000000000000000000000000000000000000000000000000000000000000000") {
          log.debug(`Skipping content #${item.id} (already committed in the current round)`);
          continue;
        }
      }
    } catch (err: any) {
      log.warn(`Skipping content #${item.id} (failed to read current round vote state: ${err.message})`);
      continue;
    }

    let voteRuntime: Awaited<ReturnType<typeof resolveVoteRuntime>>;
    try {
      voteRuntime = await resolveVoteRuntime({
        contentId,
        indexedRoundConfig: {
          epochDuration: item.roundEpochDuration,
          maxDuration: item.roundMaxDuration,
          minVoters: item.roundMinVoters,
          maxVoters: item.roundMaxVoters,
        },
      });
    } catch (err: any) {
      log.warn(`Skipping content #${item.id} (failed to read round vote runtime: ${err.message})`);
      continue;
    }

    // Get external rating
    let score: number | null;
    try {
      score = await strategy.getScore(item.url);
    } catch (err: any) {
      log.warn(`Strategy error for content #${item.id}: ${err.message}`);
      continue;
    }
    if (score === null) {
      log.warn(`Could not get rating for content #${item.id} (${item.url})`);
      continue;
    }

    const isUp = score >= config.voteThreshold;
    log.info(`Content #${item.id}: ${strategy.name} score=${score.toFixed(1)} -> vote ${isUp ? "UP" : "DOWN"}`);

    try {
      const approveTx = await ensureHrepAllowance({
        owner: account.address,
        spender: votingEngineAddress,
        requiredAmount: config.voteStake,
        wallet: wallet as never,
      });
      if (approveTx) {
        log.debug(`Approved HREP: ${approveTx}`);
      }

      // tlock commit-reveal: encrypt vote direction to epoch's drand round
      const salt = `0x${randomBytes(32).toString("hex")}` as `0x${string}`;

      const { ciphertext, commitHash, targetRound, drandChainHash } = await createTlockVoteCommit(
        {
          voter: account.address,
          isUp,
          salt,
          contentId,
          roundReferenceRatingBps: voteRuntime.roundReferenceRatingBps,
          epochDurationSeconds: voteRuntime.epochDuration,
        },
        { now: voteRuntime.now },
      );

      const voteTx = await wallet.writeContract({
        ...contractConfig.votingEngine,
        abi: contractConfig.votingEngine.abi as any,
        functionName: "commitVote",
        args: [
          contentId,
          voteRuntime.roundReferenceRatingBps,
          targetRound,
          drandChainHash,
          commitHash,
          ciphertext,
          config.voteStake,
          frontendAddress,
        ],
      });
      await publicClient.waitForTransactionReceipt({ hash: voteTx });
      log.info(
        `Committed vote on content #${item.id} (${Number(config.voteStake) / 1e6} HREP, ${isUp ? "UP" : "DOWN"} — hidden until epoch ends): ${voteTx}`,
      );
      votesPlaced++;
    } catch (err: any) {
      const message = err?.message ?? String(err);
      if (message.includes("CooldownActive")) {
        log.debug(`Skipping content #${item.id} (vote cooldown still active)`);
        continue;
      }
      if (message.includes("AlreadyCommitted")) {
        log.debug(`Skipping content #${item.id} (already committed in the current round)`);
        continue;
      }
      log.error(`Failed to vote on content #${item.id}: ${message}`);
    }
  }

  log.info(`Vote run complete: ${votesPlaced} votes placed (${Number(config.voteStake) / 1e6} HREP each)`);
}
