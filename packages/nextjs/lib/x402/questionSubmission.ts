import { ContentRegistryAbi, ProtocolConfigAbi } from "@curyo/contracts/abis";
import { getSharedDeploymentAddress } from "@curyo/contracts/deployments";
import { randomBytes } from "crypto";
import "server-only";
import { createThirdwebClient, defineChain } from "thirdweb";
import { facilitator, settlePayment } from "thirdweb/x402";
import {
  type Address,
  type Hex,
  type TransactionReceipt,
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  erc20Abi,
  http,
  isAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { dbClient } from "~~/lib/db";
import {
  getPrimaryServerTargetNetwork,
  getServerTargetNetworkById,
  getThirdwebSecretKey,
  getX402ExecutorPrivateKey,
  getX402PaymentWaitUntil,
  getX402ServiceFeeUsdc,
  getX402UsdcAddressOverride,
} from "~~/lib/env/server";
import { questionRoundConfigToAbi, serializeQuestionRoundConfig } from "~~/lib/questionRoundConfig";
import { buildQuestionBundleSubmissionRevealCommitment } from "~~/lib/questionSubmissionCommitment";
import {
  type X402QuestionOperation,
  type X402QuestionPayload,
  X402_CELO_USDC_BY_CHAIN_ID,
  X402_SUBMISSION_REWARD_ASSET_USDC,
  X402_USDC_DECIMALS,
  buildX402QuestionOperation,
} from "~~/lib/x402/questionPayload";

const RESERVED_SUBMISSION_WAIT_MS = 1_100;
const TX_RECEIPT_TIMEOUT_MS = 180_000;
const SUBMITTING_STALE_MS = 5 * 60_000;

export type X402QuestionSubmissionStatus = "payment_settled" | "submitting" | "submitted" | "failed";

export type X402QuestionSubmissionRecord = {
  operationKey: `0x${string}`;
  clientRequestId: string;
  payloadHash: string;
  chainId: number;
  payerAddress: string | null;
  paymentAsset: string;
  paymentAmount: string;
  bountyAmount: string;
  serviceFeeAmount: string;
  status: X402QuestionSubmissionStatus;
  bundleId: string | null;
  contentId: string | null;
  contentIds: string | null;
  questionCount: number;
  rewardPoolId: string | null;
  transactionHashes: string | null;
  paymentReceipt: string | null;
  submissionToken: string | null;
  error: string | null;
  updatedAt: Date;
};

type X402QuestionSubmissionTestOverrides = {
  executeX402QuestionSubmission?: typeof executeX402QuestionSubmission;
  preflightX402QuestionSubmission?: typeof preflightX402QuestionSubmission;
  resolveX402QuestionConfig?: typeof resolveX402QuestionConfig;
};

type X402QuestionSubmissionConfig = {
  chainId: number;
  contentRegistryAddress: Address;
  executorPrivateKey: Hex;
  executorAddress: Address;
  questionRewardPoolEscrowAddress: Address;
  rpcUrl: string;
  serviceFeeAmount: bigint;
  targetNetwork: NonNullable<ReturnType<typeof getPrimaryServerTargetNetwork>>;
  thirdwebSecretKey: string | null;
  usdcAddress: Address;
  waitUntil: "simulated" | "submitted" | "confirmed";
};

export class X402QuestionConfigError extends Error {
  readonly status = 503;

  constructor(message: string) {
    super(message);
    this.name = "X402QuestionConfigError";
  }
}

export class X402QuestionConflictError extends Error {
  readonly status = 409;

  constructor(message: string) {
    super(message);
    this.name = "X402QuestionConflictError";
  }
}

let x402QuestionSubmissionTestOverrides: X402QuestionSubmissionTestOverrides | null = null;

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function rowToRecord(row: Record<string, unknown> | undefined): X402QuestionSubmissionRecord | null {
  if (!row) return null;
  return {
    bountyAmount: String(row.bounty_amount),
    bundleId: typeof row.bundle_id === "string" ? row.bundle_id : null,
    chainId: Number(row.chain_id),
    clientRequestId: String(row.client_request_id),
    contentId: typeof row.content_id === "string" ? row.content_id : null,
    contentIds: typeof row.content_ids === "string" ? row.content_ids : null,
    error: typeof row.error === "string" ? row.error : null,
    operationKey: String(row.operation_key) as `0x${string}`,
    payerAddress: typeof row.payer_address === "string" ? row.payer_address : null,
    payloadHash: String(row.payload_hash),
    paymentAmount: String(row.payment_amount),
    paymentAsset: String(row.payment_asset),
    paymentReceipt: typeof row.payment_receipt === "string" ? row.payment_receipt : null,
    questionCount: Number(row.question_count ?? 1),
    rewardPoolId: typeof row.reward_pool_id === "string" ? row.reward_pool_id : null,
    serviceFeeAmount: String(row.service_fee_amount),
    submissionToken: typeof row.submission_token === "string" ? row.submission_token : null,
    status: String(row.status) as X402QuestionSubmissionStatus,
    transactionHashes: typeof row.transaction_hashes === "string" ? row.transaction_hashes : null,
    updatedAt: row.updated_at instanceof Date ? row.updated_at : new Date(String(row.updated_at)),
  };
}

export async function getX402QuestionSubmissionByClientRequest(params: {
  chainId: number;
  clientRequestId: string;
}): Promise<X402QuestionSubmissionRecord | null> {
  const result = await dbClient.execute({
    sql: `
      SELECT *
      FROM x402_question_submissions
      WHERE chain_id = ? AND client_request_id = ?
      LIMIT 1
    `,
    args: [params.chainId, params.clientRequestId],
  });

  return rowToRecord(result.rows[0]);
}

export async function getX402QuestionSubmissionByOperationKey(
  operationKey: `0x${string}`,
): Promise<X402QuestionSubmissionRecord | null> {
  const result = await dbClient.execute({
    sql: `
      SELECT *
      FROM x402_question_submissions
      WHERE operation_key = ?
      LIMIT 1
    `,
    args: [operationKey],
  });

  return rowToRecord(result.rows[0]);
}

async function recordPaymentSettlement(params: {
  config: X402QuestionSubmissionConfig;
  operation: X402QuestionOperation;
  payload: X402QuestionPayload;
  payerAddress: string | null;
  paymentAmount: bigint;
  paymentReceipt: unknown;
}) {
  const now = new Date();
  try {
    await dbClient.execute({
      sql: `
        INSERT INTO x402_question_submissions (
          operation_key,
          client_request_id,
          payload_hash,
          chain_id,
          payer_address,
          payment_asset,
          payment_amount,
          bounty_amount,
          service_fee_amount,
          question_count,
          status,
          payment_receipt,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        params.operation.operationKey,
        params.payload.clientRequestId,
        params.operation.payloadHash,
        params.payload.chainId,
        params.payerAddress,
        params.config.usdcAddress,
        params.paymentAmount.toString(),
        params.payload.bounty.amount.toString(),
        params.config.serviceFeeAmount.toString(),
        params.payload.questions.length,
        "payment_settled",
        JSON.stringify(params.paymentReceipt),
        now,
        now,
      ],
    });
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    if (code !== "23505") {
      throw error;
    }

    await dbClient.execute({
      sql: `
        UPDATE x402_question_submissions
        SET payer_address = ?,
            payment_receipt = ?,
            payment_amount = ?,
            payment_asset = ?,
            status = CASE
              WHEN status IN ('submitted', 'submitting') THEN status
              ELSE ?
            END,
            submission_token = CASE
              WHEN status = 'submitting' THEN submission_token
              ELSE NULL
            END,
            error = CASE
              WHEN status = 'submitting' THEN error
              ELSE NULL
            END,
            updated_at = ?
        WHERE operation_key = ?
      `,
      args: [
        params.payerAddress,
        JSON.stringify(params.paymentReceipt),
        params.paymentAmount.toString(),
        params.config.usdcAddress,
        "payment_settled",
        now,
        params.operation.operationKey,
      ],
    });
  }
}

async function claimManagedSubmissionExecution(params: {
  now?: Date;
  operationKey: `0x${string}`;
}): Promise<{ record: X402QuestionSubmissionRecord | null; submissionToken: string | null }> {
  const now = params.now ?? new Date();
  const staleBefore = new Date(now.getTime() - SUBMITTING_STALE_MS);
  const submissionToken = randomBytes(16).toString("hex");
  const result = await dbClient.execute({
    sql: `
      UPDATE x402_question_submissions
      SET status = 'submitting',
          submission_token = ?,
          error = NULL,
          updated_at = ?
      WHERE operation_key = ?
        AND status <> 'submitted'
        AND (
          status = 'payment_settled'
          OR status = 'failed'
          OR (status = 'submitting' AND updated_at <= ?)
        )
      RETURNING *
    `,
    args: [submissionToken, now, params.operationKey, staleBefore],
  });

  const record = rowToRecord(result.rows[0]);
  return {
    record,
    submissionToken: record ? submissionToken : null,
  };
}

async function consumeManagedSubmissionExecution(params: {
  now?: Date;
  operationKey: `0x${string}`;
  submissionToken: string;
}) {
  const now = params.now ?? new Date();
  const result = await dbClient.execute({
    sql: `
      UPDATE x402_question_submissions
      SET submission_token = NULL,
          updated_at = ?
      WHERE operation_key = ?
        AND status = 'submitting'
        AND submission_token = ?
      RETURNING *
    `,
    args: [now, params.operationKey, params.submissionToken],
  });

  return rowToRecord(result.rows[0]);
}

async function updateSubmissionStatus(params: {
  operationKey: `0x${string}`;
  status: X402QuestionSubmissionStatus;
  bundleId?: bigint | null;
  contentId?: bigint | null;
  contentIds?: bigint[];
  rewardPoolId?: bigint | null;
  transactionHashes?: Hex[];
  error?: string | null;
}) {
  const now = new Date();
  await dbClient.execute({
    sql: `
      UPDATE x402_question_submissions
      SET status = ?,
          bundle_id = ?,
          content_id = ?,
          content_ids = ?,
          reward_pool_id = ?,
          transaction_hashes = ?,
          error = ?,
          submitted_at = CASE WHEN ? = 'submitted' THEN ? ELSE submitted_at END,
          updated_at = ?
      WHERE operation_key = ?
    `,
    args: [
      params.status,
      params.bundleId === undefined ? null : (params.bundleId?.toString() ?? null),
      params.contentId === undefined ? null : (params.contentId?.toString() ?? null),
      params.contentIds === undefined ? null : JSON.stringify(params.contentIds.map(contentId => contentId.toString())),
      params.rewardPoolId === undefined ? null : (params.rewardPoolId?.toString() ?? null),
      params.transactionHashes === undefined ? null : JSON.stringify(params.transactionHashes),
      params.error ?? null,
      params.status,
      now,
      now,
      params.operationKey,
    ],
  });
}

function parseStoredTransactionHashes(value: string | null): Hex[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((entry): entry is Hex => typeof entry === "string") : [];
  } catch {
    return [];
  }
}

function parseStoredContentIds(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string") : [];
  } catch {
    return [];
  }
}

function getPayerAddress(paymentReceipt: unknown): string | null {
  if (!paymentReceipt || typeof paymentReceipt !== "object") return null;
  const receipt = paymentReceipt as Record<string, unknown>;
  const candidates = [receipt.payer, receipt.from, receipt.source, receipt.sender];
  const payer = candidates.find((value): value is string => typeof value === "string" && isAddress(value));
  return payer ?? null;
}

function getRpcUrl(config: X402QuestionSubmissionConfig["targetNetwork"]): string | null {
  return config.rpcUrls.default.http[0] ?? null;
}

export function getX402QuestionFallbackChainId(): number | undefined {
  return getPrimaryServerTargetNetwork()?.id;
}

export function resolveX402QuestionConfig(
  chainId: number,
  options: { requireThirdwebSecret?: boolean } = {},
): X402QuestionSubmissionConfig {
  const targetNetwork = getServerTargetNetworkById(chainId);
  if (!targetNetwork) {
    throw new X402QuestionConfigError(`Chain ${chainId} is not configured for this server.`);
  }

  const usdcAddress = getX402UsdcAddressOverride() ?? X402_CELO_USDC_BY_CHAIN_ID[chainId];
  if (!usdcAddress || !isAddress(usdcAddress)) {
    throw new X402QuestionConfigError("x402 question submissions require Celo or Celo Sepolia USDC.");
  }

  const contentRegistryAddress = getSharedDeploymentAddress(chainId, "ContentRegistry");
  const questionRewardPoolEscrowAddress = getSharedDeploymentAddress(chainId, "QuestionRewardPoolEscrow");
  if (!contentRegistryAddress || !questionRewardPoolEscrowAddress) {
    throw new X402QuestionConfigError("Curyo contracts are not deployed for the requested chain.");
  }

  const thirdwebSecretKey = getThirdwebSecretKey();
  if (!thirdwebSecretKey && options.requireThirdwebSecret !== false) {
    throw new X402QuestionConfigError("THIRDWEB_SECRET_KEY is required for x402 settlement.");
  }

  const executorPrivateKey = getX402ExecutorPrivateKey();
  if (!executorPrivateKey) {
    throw new X402QuestionConfigError("CURYO_X402_EXECUTOR_PRIVATE_KEY is required for x402 question submission.");
  }

  const rpcUrl = getRpcUrl(targetNetwork);
  if (!rpcUrl) {
    throw new X402QuestionConfigError(`No RPC URL is configured for chain ${chainId}.`);
  }

  const account = privateKeyToAccount(executorPrivateKey);

  return {
    chainId,
    contentRegistryAddress,
    executorAddress: account.address,
    executorPrivateKey,
    questionRewardPoolEscrowAddress,
    rpcUrl,
    serviceFeeAmount: getX402ServiceFeeUsdc(),
    targetNetwork,
    thirdwebSecretKey: thirdwebSecretKey ?? null,
    usdcAddress,
    waitUntil: getX402PaymentWaitUntil(),
  };
}

function getQuestionSubmissionDependencies() {
  return {
    executeX402QuestionSubmission:
      x402QuestionSubmissionTestOverrides?.executeX402QuestionSubmission ?? executeX402QuestionSubmission,
    preflightX402QuestionSubmission:
      x402QuestionSubmissionTestOverrides?.preflightX402QuestionSubmission ?? preflightX402QuestionSubmission,
    resolveX402QuestionConfig: x402QuestionSubmissionTestOverrides?.resolveX402QuestionConfig ?? resolveX402QuestionConfig,
  };
}

function createViemClients(config: X402QuestionSubmissionConfig) {
  const account = privateKeyToAccount(config.executorPrivateKey);
  const chain = config.targetNetwork;
  const transport = http(config.rpcUrl);

  return {
    account,
    publicClient: createPublicClient({ chain, transport }),
    walletClient: createWalletClient({ account, chain, transport }),
  };
}

type X402PublicClient = ReturnType<typeof createViemClients>["publicClient"];
type X402WalletClient = ReturnType<typeof createViemClients>["walletClient"];

async function waitForSuccessfulReceipt(publicClient: X402PublicClient, hash: Hex): Promise<TransactionReceipt> {
  const receipt = await publicClient.waitForTransactionReceipt({
    hash,
    timeout: TX_RECEIPT_TIMEOUT_MS,
  });
  if (receipt.status !== "success") {
    throw new Error(`Transaction reverted: ${hash}`);
  }

  return receipt;
}

async function assertBountyMeetsProtocolMinimum(params: {
  config: X402QuestionSubmissionConfig;
  payload: X402QuestionPayload;
  publicClient: X402PublicClient;
}) {
  const protocolConfigAddress = (await params.publicClient.readContract({
    address: params.config.contentRegistryAddress,
    abi: ContentRegistryAbi,
    functionName: "protocolConfig",
  })) as Address;
  const minimum = (await params.publicClient.readContract({
    address: protocolConfigAddress,
    abi: ProtocolConfigAbi,
    functionName: "minSubmissionUsdcPool",
  })) as bigint;

  if (params.payload.bounty.amount < minimum) {
    throw new X402QuestionConflictError(
      `Bounty is below the on-chain USDC minimum (${minimum.toString()} atomic units).`,
    );
  }

  if (params.payload.bounty.requiredVoters > params.payload.roundConfig.maxVoters) {
    throw new X402QuestionConflictError("Bounty voter requirement exceeds the selected question voter cap.");
  }

  await params.publicClient.readContract({
    address: protocolConfigAddress,
    abi: ProtocolConfigAbi,
    functionName: "validateRoundConfig",
    args: [
      params.payload.roundConfig.epochDuration,
      params.payload.roundConfig.maxDuration,
      params.payload.roundConfig.minVoters,
      params.payload.roundConfig.maxVoters,
    ],
  });
}

async function preflightX402QuestionSubmissionWithClient(params: {
  config: X402QuestionSubmissionConfig;
  payload: X402QuestionPayload;
  publicClient: X402PublicClient;
}): Promise<{ resolvedCategoryIds: bigint[]; submissionKeys: Hex[] }> {
  await assertBountyMeetsProtocolMinimum(params);

  const resolvedCategoryIds: bigint[] = [];
  const submissionKeys: Hex[] = [];
  const seenSubmissionKeys = new Set<Hex>();

  for (const [index, question] of params.payload.questions.entries()) {
    const [resolvedCategoryId, submissionKey] = (await params.publicClient.readContract({
      address: params.config.contentRegistryAddress,
      abi: ContentRegistryAbi,
      functionName: "previewQuestionSubmissionKey",
      args: [
        question.contextUrl,
        question.imageUrls,
        question.videoUrl,
        question.title,
        question.description,
        question.tags,
        question.categoryId,
      ],
    })) as readonly [bigint, Hex];
    if (resolvedCategoryId !== question.categoryId) {
      throw new X402QuestionConflictError(
        `Question ${index + 1} category ${question.categoryId.toString()} resolves to ${resolvedCategoryId.toString()}.`,
      );
    }

    const submissionKeyUsed = (await params.publicClient.readContract({
      address: params.config.contentRegistryAddress,
      abi: ContentRegistryAbi,
      functionName: "submissionKeyUsed",
      args: [submissionKey],
    })) as boolean;
    if (submissionKeyUsed || seenSubmissionKeys.has(submissionKey)) {
      throw new X402QuestionConflictError(`Question ${index + 1} has already been submitted.`);
    }

    resolvedCategoryIds.push(resolvedCategoryId);
    submissionKeys.push(submissionKey);
    seenSubmissionKeys.add(submissionKey);
  }

  return { resolvedCategoryIds, submissionKeys };
}

export async function preflightX402QuestionSubmission(params: {
  config: X402QuestionSubmissionConfig;
  payload: X402QuestionPayload;
}): Promise<{
  operation: X402QuestionOperation;
  paymentAmount: bigint;
  resolvedCategoryIds: bigint[];
  submissionKeys: Hex[];
}> {
  const operation = buildX402QuestionOperation(params.payload);
  const { publicClient } = createViemClients(params.config);
  const preflight = await preflightX402QuestionSubmissionWithClient({
    config: params.config,
    payload: params.payload,
    publicClient,
  });

  return {
    operation,
    paymentAmount: params.payload.bounty.amount + params.config.serviceFeeAmount,
    ...preflight,
  };
}

async function ensureUsdcAllowance(params: {
  amount: bigint;
  config: X402QuestionSubmissionConfig;
  publicClient: X402PublicClient;
  walletClient: X402WalletClient;
}): Promise<Hex | null> {
  const allowance = (await params.publicClient.readContract({
    address: params.config.usdcAddress,
    abi: erc20Abi,
    functionName: "allowance",
    args: [params.config.executorAddress, params.config.questionRewardPoolEscrowAddress],
  })) as bigint;

  if (allowance >= params.amount) {
    return null;
  }

  const approveHash = await params.walletClient.writeContract({
    address: params.config.usdcAddress,
    abi: erc20Abi,
    chain: params.config.targetNetwork,
    functionName: "approve",
    args: [params.config.questionRewardPoolEscrowAddress, params.amount],
  });
  await waitForSuccessfulReceipt(params.publicClient, approveHash);
  return approveHash;
}

function readSubmissionResult(receipt: TransactionReceipt): {
  bundleId: bigint | null;
  contentIds: bigint[];
  rewardPoolId: bigint | null;
} {
  let bundleId: bigint | null = null;
  const contentIds: bigint[] = [];
  let rewardPoolId: bigint | null = null;

  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: ContentRegistryAbi,
        data: log.data,
        topics: log.topics,
      }) as { eventName: string; args: Record<string, unknown> };

      if (decoded.eventName === "ContentSubmitted" && typeof decoded.args.contentId === "bigint") {
        contentIds.push(decoded.args.contentId);
      }
      if (decoded.eventName === "QuestionBundleSubmitted") {
        if (typeof decoded.args.bundleId === "bigint") {
          bundleId = decoded.args.bundleId;
        }
        if (typeof decoded.args.rewardPoolId === "bigint") {
          rewardPoolId = decoded.args.rewardPoolId;
        }
      } else if (
        decoded.eventName === "SubmissionRewardPoolAttached" &&
        typeof decoded.args.rewardPoolId === "bigint"
      ) {
        rewardPoolId = decoded.args.rewardPoolId;
      }
    } catch {
      // Ignore logs from token transfers and other contracts in the same receipt.
    }
  }

  return { bundleId, contentIds, rewardPoolId };
}

async function executeX402QuestionSubmission(params: {
  config: X402QuestionSubmissionConfig;
  payload: X402QuestionPayload;
}): Promise<{ bundleId: bigint | null; contentIds: bigint[]; rewardPoolId: bigint | null; transactionHashes: Hex[] }> {
  const { account, publicClient, walletClient } = createViemClients(params.config);
  await preflightX402QuestionSubmissionWithClient({
    config: params.config,
    payload: params.payload,
    publicClient,
  });

  const salts = params.payload.questions.map(() => `0x${randomBytes(32).toString("hex")}` as Hex);
  const revealCommitment = buildQuestionBundleSubmissionRevealCommitment({
    questions: params.payload.questions.map((question, index) => ({
      categoryId: question.categoryId,
      contextUrl: question.contextUrl,
      description: question.description,
      imageUrls: question.imageUrls,
      salt: salts[index],
      spec: {
        questionMetadataHash: question.questionMetadataHash,
        resultSpecHash: question.resultSpecHash,
      },
      tags: question.tags,
      title: question.title,
      videoUrl: question.videoUrl,
    })),
    rewardAmount: params.payload.bounty.amount,
    rewardAsset: X402_SUBMISSION_REWARD_ASSET_USDC,
    requiredSettledRounds: params.payload.bounty.requiredSettledRounds,
    requiredVoters: params.payload.bounty.requiredVoters,
    rewardPoolExpiresAt: params.payload.bounty.rewardPoolExpiresAt,
    feedbackClosesAt: params.payload.bounty.feedbackClosesAt,
    roundConfig: params.payload.roundConfig,
    submitter: account.address,
  });

  const transactionHashes: Hex[] = [];
  const approvalHash = await ensureUsdcAllowance({
    amount: params.payload.bounty.amount,
    config: params.config,
    publicClient,
    walletClient,
  });
  if (approvalHash) {
    transactionHashes.push(approvalHash);
  }

  const reserveHash = await walletClient.writeContract({
    address: params.config.contentRegistryAddress,
    abi: ContentRegistryAbi,
    chain: params.config.targetNetwork,
    functionName: "reserveSubmission",
    args: [revealCommitment],
  });
  transactionHashes.push(reserveHash);
  await waitForSuccessfulReceipt(publicClient, reserveHash);

  try {
    await sleep(RESERVED_SUBMISSION_WAIT_MS);
    const submitArgs = [
      params.payload.questions.map((question, index) => ({
        contextUrl: question.contextUrl,
        imageUrls: question.imageUrls,
        videoUrl: question.videoUrl,
        title: question.title,
        description: question.description,
        tags: question.tags,
        categoryId: question.categoryId,
        salt: salts[index],
        spec: {
          questionMetadataHash: question.questionMetadataHash,
          resultSpecHash: question.resultSpecHash,
        },
      })),
      {
        asset: X402_SUBMISSION_REWARD_ASSET_USDC,
        amount: params.payload.bounty.amount,
        requiredVoters: params.payload.bounty.requiredVoters,
        requiredSettledRounds: params.payload.bounty.requiredSettledRounds,
        bountyClosesAt: params.payload.bounty.rewardPoolExpiresAt,
        feedbackClosesAt: params.payload.bounty.feedbackClosesAt,
      },
      questionRoundConfigToAbi(params.payload.roundConfig),
    ] as const;
    const { request } = await publicClient.simulateContract({
      account,
      address: params.config.contentRegistryAddress,
      abi: ContentRegistryAbi,
      functionName: "submitQuestionBundleWithRewardAndRoundConfig",
      args: submitArgs,
    });
    const submitHash = await walletClient.writeContract(request);
    transactionHashes.push(submitHash);
    const submitReceipt = await waitForSuccessfulReceipt(publicClient, submitHash);
    const result = readSubmissionResult(submitReceipt);
    if (result.contentIds.length === 0) {
      throw new Error("Submission receipt did not include ContentSubmitted.");
    }

    return {
      bundleId: result.bundleId,
      contentIds: result.contentIds,
      rewardPoolId: result.rewardPoolId,
      transactionHashes,
    };
  } catch (error) {
    try {
      const cancelHash = await walletClient.writeContract({
        address: params.config.contentRegistryAddress,
        abi: ContentRegistryAbi,
        chain: params.config.targetNetwork,
        functionName: "cancelReservedSubmission",
        args: [revealCommitment],
      });
      transactionHashes.push(cancelHash);
      await waitForSuccessfulReceipt(publicClient, cancelHash);
    } catch {
      // The original submit error is more useful to callers than a best-effort cleanup failure.
    }
    throw error;
  }
}

function submissionResponseBody(params: {
  config: X402QuestionSubmissionConfig;
  operation: X402QuestionOperation;
  payload: X402QuestionPayload;
  record?: X402QuestionSubmissionRecord | null;
  result?: { bundleId: bigint | null; contentIds: bigint[]; rewardPoolId: bigint | null; transactionHashes: Hex[] };
}) {
  const contentIds =
    params.result?.contentIds.map(contentId => contentId.toString()) ??
    (params.record?.contentIds ? parseStoredContentIds(params.record.contentIds) : []);
  const contentId = contentIds[0] ?? params.record?.contentId ?? null;
  const bundleId = params.result?.bundleId?.toString() ?? params.record?.bundleId ?? null;
  const rewardPoolId = params.result?.rewardPoolId?.toString() ?? params.record?.rewardPoolId ?? null;
  const transactionHashes =
    params.result?.transactionHashes ?? parseStoredTransactionHashes(params.record?.transactionHashes ?? null);

  return {
    bounty: {
      amount: params.payload.bounty.amount.toString(),
      asset: params.payload.bounty.asset,
      requiredSettledRounds: params.payload.bounty.requiredSettledRounds.toString(),
      requiredVoters: params.payload.bounty.requiredVoters.toString(),
      rewardPoolExpiresAt: params.payload.bounty.rewardPoolExpiresAt.toString(),
      feedbackClosesAt: params.payload.bounty.feedbackClosesAt.toString(),
    },
    chainId: params.payload.chainId,
    bundleId,
    contentId,
    contentIds,
    executorAddress: params.config.executorAddress,
    operationKey: params.operation.operationKey,
    questionCount: params.payload.questions.length,
    roundConfig: serializeQuestionRoundConfig(params.payload.roundConfig),
    payment: {
      amount: (params.payload.bounty.amount + params.config.serviceFeeAmount).toString(),
      asset: params.config.usdcAddress,
      serviceFeeAmount: params.config.serviceFeeAmount.toString(),
    },
    rewardPoolId,
    status: "submitted",
    transactionHashes,
  };
}

export function x402QuestionSubmissionStatusBody(params: {
  config: X402QuestionSubmissionConfig;
  operation: X402QuestionOperation;
  payload: X402QuestionPayload;
  record: X402QuestionSubmissionRecord | null;
}) {
  const transactionHashes = parseStoredTransactionHashes(params.record?.transactionHashes ?? null);
  return {
    bounty: {
      amount: params.payload.bounty.amount.toString(),
      asset: params.payload.bounty.asset,
      requiredSettledRounds: params.payload.bounty.requiredSettledRounds.toString(),
      requiredVoters: params.payload.bounty.requiredVoters.toString(),
      rewardPoolExpiresAt: params.payload.bounty.rewardPoolExpiresAt.toString(),
      feedbackClosesAt: params.payload.bounty.feedbackClosesAt.toString(),
    },
    chainId: params.payload.chainId,
    bundleId: params.record?.bundleId ?? null,
    contentId: params.record?.contentId ?? null,
    contentIds: params.record?.contentIds ? parseStoredContentIds(params.record.contentIds) : [],
    error: params.record?.error ?? null,
    executorAddress: params.config.executorAddress,
    operationKey: params.operation.operationKey,
    questionCount: params.payload.questions.length,
    roundConfig: serializeQuestionRoundConfig(params.payload.roundConfig),
    payment: {
      amount: (params.payload.bounty.amount + params.config.serviceFeeAmount).toString(),
      asset: params.config.usdcAddress,
      serviceFeeAmount: params.config.serviceFeeAmount.toString(),
    },
    rewardPoolId: params.record?.rewardPoolId ?? null,
    status: params.record?.status ?? "not_found",
    transactionHashes,
  };
}

export function x402QuestionSubmissionRecordBody(record: X402QuestionSubmissionRecord | null) {
  if (!record) {
    return {
      status: "not_found",
    };
  }

  return {
    bounty: {
      amount: record.bountyAmount,
      asset: "USDC",
    },
    bundleId: record.bundleId,
    chainId: record.chainId,
    clientRequestId: record.clientRequestId,
    contentId: record.contentId,
    contentIds: record.contentIds ? parseStoredContentIds(record.contentIds) : [],
    error: record.error,
    operationKey: record.operationKey,
    payerAddress: record.payerAddress,
    payloadHash: record.payloadHash,
    payment: {
      amount: record.paymentAmount,
      asset: record.paymentAsset,
      serviceFeeAmount: record.serviceFeeAmount,
    },
    questionCount: record.questionCount,
    rewardPoolId: record.rewardPoolId,
    status: record.status,
    transactionHashes: parseStoredTransactionHashes(record.transactionHashes),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export async function handleX402QuestionSubmissionRequest(params: {
  payload: X402QuestionPayload;
  request: Request;
}): Promise<{ body: unknown; headers?: Record<string, string>; status: number }> {
  const dependencies = getQuestionSubmissionDependencies();
  const config = dependencies.resolveX402QuestionConfig(params.payload.chainId);
  const operation = buildX402QuestionOperation(params.payload);
  const existingRecord = await getX402QuestionSubmissionByClientRequest({
    chainId: params.payload.chainId,
    clientRequestId: params.payload.clientRequestId,
  });

  if (existingRecord && existingRecord.payloadHash !== operation.payloadHash) {
    throw new X402QuestionConflictError("clientRequestId has already been used for a different question payload.");
  }

  if (existingRecord?.status === "submitted") {
    return {
      body: submissionResponseBody({ config, operation, payload: params.payload, record: existingRecord }),
      status: 200,
    };
  }

  if (
    existingRecord?.status === "submitting" &&
    Number.isFinite(existingRecord.updatedAt.getTime()) &&
    Date.now() - existingRecord.updatedAt.getTime() < SUBMITTING_STALE_MS
  ) {
    throw new X402QuestionConflictError("This x402 question submission is already being processed.");
  }

  const totalPaymentAmount = params.payload.bounty.amount + config.serviceFeeAmount;
  await dependencies.preflightX402QuestionSubmission({
    config,
    payload: params.payload,
  });

  let responseHeaders: Record<string, string> | undefined;
  if (!existingRecord?.paymentReceipt) {
    if (!config.thirdwebSecretKey) {
      throw new X402QuestionConfigError("THIRDWEB_SECRET_KEY is required for x402 settlement.");
    }
    const thirdwebClient = createThirdwebClient({ secretKey: config.thirdwebSecretKey });
    const thirdwebFacilitator = facilitator({
      client: thirdwebClient,
      serverWalletAddress: config.executorAddress,
    });
    const paymentData = params.request.headers.get("PAYMENT-SIGNATURE") ?? params.request.headers.get("X-PAYMENT");
    const paymentResult = await settlePayment({
      extraMetadata: {
        bountyAmount: params.payload.bounty.amount.toString(),
        clientRequestId: params.payload.clientRequestId,
        operationKey: operation.operationKey,
        serviceFeeAmount: config.serviceFeeAmount.toString(),
      },
      facilitator: thirdwebFacilitator,
      method: params.request.method,
      network: defineChain(config.targetNetwork),
      payTo: config.executorAddress,
      paymentData,
      price: {
        amount: totalPaymentAmount.toString(),
        asset: {
          address: config.usdcAddress as `0x${string}`,
          decimals: X402_USDC_DECIMALS,
        },
      },
      resourceUrl: params.request.url,
      routeConfig: {
        description: "Submit a Curyo question and fund its USDC bounty",
        mimeType: "application/json",
      },
      waitUntil: config.waitUntil,
    });

    if (paymentResult.status !== 200) {
      return {
        body: paymentResult.responseBody,
        headers: paymentResult.responseHeaders,
        status: paymentResult.status,
      };
    }

    responseHeaders = paymentResult.responseHeaders;
    await recordPaymentSettlement({
      config,
      operation,
      payerAddress: getPayerAddress(paymentResult.paymentReceipt),
      payload: params.payload,
      paymentAmount: totalPaymentAmount,
      paymentReceipt: paymentResult.paymentReceipt,
    });
  }

  await updateSubmissionStatus({
    operationKey: operation.operationKey,
    status: "submitting",
  });

  try {
    const result = await dependencies.executeX402QuestionSubmission({
      config,
      payload: params.payload,
    });
    await updateSubmissionStatus({
      bundleId: result.bundleId,
      contentId: result.contentIds[0] ?? null,
      contentIds: result.contentIds,
      operationKey: operation.operationKey,
      rewardPoolId: result.rewardPoolId,
      status: "submitted",
      transactionHashes: result.transactionHashes,
    });

    return {
      body: submissionResponseBody({ config, operation, payload: params.payload, result }),
      headers: responseHeaders,
      status: 200,
    };
  } catch (error) {
    await updateSubmissionStatus({
      error: error instanceof Error ? error.message : String(error),
      operationKey: operation.operationKey,
      status: "failed",
    });
    throw error;
  }
}

export async function handleManagedQuestionSubmissionRequest(params: {
  agentId: string;
  payload: X402QuestionPayload;
}): Promise<{ body: unknown; status: number }> {
  const started = await startManagedQuestionSubmissionRequest(params);
  if (!started.shouldSubmit) {
    const body = started.body as Record<string, unknown>;
    if (body.status === "submitted") {
      return {
        body: started.body,
        status: 200,
      };
    }
    throw new X402QuestionConflictError("This managed MCP question submission is already being processed.");
  }

  return completeManagedQuestionSubmissionRequest({
    ...params,
    submissionToken: started.submissionToken,
  });
}

export async function startManagedQuestionSubmissionRequest(params: {
  agentId: string;
  payload: X402QuestionPayload;
}): Promise<{ body: unknown; shouldSubmit: boolean; status: number; submissionToken?: string | null }> {
  const dependencies = getQuestionSubmissionDependencies();
  const config = dependencies.resolveX402QuestionConfig(params.payload.chainId, { requireThirdwebSecret: false });
  const operation = buildX402QuestionOperation(params.payload);
  const existingRecord = await getX402QuestionSubmissionByClientRequest({
    chainId: params.payload.chainId,
    clientRequestId: params.payload.clientRequestId,
  });

  if (existingRecord && existingRecord.payloadHash !== operation.payloadHash) {
    throw new X402QuestionConflictError("clientRequestId has already been used for a different question payload.");
  }

  if (existingRecord?.status === "submitted") {
    return {
      body: submissionResponseBody({ config, operation, payload: params.payload, record: existingRecord }),
      shouldSubmit: false,
      status: 200,
    };
  }

  if (
    existingRecord?.status === "submitting" &&
    Number.isFinite(existingRecord.updatedAt.getTime()) &&
    Date.now() - existingRecord.updatedAt.getTime() < SUBMITTING_STALE_MS
  ) {
    return {
      body: x402QuestionSubmissionStatusBody({ config, operation, payload: params.payload, record: existingRecord }),
      shouldSubmit: false,
      status: 202,
    };
  }

  const preflight = await dependencies.preflightX402QuestionSubmission({
    config,
    payload: params.payload,
  });

  if (!existingRecord?.paymentReceipt) {
    await recordPaymentSettlement({
      config,
      operation,
      payerAddress: params.agentId,
      paymentAmount: preflight.paymentAmount,
      paymentReceipt: {
        agentId: params.agentId,
        mode: "mcp-managed",
        operationKey: operation.operationKey,
        reservedAt: new Date().toISOString(),
      },
      payload: params.payload,
    });
  }

  const claimed = await claimManagedSubmissionExecution({
    operationKey: operation.operationKey,
  });
  const submittingRecord = claimed.record ?? (await getX402QuestionSubmissionByOperationKey(operation.operationKey));
  return {
    body: x402QuestionSubmissionStatusBody({ config, operation, payload: params.payload, record: submittingRecord }),
    shouldSubmit: !!claimed.submissionToken,
    status: submittingRecord?.status === "submitted" ? 200 : 202,
    submissionToken: claimed.submissionToken,
  };
}

export async function completeManagedQuestionSubmissionRequest(params: {
  agentId: string;
  payload: X402QuestionPayload;
  submissionToken?: string | null;
}): Promise<{ body: unknown; status: number }> {
  const dependencies = getQuestionSubmissionDependencies();
  const config = dependencies.resolveX402QuestionConfig(params.payload.chainId, { requireThirdwebSecret: false });
  const operation = buildX402QuestionOperation(params.payload);
  const existingRecord = await getX402QuestionSubmissionByClientRequest({
    chainId: params.payload.chainId,
    clientRequestId: params.payload.clientRequestId,
  });

  if (existingRecord && existingRecord.payloadHash !== operation.payloadHash) {
    throw new X402QuestionConflictError("clientRequestId has already been used for a different question payload.");
  }

  if (existingRecord?.status === "submitted") {
    return {
      body: submissionResponseBody({ config, operation, payload: params.payload, record: existingRecord }),
      status: 200,
    };
  }

  if (!existingRecord?.paymentReceipt) {
    throw new X402QuestionConflictError("This managed MCP question submission has not been started.");
  }

  if (!params.submissionToken) {
    throw new X402QuestionConflictError("This managed MCP question submission is already being processed.");
  }

  const claimedRecord = await consumeManagedSubmissionExecution({
    operationKey: operation.operationKey,
    submissionToken: params.submissionToken,
  });
  if (!claimedRecord) {
    const currentRecord = await getX402QuestionSubmissionByOperationKey(operation.operationKey);
    if (currentRecord?.status === "submitted") {
      return {
        body: submissionResponseBody({ config, operation, payload: params.payload, record: currentRecord }),
        status: 200,
      };
    }
    throw new X402QuestionConflictError("This managed MCP question submission is already being processed.");
  }

  try {
    const result = await dependencies.executeX402QuestionSubmission({
      config,
      payload: params.payload,
    });
    await updateSubmissionStatus({
      bundleId: result.bundleId,
      contentId: result.contentIds[0] ?? null,
      contentIds: result.contentIds,
      operationKey: operation.operationKey,
      rewardPoolId: result.rewardPoolId,
      status: "submitted",
      transactionHashes: result.transactionHashes,
    });

    return {
      body: submissionResponseBody({ config, operation, payload: params.payload, result }),
      status: 200,
    };
  } catch (error) {
    await updateSubmissionStatus({
      error: error instanceof Error ? error.message : String(error),
      operationKey: operation.operationKey,
      status: "failed",
    });
    throw error;
  }
}

export function __setX402QuestionSubmissionTestOverridesForTests(value: X402QuestionSubmissionTestOverrides | null) {
  x402QuestionSubmissionTestOverrides = value;
}
