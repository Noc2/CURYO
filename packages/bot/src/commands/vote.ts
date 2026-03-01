import { publicClient, getWalletClient, getAccount } from "../client.js";
import { contractConfig } from "../contracts.js";
import { config, log } from "../config.js";
import { ponder } from "../ponder.js";
import { getStrategy } from "../strategies/index.js";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as `0x${string}`;

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

  if (balance < config.voteStake) {
    log.error(`Insufficient cREP. Need ${Number(config.voteStake) / 1e6}, have ${Number(balance) / 1e6}`);
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
      // Approve cREP for staking
      const approveTx = await wallet.writeContract({
        ...contractConfig.token,
        functionName: "approve",
        args: [config.contracts.votingEngine, config.voteStake],
      });
      await publicClient.waitForTransactionReceipt({ hash: approveTx });
      log.debug(`Approved cREP: ${approveTx}`);

      // Public vote — single-step, no commit/reveal
      const voteTx = await wallet.writeContract({
        ...contractConfig.votingEngine,
        functionName: "vote",
        args: [contentId, isUp, config.voteStake, ZERO_ADDRESS],
      });
      await publicClient.waitForTransactionReceipt({ hash: voteTx });
      log.info(`Voted on content #${item.id} (${Number(config.voteStake) / 1e6} cREP, ${isUp ? "UP" : "DOWN"}): ${voteTx}`);
      votesPlaced++;
    } catch (err: any) {
      log.error(`Failed to vote on content #${item.id}: ${err.message}`);
    }
  }

  log.info(`Vote run complete: ${votesPlaced} votes placed (${Number(config.voteStake) / 1e6} cREP each, one-time per content)`);
}
