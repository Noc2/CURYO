import { randomBytes } from "node:crypto";
import { encodeAbiParameters, erc20Abi, isAddress, keccak256, type Address, type Hex } from "viem";
import { ensureCrepAllowance } from "../allowance.js";
import { publicClient, getWalletClient, getAccount } from "../client.js";
import { contractConfig } from "../contracts.js";
import { config, log } from "../config.js";
import { truncateContentDescription, truncateContentTitle } from "../contentLimits.js";
import { getAllSources } from "../sources/index.js";
import type { ContentSource } from "../sources/types.js";
import type { SubmitRunOptions } from "../submitOptions.js";
import { sleep } from "../utils.js";

const SUBMISSION_REWARD_ASSET_CREP = 0;
const SUBMISSION_REWARD_ASSET_USDC = 1;
const DEFAULT_MIN_SUBMISSION_REWARD_POOL = 1_000_000n; // 1 token with 6 decimals
const RESERVED_SUBMISSION_WAIT_MS = 1_100;
const TX_RECEIPT_TIMEOUT_MS = 180_000;

type PreviewSubmissionResult = readonly [bigint, Hex];
type SubmissionMedia = { imageUrls: string[]; videoUrl: string };

const DIRECT_IMAGE_URL_PATTERN = /^https:\/\/.+\.(?:avif|gif|jpe?g|png|webp)(?:[?#].*)?$/i;

function isYouTubeVideoUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return host === "youtu.be" || host === "youtube.com" || host === "www.youtube.com" || host === "m.youtube.com";
  } catch {
    return false;
  }
}

function normalizeHttpsUrl(url: string): string | null {
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function getContextUrl(item: { contextUrl?: string; url: string }): string | null {
  return normalizeHttpsUrl(item.contextUrl ?? item.url);
}

function getSubmissionMedia(item: { imageUrls?: string[]; videoUrl?: string }): SubmissionMedia | null {
  const imageUrls = (item.imageUrls ?? [])
    .map(url => normalizeHttpsUrl(url))
    .filter((url): url is string => Boolean(url));
  const unsupportedImageUrl = imageUrls.find(url => !DIRECT_IMAGE_URL_PATTERN.test(url));
  if (unsupportedImageUrl || imageUrls.length > 4) {
    return null;
  }

  const videoUrl = item.videoUrl ? normalizeHttpsUrl(item.videoUrl) : "";
  if (videoUrl && !isYouTubeVideoUrl(videoUrl)) {
    return null;
  }
  if (videoUrl && imageUrls.length > 0) {
    return null;
  }

  return { imageUrls, videoUrl: videoUrl ?? "" };
}

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
  rewardAsset: number;
  rewardAmount: bigint;
  requiredVoters: number;
  requiredSettledRounds: number;
  rewardPoolExpiresAt: bigint;
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
        { type: "uint8" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "uint256" },
      ],
      [
        params.submissionKey,
        params.title,
        params.description,
        params.tags,
        params.categoryId,
        params.salt,
        params.submitter,
        params.rewardAsset,
        params.rewardAmount,
        BigInt(params.requiredVoters),
        BigInt(params.requiredSettledRounds),
        params.rewardPoolExpiresAt,
      ],
    ),
  );
}

async function getSubmissionRewardFunding(): Promise<{
  assetId: number;
  amount: bigint;
  label: string;
  token: { address: Address; abi: typeof erc20Abi };
}> {
  const rewardAsset = config.submitRewardAsset;
  const protocolConfigAddress = (await publicClient.readContract({
    ...contractConfig.registry,
    functionName: "protocolConfig",
  })) as Address;
  const minimumFunctionName = rewardAsset === "crep" ? "minSubmissionCrepPool" : "minSubmissionUsdcPool";
  const configuredMinimum =
    protocolConfigAddress && isAddress(protocolConfigAddress)
      ? ((await publicClient
          .readContract({
            address: protocolConfigAddress,
            abi: contractConfig.protocolConfigAbi,
            functionName: minimumFunctionName,
          })
          .catch(() => 0n)) as bigint)
      : 0n;
  const amount = configuredMinimum > 0n ? configuredMinimum : DEFAULT_MIN_SUBMISSION_REWARD_POOL;

  if (rewardAsset === "crep") {
    return {
      assetId: SUBMISSION_REWARD_ASSET_CREP,
      amount,
      label: "cREP",
      token: { address: contractConfig.token.address, abi: erc20Abi },
    };
  }

  const usdcToken = (await publicClient.readContract({
    ...contractConfig.questionRewardPoolEscrow,
    functionName: "usdcToken",
  })) as Address;

  return {
    assetId: SUBMISSION_REWARD_ASSET_USDC,
    amount,
    label: "USDC",
    token: { address: usdcToken, abi: erc20Abi },
  };
}

