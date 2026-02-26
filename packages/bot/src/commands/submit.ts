import { publicClient, getWalletClient, getAccount } from "../client.js";
import { contractConfig } from "../contracts.js";
import { config, log } from "../config.js";
import { getAllSources } from "../sources/index.js";

const MIN_SUBMITTER_STAKE = 10_000_000n; // 10 cREP (6 decimals)

export async function runSubmit() {
  const account = getAccount(config.submitBot);
  const wallet = getWalletClient(config.submitBot);
  log.info(`Submission bot address: ${account.address}`);

  // 1. Check Voter ID NFT
  const hasVoterId = await publicClient.readContract({
    ...contractConfig.voterIdNFT,
    functionName: "hasVoterId",
    args: [account.address],
  });
  if (!hasVoterId) {
    log.error("Account does not have a Voter ID NFT. Cannot submit.");
    return;
  }

  // 2. Check cREP balance
  const balance = (await publicClient.readContract({
    ...contractConfig.token,
    functionName: "balanceOf",
    args: [account.address],
  })) as bigint;
  log.info(`cREP balance: ${Number(balance) / 1e6} cREP`);

  if (balance < MIN_SUBMITTER_STAKE) {
    log.error("Insufficient cREP for even one submission (need 10 cREP).");
    return;
  }

  // 3. Iterate through all content sources
  const sources = getAllSources();
  let totalSubmitted = 0;

  for (const source of sources) {
    if (totalSubmitted >= config.maxSubmissionsPerRun) {
      log.info(`Reached max submissions per run (${config.maxSubmissionsPerRun}), stopping`);
      break;
    }

    log.info(`Fetching trending content from ${source.name}...`);
    const items = await source.fetchTrending(config.maxSubmissionsPerCategory);

    if (items.length === 0) {
      log.debug(`No items from ${source.name}`);
      continue;
    }

    log.info(`Got ${items.length} items from ${source.name}`);
    let sourceSubmitted = 0;

    for (const item of items) {
      if (totalSubmitted >= config.maxSubmissionsPerRun) break;
      if (sourceSubmitted >= config.maxSubmissionsPerCategory) break;

      // Check if URL already submitted
      try {
        const isSubmitted = await publicClient.readContract({
          ...contractConfig.registry,
          functionName: "isUrlSubmitted",
          args: [item.url],
        });
        if (isSubmitted) {
          log.debug(`Skipping "${item.title}" (URL already submitted)`);
          continue;
        }
      } catch {
        continue;
      }

      // Check balance before each submission
      const currentBalance = (await publicClient.readContract({
        ...contractConfig.token,
        functionName: "balanceOf",
        args: [account.address],
      })) as bigint;
      if (currentBalance < MIN_SUBMITTER_STAKE) {
        log.error("Insufficient cREP for next submission. Stopping.");
        return;
      }

      try {
        // Approve cREP for submission stake
        const approveTx = await wallet.writeContract({
          ...contractConfig.token,
          functionName: "approve",
          args: [config.contracts.contentRegistry, MIN_SUBMITTER_STAKE],
        });
        await publicClient.waitForTransactionReceipt({ hash: approveTx });

        // Submit content with correct category
        const submitTx = await wallet.writeContract({
          ...contractConfig.registry,
          functionName: "submitContent",
          args: [item.url, item.goal, item.tags, item.categoryId],
        });
        await publicClient.waitForTransactionReceipt({ hash: submitTx });

        log.info(`Submitted "${item.title}" [${source.name}] cat=${item.categoryId}: ${submitTx}`);
        totalSubmitted++;
        sourceSubmitted++;
      } catch (err: any) {
        log.error(`Failed to submit "${item.title}": ${err.message}`);
      }
    }
  }

  log.info(`Submit run complete: ${totalSubmitted} items submitted across all sources`);
}
