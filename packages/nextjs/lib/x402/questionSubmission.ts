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
import { buildQuestionSubmissionRevealCommitment } from "~~/lib/questionSubmissionCommitment";
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
  contentId: string | null;
  rewardPoolId: string | null;
  transactionHashes: string | null;
  paymentReceipt: string | null;
  error: string | null;
  updatedAt: Date;
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

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function rowToRecord(row: Record<string, unknown> | undefined): X402QuestionSubmissionRecord | null {
  if (!row) return null;
  return {
    bountyAmount: String(row.bounty_amount),
    chainId: Number(row.chain_id),
    clientRequestId: String(row.client_request_id),
    contentId: typeof row.content_id === "string" ? row.content_id : null,
    error: typeof row.error === "string" ? row.error : null,
    operationKey: String(row.operation_key) as `0x${string}`,
    payerAddress: typeof row.payer_address === "string" ? row.payer_address : null,
    payloadHash: String(row.payload_hash),
    paymentAmount: String(row.payment_amount),
    paymentAsset: String(row.payment_asset),
    paymentReceipt: typeof row.payment_receipt === "string" ? row.payment_receipt : null,
    rewardPoolId: typeof row.reward_pool_id === "string" ? row.reward_pool_id : null,
    serviceFeeAmount: String(row.service_fee_amount),
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
        status,
        payment_receipt,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(operation_key) DO UPDATE SET
        payer_address = excluded.payer_address,
        payment_receipt = excluded.payment_receipt,
        payment_amount = excluded.payment_amount,
        payment_asset = excluded.payment_asset,
        status = CASE
          WHEN x402_question_submissions.status = 'submitted' THEN x402_question_submissions.status
          ELSE excluded.status
        END,
        error = NULL,
        updated_at = excluded.updated_at
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
      "payment_settled",
      JSON.stringify(params.paymentReceipt),
      now,
      now,
    ],
  });
}

async function updateSubmissionStatus(params: {
  operationKey: `0x${string}`;
  status: X402QuestionSubmissionStatus;
  contentId?: bigint | null;
  rewardPoolId?: bigint | null;
  transactionHashes?: Hex[];
  error?: string | null;
}) {
  const now = new Date();
  await dbClient.execute({
    sql: `
      UPDATE x402_question_submissions
      SET status = ?,
          content_id = ?,
          reward_pool_id = ?,
          transaction_hashes = ?,
          error = ?,
          submitted_at = CASE WHEN ? = 'submitted' THEN ? ELSE submitted_at END,
          updated_at = ?
      WHERE operation_key = ?
    `,
    args: [
      params.status,
      params.contentId === undefined ? null : (params.contentId?.toString() ?? null),
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
}): Promise<{ resolvedCategoryId: bigint; submissionKey: Hex }> {
  await assertBountyMeetsProtocolMinimum(params);

  const [resolvedCategoryId, submissionKey] = (await params.publicClient.readContract({
    address: params.config.contentRegistryAddress,
    abi: ContentRegistryAbi,
    functionName: "previewQuestionSubmissionKey",
    args: [
      params.payload.contextUrl,
      params.payload.imageUrls,
      params.payload.videoUrl,
      params.payload.title,
      params.payload.description,
      params.payload.tags,
      params.payload.categoryId,
    ],
  })) as readonly [bigint, Hex];
  if (resolvedCategoryId !== params.payload.categoryId) {
    throw new X402QuestionConflictError(
      `Requested category ${params.payload.categoryId.toString()} resolves to ${resolvedCategoryId.toString()}.`,
    );
  }

  const submissionKeyUsed = (await params.publicClient.readContract({
    address: params.config.contentRegistryAddress,
    abi: ContentRegistryAbi,
    functionName: "submissionKeyUsed",
    args: [submissionKey],
  })) as boolean;
  if (submissionKeyUsed) {
    throw new X402QuestionConflictError("This question has already been submitted.");
  }

  return { resolvedCategoryId, submissionKey };
}

export async function preflightX402QuestionSubmission(params: {
  config: X402QuestionSubmissionConfig;
  payload: X402QuestionPayload;
}): Promise<{ operation: X402QuestionOperation; paymentAmount: bigint; resolvedCategoryId: bigint; submissionKey: Hex }> {
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
  contentId: bigint | null;
  rewardPoolId: bigint | null;
} {
  let contentId: bigint | null = null;
  let rewardPoolId: bigint | null = null;

  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: ContentRegistryAbi,
        data: log.data,
        topics: log.topics,
      }) as { eventName: string; args: Record<string, unknown> };

      if (decoded.eventName === "ContentSubmitted" && typeof decoded.args.contentId === "bigint") {
        contentId = decoded.args.contentId;
      }
      if (decoded.eventName === "SubmissionRewardPoolAttached" && typeof decoded.args.rewardPoolId === "bigint") {
        rewardPoolId = decoded.args.rewardPoolId;
      }
    } catch {
      // Ignore logs from token transfers and other contracts in the same receipt.
    }
  }

  return { contentId, rewardPoolId };
}

