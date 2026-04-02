import { randomBytes } from "node:crypto";
import { encodeAbiParameters, keccak256, type Hex } from "viem";
import { publicClient, getWalletClient, getAccount } from "../client.js";
import { contractConfig } from "../contracts.js";
import { config, log } from "../config.js";
import { truncateContentDescription, truncateContentTitle } from "../contentLimits.js";
import { getAllSources } from "../sources/index.js";
import { sleep } from "../utils.js";

const MIN_SUBMITTER_STAKE = 10_000_000n; // 10 cREP (6 decimals)
const RESERVED_SUBMISSION_WAIT_MS = 1_100;

type PreviewSubmissionResult = readonly [bigint, Hex];

function createSubmissionSalt(): Hex {
  return `0x${randomBytes(32).toString("hex")}` as Hex;
}

function buildSubmissionRevealCommitment(params: {
  categoryId: bigint;
  description: string;
  salt: Hex;
  submissionKey: Hex;
  submitter: Hex;
  tags: string;
  title: string;
}): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "string" },
        { type: "string" },
        { type: "string" },
        { type: "uint256" },
        { type: "bytes32" },
        { type: "address" },
      ],
      [
        params.submissionKey,
        params.title,
        params.description,
        params.tags,
        params.categoryId,
        params.salt,
        params.submitter,
      ],
    ),
  );
}

async function cancelReservedSubmission(
  wallet: ReturnType<typeof getWalletClient>,
  revealCommitment: Hex,
  title: string,
): Promise<void> {
  try {
    const cancelTx = await wallet.writeContract({
      ...contractConfig.registry,
      functionName: "cancelReservedSubmission",
      args: [revealCommitment],
    });
    await publicClient.waitForTransactionReceipt({ hash: cancelTx });
    log.warn(`Cancelled reservation for "${title}" after a failed submit attempt`);
  } catch (error: any) {
    log.warn(`Failed to cancel reservation for "${title}": ${error.message}`);
  }
}

function isReservationTooNewError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("Reservation too new");
}

export async function runSubmit() {
  const account = getAccount(config.submitBot);
  const wallet = getWalletClient(config.submitBot, account);
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
      let reservedRevealCommitment: Hex | null = null;

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
        const requestedCategoryId = item.categoryId;
        const title = truncateContentTitle(item.title);
        const description = truncateContentDescription(item.description);
        const [resolvedCategoryId, submissionKey] = (await publicClient.readContract({
          ...contractConfig.registry,
          functionName: "previewSubmissionKey",
          args: [item.url, requestedCategoryId],
        })) as PreviewSubmissionResult;
        if (resolvedCategoryId !== requestedCategoryId) {
          log.warn(
            `Skipping "${item.title}" (resolved category ${resolvedCategoryId} does not match requested category ${requestedCategoryId})`,
          );
          continue;
        }

        const salt = createSubmissionSalt();
        const revealCommitment = buildSubmissionRevealCommitment({
          submissionKey,
          title,
          description,
          tags: item.tags,
          categoryId: requestedCategoryId,
          salt,
          submitter: account.address,
        });

        // Approve cREP for submission stake
        const approveTx = await wallet.writeContract({
          ...contractConfig.token,
          functionName: "approve",
          args: [config.contracts.contentRegistry, MIN_SUBMITTER_STAKE],
        });
        await publicClient.waitForTransactionReceipt({ hash: approveTx });

        const reserveTx = await wallet.writeContract({
          ...contractConfig.registry,
          functionName: "reserveSubmission",
          args: [revealCommitment],
        });
        await publicClient.waitForTransactionReceipt({ hash: reserveTx });
        reservedRevealCommitment = revealCommitment;

        // ContentRegistry requires the reservation to age by at least one second.
        await sleep(RESERVED_SUBMISSION_WAIT_MS);

        // Submit content with the exact metadata used in the reservation commitment.
        let submitTx: Hex;
        try {
          submitTx = await wallet.writeContract({
            ...contractConfig.registry,
            functionName: "submitContent",
            args: [item.url, title, description, item.tags, requestedCategoryId, salt],
          });
        } catch (error) {
          if (!isReservationTooNewError(error)) {
            throw error;
          }

          log.warn(`Retrying "${item.title}" after reservation age check`);
          await sleep(RESERVED_SUBMISSION_WAIT_MS);
          submitTx = await wallet.writeContract({
            ...contractConfig.registry,
            functionName: "submitContent",
            args: [item.url, title, description, item.tags, requestedCategoryId, salt],
          });
        }
        await publicClient.waitForTransactionReceipt({ hash: submitTx });
        reservedRevealCommitment = null;

        log.info(`Submitted "${item.title}" [${source.name}] cat=${requestedCategoryId}: ${submitTx}`);
        totalSubmitted++;
        sourceSubmitted++;
      } catch (err: any) {
        if (reservedRevealCommitment) {
          await cancelReservedSubmission(wallet, reservedRevealCommitment, item.title);
        }
        log.error(`Failed to submit "${item.title}": ${err.message}`);
      }
    }
  }

  log.info(`Submit run complete: ${totalSubmitted} items submitted across all sources`);
}