function formatMicroTokenAmount(amount: bigint) {
  const whole = amount / 1_000_000n;
  const fractional = amount % 1_000_000n;
  const fractionalText = fractional.toString().padStart(6, "0").replace(/0+$/, "");
  return fractionalText ? `${whole}.${fractionalText}` : whole.toString();
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
    await waitForTransactionReceipt({
      hash: cancelTx,
      stage: "cancel reservation",
      title,
    });
    log.warn(`Cancelled reservation for "${title}" after a failed submit attempt`);
  } catch (error: any) {
    log.warn(`Failed to cancel reservation for "${title}": ${error.message}`);
  }
}

function isReservationTooNewError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("Reservation too new");
}

function normalizeFilterValue(value: string): string {
  return value.trim().toLowerCase();
}

function matchesCategoryFilter(source: ContentSource, filter: string): boolean {
  const normalized = normalizeFilterValue(filter);
  return source.categoryId.toString() === normalized || normalizeFilterValue(source.categoryName) === normalized;
}

function matchesSourceFilter(source: ContentSource, filter: string): boolean {
  return normalizeFilterValue(source.name) === normalizeFilterValue(filter);
}

function selectSources(sources: ContentSource[], options: SubmitRunOptions): ContentSource[] {
  return sources.filter(source => {
    if (options.category && !matchesCategoryFilter(source, options.category)) {
      return false;
    }

    if (options.source && !matchesSourceFilter(source, options.source)) {
      return false;
    }

    return true;
  });
}

function formatSourceSummary(source: ContentSource): string {
  return `${source.categoryName} [${source.categoryId}] via ${source.name}`;
}