async function executeX402QuestionSubmission(params: {
  config: X402QuestionSubmissionConfig;
  payload: X402QuestionPayload;
}): Promise<{ contentId: bigint; rewardPoolId: bigint | null; transactionHashes: Hex[] }> {
  const { account, publicClient, walletClient } = createViemClients(params.config);
  const { submissionKey } = await preflightX402QuestionSubmissionWithClient({
    config: params.config,
    payload: params.payload,
    publicClient,
  });

  const salt = `0x${randomBytes(32).toString("hex")}` as Hex;
  const revealCommitment = buildQuestionSubmissionRevealCommitment({
    categoryId: params.payload.categoryId,
    description: params.payload.description,
    imageUrls: params.payload.imageUrls,
    rewardAmount: params.payload.bounty.amount,
    rewardAsset: X402_SUBMISSION_REWARD_ASSET_USDC,
    requiredSettledRounds: params.payload.bounty.requiredSettledRounds,
    requiredVoters: params.payload.bounty.requiredVoters,
    rewardPoolExpiresAt: params.payload.bounty.rewardPoolExpiresAt,
    roundConfig: params.payload.roundConfig,
    salt,
    submissionKey,
    submitter: account.address,
    tags: params.payload.tags,
    title: params.payload.title,
    videoUrl: params.payload.videoUrl,
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
      params.payload.contextUrl,
      params.payload.imageUrls,
      params.payload.videoUrl,
      params.payload.title,
      params.payload.description,
      params.payload.tags,
      params.payload.categoryId,
      salt,
      {
        asset: X402_SUBMISSION_REWARD_ASSET_USDC,
        amount: params.payload.bounty.amount,
        requiredVoters: params.payload.bounty.requiredVoters,
        requiredSettledRounds: params.payload.bounty.requiredSettledRounds,
        expiresAt: params.payload.bounty.rewardPoolExpiresAt,
      },
      questionRoundConfigToAbi(params.payload.roundConfig),
    ] as const;
    const { request } = await publicClient.simulateContract({
      account,
      address: params.config.contentRegistryAddress,
      abi: ContentRegistryAbi,
      functionName: "submitQuestionWithRewardAndRoundConfig",
      args: submitArgs,
    });
    const submitHash = await walletClient.writeContract(request);
    transactionHashes.push(submitHash);
    const submitReceipt = await waitForSuccessfulReceipt(publicClient, submitHash);
    const result = readSubmissionResult(submitReceipt);
    if (result.contentId === null) {
      throw new Error("Submission receipt did not include ContentSubmitted.");
    }

    return {
      contentId: result.contentId,
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
  result?: { contentId: bigint; rewardPoolId: bigint | null; transactionHashes: Hex[] };
}) {
  const contentId = params.result?.contentId.toString() ?? params.record?.contentId ?? null;
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
    },
    chainId: params.payload.chainId,
    contentId,
    executorAddress: params.config.executorAddress,
    operationKey: params.operation.operationKey,
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
    },
    chainId: params.payload.chainId,
    contentId: params.record?.contentId ?? null,
    error: params.record?.error ?? null,
    executorAddress: params.config.executorAddress,
    operationKey: params.operation.operationKey,
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
    chainId: record.chainId,
    clientRequestId: record.clientRequestId,
    contentId: record.contentId,
    error: record.error,
    operationKey: record.operationKey,
    payerAddress: record.payerAddress,
    payloadHash: record.payloadHash,
    payment: {
      amount: record.paymentAmount,
      asset: record.paymentAsset,
      serviceFeeAmount: record.serviceFeeAmount,
    },
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
  const config = resolveX402QuestionConfig(params.payload.chainId);
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
  await preflightX402QuestionSubmission({
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
    const result = await executeX402QuestionSubmission({
      config,
      payload: params.payload,
    });
    await updateSubmissionStatus({
      contentId: result.contentId,
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
  const config = resolveX402QuestionConfig(params.payload.chainId, { requireThirdwebSecret: false });
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
    throw new X402QuestionConflictError("This managed MCP question submission is already being processed.");
  }

  const preflight = await preflightX402QuestionSubmission({
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

  await updateSubmissionStatus({
    operationKey: operation.operationKey,
    status: "submitting",
  });

  try {
    const result = await executeX402QuestionSubmission({
      config,
      payload: params.payload,
    });
    await updateSubmissionStatus({
      contentId: result.contentId,
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
