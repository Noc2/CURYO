import { publicClient, getWalletClient, getAccount } from "../client.js";
import { contractConfig } from "../contracts.js";
import { config, log } from "../config.js";
import { generateSalt, computeCommitHash, encryptVote } from "../tlock.js";
import { ponder } from "../ponder.js";
import { getStrategy } from "../strategies/index.js";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as `0x${string}`;
const RATE_BOT_STAKE = 1_000_000n; // 1 cREP (6 decimals) — fixed for rating bot

export async function runVote() {
  const account = getAccount(config.rateBot);
  const wallet = getWalletClient(config.rateBot);
  log.info(`Rating bot address: ${account.address}`);

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

  // 2. Check cREP balance
  const balance = (await publicClient.readContract({
    ...contractConfig.token,
    functionName: "balanceOf",
    args: [account.address],
  })) as bigint;
  log.info(`cREP balance: ${Number(balance) / 1e6} cREP`);

  if (balance < RATE_BOT_STAKE) {
    log.error(`Insufficient cREP. Need ${Number(RATE_BOT_STAKE) / 1e6}, have ${Number(balance) / 1e6}`);
    return;
  }

  // 3. Read round config (epochDuration for tlock encryption target)
  const [epochDuration] = await publicClient.readContract({
    ...contractConfig.votingEngine,
    functionName: "config",
  });
  const epochDurationSecs = Number(epochDuration);
  log.info(`Round config: ${epochDurationSecs / 60}min epochs`);

  // 4. Fetch active content from Ponder
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

  let votesCommitted = 0;

  for (const item of items) {
    if (votesCommitted >= config.maxVotesPerRun) {
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
    const now = Math.floor(Date.now() / 1000);

    // Vote-once check: if we have EVER voted on this content, skip entirely
    try {
      const lastVote = await publicClient.readContract({
        ...contractConfig.votingEngine,
        functionName: "lastVoteTimestamp",
        args: [contentId, account.address],
      });
      if (lastVote > 0n) {
        log.debug(`Skipping content #${item.id} (already voted — one-time only)`);
        continue;
      }
    } catch {
      continue;
    }

    // Check active round for epoch timing
    let epochEnd: number;
    try {
      const activeRoundId = await publicClient.readContract({
        ...contractConfig.votingEngine,
        functionName: "getActiveRoundId",
        args: [contentId],
      });

      if (activeRoundId > 0n) {
        // Read round startTime to compute epoch end
        const round = await publicClient.readContract({
          ...contractConfig.votingEngine,
          functionName: "getRound",
          args: [contentId, activeRoundId],
        }) as { startTime: bigint };
        const roundStartTime = Number(round.startTime);
        const epochIndex = Math.floor((now - roundStartTime) / epochDurationSecs);
        epochEnd = roundStartTime + (epochIndex + 1) * epochDurationSecs;
      } else {
        // No active round — commitVote will create one with startTime ≈ now
        epochEnd = now + epochDurationSecs;
      }
    } catch {
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

    // Generate salt and commit hash
    const salt = generateSalt();
    const commitHash = computeCommitHash(isUp, salt, contentId);

    // Encrypt vote with tlock to epoch end
    let ciphertext: `0x${string}`;
    try {
      ciphertext = await encryptVote(isUp, salt, contentId, epochEnd);
    } catch (err: any) {
      log.warn(`Tlock encryption failed for content #${item.id}: ${err.message}`);
      continue;
    }

    try {
      // Approve cREP for staking (1 cREP)
      const approveTx = await wallet.writeContract({
        ...contractConfig.token,
        functionName: "approve",
        args: [config.contracts.votingEngine, RATE_BOT_STAKE],
      });
      await publicClient.waitForTransactionReceipt({ hash: approveTx });
      log.debug(`Approved cREP: ${approveTx}`);

      // Commit vote with 1 cREP stake
      const commitTx = await wallet.writeContract({
        ...contractConfig.votingEngine,
        functionName: "commitVote",
        args: [contentId, commitHash, ciphertext, RATE_BOT_STAKE, ZERO_ADDRESS],
      });
      await publicClient.waitForTransactionReceipt({ hash: commitTx });
      log.info(`Committed vote on content #${item.id} (1 cREP): ${commitTx}`);
      votesCommitted++;
    } catch (err: any) {
      log.error(`Failed to vote on content #${item.id}: ${err.message}`);
    }
  }

  log.info(`Vote run complete: ${votesCommitted} votes committed (1 cREP each, one-time per content)`);
}