async function waitForTransactionReceipt(params: {
  hash: Hex;
  stage: string;
  title: string;
}): Promise<void> {
  log.info(`Waiting for ${params.stage} receipt for "${params.title}": ${params.hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: params.hash,
    timeout: TX_RECEIPT_TIMEOUT_MS,
  });

  if (receipt.status !== "success") {
    throw new Error(`${params.stage} transaction reverted: ${params.hash}`);
  }
}

export async function runSubmit(options: SubmitRunOptions = {}) {
  const account = getAccount(config.submitBot);
  const wallet = getWalletClient(config.submitBot, account);
  const rewardEscrowAddress = config.contracts.questionRewardPoolEscrow;
  if (!rewardEscrowAddress) {
    log.error("QuestionRewardPoolEscrow address is not configured.");
    return;
  }
  log.info(`Submission bot address: ${account.address}`);
  const maxSubmissions = options.maxSubmissions ?? config.maxSubmissionsPerRun;
  const rewardFunding = await getSubmissionRewardFunding();
  log.info(
    `Submission Bounty: ${formatMicroTokenAmount(rewardFunding.amount)} ${rewardFunding.label} per question`,
  );
  log.info(
    `Submission terms: ${config.submitRewardRequiredVoters} voters, ${config.submitRewardRequiredSettledRounds} rounds, ${
      config.submitRewardPoolExpiresAt === 0n
        ? "no expiry"
        : `expires at ${config.submitRewardPoolExpiresAt}`
    }`,
  );

  // 1. Check balance for the mandatory Bounty.
  const balance = (await publicClient.readContract({
    ...rewardFunding.token,
    functionName: "balanceOf",
    args: [account.address],
  })) as bigint;
  log.info(`${rewardFunding.label} balance: ${formatMicroTokenAmount(balance)} ${rewardFunding.label}`);

  if (balance < rewardFunding.amount) {
    log.error(
      `Insufficient ${rewardFunding.label} for even one submission (need ${formatMicroTokenAmount(rewardFunding.amount)} ${rewardFunding.label} Bounty).`,
    );
    return;
  }

  // 2. Iterate through all content sources
  const sources = selectSources(getAllSources(), options);
  if (options.category) {
    log.info(`Category filter: ${options.category}`);
  }
  if (options.source) {
    log.info(`Source filter: ${options.source}`);
  }
  if (options.maxSubmissions !== undefined) {
    log.info(`Max submissions override: ${options.maxSubmissions}`);
  }
  if (sources.length === 0) {
    const availableSources = getAllSources().map(formatSourceSummary).join(", ");
    log.warn(`No sources matched the current submit filters. Available sources: ${availableSources}`);
    return;
  }

  const singleSourceSelected = sources.length === 1;
  let totalSubmitted = 0;

  for (const source of sources) {
    if (totalSubmitted >= maxSubmissions) {
      log.info(`Reached max submissions per run (${maxSubmissions}), stopping`);
      break;
    }

    const remainingSubmissions = maxSubmissions - totalSubmitted;
    const fetchLimit =
      singleSourceSelected && options.maxSubmissions !== undefined
        ? remainingSubmissions
        : Math.min(config.maxSubmissionsPerCategory, remainingSubmissions);

    log.info(`Fetching trending content from ${source.name}...`);
    const items = await source.fetchTrending(fetchLimit);

    if (items.length === 0) {
      log.debug(`No items from ${source.name}`);
      continue;
    }

    log.info(`Got ${items.length} items from ${source.name}`);
    let sourceSubmitted = 0;

    for (const [itemIndex, item] of items.entries()) {
      if (totalSubmitted >= maxSubmissions) break;
      if (sourceSubmitted >= fetchLimit) break;
      let reservedRevealCommitment: Hex | null = null;

      log.info(`Processing ${source.name} item ${itemIndex + 1}/${items.length}: "${item.title}"`);

      const contextUrl = getContextUrl(item);
      const media = getSubmissionMedia(item);
      if (!contextUrl) {
        log.warn(`Skipping "${item.title}" (context URL must be a valid HTTPS URL)`);
        continue;
      }
      if (!media) {
        log.warn(`Skipping "${item.title}" (preview media must be direct images or one YouTube video)`);
        continue;
      }

      // Check balance before each submission
      const currentBalance = (await publicClient.readContract({
        ...rewardFunding.token,
        functionName: "balanceOf",
        args: [account.address],
      })) as bigint;
      if (currentBalance < rewardFunding.amount) {
        log.error(`Insufficient ${rewardFunding.label} for next submission. Stopping.`);
        return;
      }

      try {
        const requestedCategoryId = item.categoryId;
        const title = truncateContentTitle(item.title);
        const description = truncateContentDescription(item.description);
        const [resolvedCategoryId, submissionKey] = (await publicClient.readContract({
          ...contractConfig.registry,
          functionName: "previewQuestionSubmissionKey",
          args: [contextUrl, media.imageUrls, media.videoUrl, title, description, item.tags, requestedCategoryId],
        })) as PreviewSubmissionResult;
        if (resolvedCategoryId !== requestedCategoryId) {
          log.warn(
            `Skipping "${item.title}" (resolved category ${resolvedCategoryId} does not match requested category ${requestedCategoryId})`,
          );
          continue;
        }
        const questionAlreadySubmitted = (await publicClient.readContract({
          ...contractConfig.registry,
          functionName: "submissionKeyUsed",
          args: [submissionKey],
        })) as boolean;
        if (questionAlreadySubmitted) {
          log.debug(`Skipping "${item.title}" (question already submitted)`);
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
          rewardAsset: rewardFunding.assetId,
          rewardAmount: rewardFunding.amount,
          requiredVoters: config.submitRewardRequiredVoters,
          requiredSettledRounds: config.submitRewardRequiredSettledRounds,
          rewardPoolExpiresAt: config.submitRewardPoolExpiresAt,
        });

        const approveTx = await ensureCrepAllowance({
          owner: account.address,
          spender: rewardEscrowAddress,
          requiredAmount: rewardFunding.amount,
          token: rewardFunding.token,
          wallet,
        });
        if (approveTx) {
          log.debug(`Approved cREP: ${approveTx}`);
        }

        const reserveTx = await wallet.writeContract({
          ...contractConfig.registry,
          functionName: "reserveSubmission",
          args: [revealCommitment],
        });
        await waitForTransactionReceipt({
          hash: reserveTx,
          stage: "reservation",
          title: item.title,
        });
        reservedRevealCommitment = revealCommitment;

        // ContentRegistry requires the reservation to age by at least one second.
        await sleep(RESERVED_SUBMISSION_WAIT_MS);

        // Submit question with the exact metadata used in the reservation commitment.
        let submitTx: Hex;
        try {
          submitTx = await wallet.writeContract({
            ...contractConfig.registry,
            functionName: "submitQuestionWithReward",
            args: [
              contextUrl,
              media.imageUrls,
              media.videoUrl,
              title,
              description,
              item.tags,
              requestedCategoryId,
              salt,
              rewardFunding.assetId,
              rewardFunding.amount,
              config.submitRewardRequiredVoters,
              config.submitRewardRequiredSettledRounds,
              config.submitRewardPoolExpiresAt,
            ],
          });
        } catch (error) {
          if (!isReservationTooNewError(error)) {
            throw error;
          }

          log.warn(`Retrying "${item.title}" after reservation age check`);
          await sleep(RESERVED_SUBMISSION_WAIT_MS);
          submitTx = await wallet.writeContract({
            ...contractConfig.registry,
            functionName: "submitQuestionWithReward",
            args: [
              contextUrl,
              media.imageUrls,
              media.videoUrl,
              title,
              description,
              item.tags,
              requestedCategoryId,
              salt,
              rewardFunding.assetId,
              rewardFunding.amount,
              config.submitRewardRequiredVoters,
              config.submitRewardRequiredSettledRounds,
              config.submitRewardPoolExpiresAt,
            ],
          });
        }
        await waitForTransactionReceipt({
          hash: submitTx,
          stage: "submit",
          title: item.title,
        });
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
