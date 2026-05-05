import { ContentRegistryAbi, ProtocolConfigAbi } from "@curyo/contracts/abis";
import { getSharedDeploymentAddress } from "@curyo/contracts/deployments";
import { createHash } from "crypto";
import "server-only";
import {
  type Address,
  type Hex,
  type TransactionReceipt,
  createPublicClient,
  decodeEventLog,
  encodeAbiParameters,
  encodeFunctionData,
  erc20Abi,
  http,
  isAddress,
  keccak256,
  parseSignature,
} from "viem";
import { dbClient } from "~~/lib/db";
import {
  getPrimaryServerTargetNetwork,
  getServerTargetNetworkById,
  getX402UsdcAddressOverride,
} from "~~/lib/env/server";
import { questionRoundConfigToAbi, serializeQuestionRoundConfig } from "~~/lib/questionRoundConfig";
import {
  buildQuestionBundleSubmissionRevealCommitment,
  buildQuestionSubmissionRevealCommitment,
} from "~~/lib/questionSubmissionCommitment";
import {
  type X402QuestionOperation,
  type X402QuestionPayload,
  X402_CELO_USDC_BY_CHAIN_ID,
  X402_SUBMISSION_REWARD_ASSET_USDC,
  X402_USDC_DECIMALS,
  assertSupportedX402BundleBounty,
  buildX402QuestionOperation,
} from "~~/lib/x402/questionPayload";

const RESERVED_SUBMISSION_WAIT_MS = 1_100;
const TX_RECEIPT_TIMEOUT_MS = 180_000;

export type X402QuestionSubmissionStatus = "awaiting_wallet_signature" | "submitted" | "failed";

type WalletSubmissionReceiptMode =
  | "agent-wallet-plan"
  | "native-x402-authorization"
  | "permissionless-wallet-plan"
  | "permissionless-x402-authorization";

type StoredWalletSubmissionPlanReceipt = {
  expectedContentHashes?: Hex[];
  expectedRewardTerms?: StoredQuestionRewardTerms;
  expectedRoundConfig?: ReturnType<typeof serializeQuestionRoundConfig>;
  operationKey?: string;
  revealCommitment?: Hex;
  walletAddress?: Address;
};

type StoredQuestionRewardTerms = {
  amount: string;
  asset: string;
  bountyClosesAt: string;
  feedbackClosesAt: string;
  requiredSettledRounds: string;
  requiredVoters: string;
};

type SubmittedQuestionContent = {
  contentHash: Hex;
  contentId: bigint;
  submitter: Address;
};

type SubmittedRoundConfig = ReturnType<typeof serializeQuestionRoundConfig>;

type SubmittedRewardAttachment = StoredQuestionRewardTerms & {
  bundleId: bigint | null;
  contentId: bigint | null;
  questionCount: string | null;
  rewardPoolId: bigint | null;
  submitter: Address;
};

export type AgentWalletTransactionPhase =
  | "approve_usdc"
  | "reserve_submission"
  | "submit_question"
  | "submit_x402_question";

export type AgentWalletTransactionCall = {
  data: Hex;
  description: string;
  functionName: string;
  id: string;
  phase: AgentWalletTransactionPhase;
  to: Address;
  value: "0";
  waitAfterMs?: number;
};

export type AgentWalletQuestionSubmissionPlan = {
  chainId: number;
  calls: AgentWalletTransactionCall[];
  operationKey: `0x${string}`;
  payment: {
    amount: string;
    asset: "USDC";
    bountyAmount: string;
    decimals: number;
    spender: Address;
    tokenAddress: Address;
  };
  payloadHash: string;
  questionCount: number;
  requiresOrderedExecution: true;
  revealCommitment: Hex;
  roundConfig: ReturnType<typeof serializeQuestionRoundConfig>;
  submissionKeys: Hex[];
  walletAddress: Address;
};

export type NativeX402PaymentAuthorization = {
  from: Address;
  nonce: Hex;
  signature?: Hex;
  to: Address;
  validAfter: string;
  validBefore: string;
  value: string;
};

export type NativeX402QuestionSubmissionPlan = {
  authorization: NativeX402PaymentAuthorization;
  chainId: number;
  calls: AgentWalletTransactionCall[];
  operationKey: `0x${string}`;
  payment: AgentWalletQuestionSubmissionPlan["payment"];
  payloadHash: string;
  questionCount: number;
  requiresOrderedExecution: true;
  revealCommitment: Hex;
  roundConfig: ReturnType<typeof serializeQuestionRoundConfig>;
  submissionKey: Hex;
  walletAddress: Address;
};

export type X402QuestionSubmissionRecord = {
  operationKey: `0x${string}`;
  clientRequestId: string;
  payloadHash: string;
  chainId: number;
  payerAddress: string | null;
  paymentAsset: string;
  paymentAmount: string;
  bountyAmount: string;
  status: X402QuestionSubmissionStatus;
  bundleId: string | null;
  contentId: string | null;
  contentIds: string | null;
  questionCount: number;
  rewardPoolId: string | null;
  transactionHashes: string | null;
  paymentReceipt: string | null;
  error: string | null;
  updatedAt: Date;
};

function normalizedAddress(value: Address): Lowercase<Address> {
  return value.toLowerCase() as Lowercase<Address>;
}

function isBytes32Hex(value: unknown): value is Hex {
  return typeof value === "string" && /^0x[a-fA-F0-9]{64}$/.test(value);
}

function toDecimalString(value: unknown): string {
  return typeof value === "bigint" || typeof value === "number" || typeof value === "string"
    ? BigInt(value).toString()
    : "";
}

function buildQuestionContentHash(question: X402QuestionPayload["questions"][number]): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "string" },
        { type: "string" },
        { type: "string[]" },
        { type: "string" },
        { type: "string" },
        { type: "string" },
        { type: "string" },
        { type: "uint256" },
        { type: "bytes32" },
        { type: "bytes32" },
      ],
      [
        "curyo-question-context-v2",
        question.contextUrl,
        question.imageUrls,
        question.videoUrl,
        question.title,
        question.description,
        question.tags,
        question.categoryId,
        question.questionMetadataHash,
        question.resultSpecHash,
      ],
    ),
  );
}

function buildExpectedQuestionContentHashes(payload: X402QuestionPayload): Hex[] {
  return payload.questions.map(question => buildQuestionContentHash(question));
}

function serializeExpectedRewardTerms(payload: X402QuestionPayload): StoredQuestionRewardTerms {
  return {
    amount: payload.bounty.amount.toString(),
    asset: X402_SUBMISSION_REWARD_ASSET_USDC.toString(),
    bountyClosesAt: payload.bounty.rewardPoolExpiresAt.toString(),
    feedbackClosesAt: payload.bounty.feedbackClosesAt.toString(),
    requiredSettledRounds: payload.bounty.requiredSettledRounds.toString(),
    requiredVoters: payload.bounty.requiredVoters.toString(),
  };
}

function parseStoredSubmissionPlanReceipt(value: string | null): StoredWalletSubmissionPlanReceipt | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const expectedContentHashes = Array.isArray(parsed.expectedContentHashes)
      ? parsed.expectedContentHashes.filter(isBytes32Hex).map(hash => hash.toLowerCase() as Hex)
      : undefined;
    const expectedRewardTerms =
      parsed.expectedRewardTerms && typeof parsed.expectedRewardTerms === "object"
        ? (parsed.expectedRewardTerms as StoredQuestionRewardTerms)
        : undefined;
    const expectedRoundConfig =
      parsed.expectedRoundConfig && typeof parsed.expectedRoundConfig === "object"
        ? (parsed.expectedRoundConfig as ReturnType<typeof serializeQuestionRoundConfig>)
        : undefined;

    return {
      expectedContentHashes,
      expectedRewardTerms,
      expectedRoundConfig,
      operationKey: typeof parsed.operationKey === "string" ? parsed.operationKey : undefined,
      revealCommitment: isBytes32Hex(parsed.revealCommitment) ? parsed.revealCommitment : undefined,
      walletAddress:
        typeof parsed.walletAddress === "string" && isAddress(parsed.walletAddress)
          ? (parsed.walletAddress as Address)
          : undefined,
    };
  } catch {
    return null;
  }
}

function sameRewardTerms(left: StoredQuestionRewardTerms | undefined, right: StoredQuestionRewardTerms | undefined) {
  return (
    !!left &&
    !!right &&
    left.asset === right.asset &&
    left.amount === right.amount &&
    left.requiredVoters === right.requiredVoters &&
    left.requiredSettledRounds === right.requiredSettledRounds &&
    left.bountyClosesAt === right.bountyClosesAt &&
    left.feedbackClosesAt === right.feedbackClosesAt
  );
}

function sameRoundConfig(left: SubmittedRoundConfig | undefined, right: SubmittedRoundConfig | undefined) {
  return (
    !!left &&
    !!right &&
    left.epochDuration === right.epochDuration &&
    left.maxDuration === right.maxDuration &&
    left.minVoters === right.minVoters &&
    left.maxVoters === right.maxVoters
  );
}

export function buildPermissionlessWalletClientRequestId(params: {
  chainId: number;
  clientRequestId: string;
  walletAddress: Address;
}) {
  const walletAddress = normalizedAddress(params.walletAddress);
  return `wallet:${createHash("sha256")
    .update(`${params.chainId}:${walletAddress}:${params.clientRequestId}`)
    .digest("hex")
    .slice(0, 48)}`;
}

export function toPermissionlessWalletPayload(
  payload: X402QuestionPayload,
  walletAddress: Address,
): X402QuestionPayload {
  return {
    ...payload,
    clientRequestId: buildPermissionlessWalletClientRequestId({
      chainId: payload.chainId,
      clientRequestId: payload.clientRequestId,
      walletAddress,
    }),
  };
}

type X402QuestionSubmissionTestOverrides = {
  buildAgentWalletQuestionSubmissionPlan?: typeof buildAgentWalletQuestionSubmissionPlan;
  buildNativeX402QuestionSubmissionPlan?: typeof buildNativeX402QuestionSubmissionPlan;
  preflightX402QuestionSubmission?: typeof preflightX402QuestionSubmission;
  resolveX402QuestionConfig?: typeof resolveX402QuestionConfig;
  waitForSuccessfulReceipt?: typeof waitForSuccessfulReceipt;
};

type X402QuestionSubmissionConfig = {
  chainId: number;
  contentRegistryAddress: Address;
  questionRewardPoolEscrowAddress: Address;
  rpcUrl: string;
  targetNetwork: NonNullable<ReturnType<typeof getPrimaryServerTargetNetwork>>;
  usdcAddress: Address;
  x402QuestionSubmitterAddress?: Address;
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

const X402QuestionSubmitterAbi = [
  {
    inputs: [
      {
        components: [
          { name: "url", type: "string" },
          { name: "title", type: "string" },
          { name: "description", type: "string" },
          { name: "tags", type: "string" },
          { name: "categoryId", type: "uint256" },
        ],
        name: "metadata",
        type: "tuple",
      },
      { name: "imageUrls", type: "string[]" },
      { name: "videoUrl", type: "string" },
      { name: "salt", type: "bytes32" },
      {
        components: [
          { name: "asset", type: "uint8" },
          { name: "amount", type: "uint256" },
          { name: "requiredVoters", type: "uint256" },
          { name: "requiredSettledRounds", type: "uint256" },
          { name: "bountyClosesAt", type: "uint256" },
          { name: "feedbackClosesAt", type: "uint256" },
        ],
        name: "rewardTerms",
        type: "tuple",
      },
      {
        components: [
          { name: "epochDuration", type: "uint32" },
          { name: "maxDuration", type: "uint32" },
          { name: "minVoters", type: "uint16" },
          { name: "maxVoters", type: "uint16" },
        ],
        name: "roundConfig",
        type: "tuple",
      },
      {
        components: [
          { name: "questionMetadataHash", type: "bytes32" },
          { name: "resultSpecHash", type: "bytes32" },
        ],
        name: "spec",
        type: "tuple",
      },
      { name: "payer", type: "address" },
      { name: "payee", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
    ],
    name: "computeX402QuestionPaymentNonce",
    outputs: [{ name: "", type: "bytes32" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "contextUrl", type: "string" },
      { name: "imageUrls", type: "string[]" },
      { name: "videoUrl", type: "string" },
      { name: "title", type: "string" },
      { name: "description", type: "string" },
      { name: "tags", type: "string" },
      { name: "categoryId", type: "uint256" },
      { name: "salt", type: "bytes32" },
      {
        components: [
          { name: "asset", type: "uint8" },
          { name: "amount", type: "uint256" },
          { name: "requiredVoters", type: "uint256" },
          { name: "requiredSettledRounds", type: "uint256" },
          { name: "bountyClosesAt", type: "uint256" },
          { name: "feedbackClosesAt", type: "uint256" },
        ],
        name: "rewardTerms",
        type: "tuple",
      },
      {
        components: [
          { name: "epochDuration", type: "uint32" },
          { name: "maxDuration", type: "uint32" },
          { name: "minVoters", type: "uint16" },
          { name: "maxVoters", type: "uint16" },
        ],
        name: "roundConfig",
        type: "tuple",
      },
      {
        components: [
          { name: "questionMetadataHash", type: "bytes32" },
          { name: "resultSpecHash", type: "bytes32" },
        ],
        name: "spec",
        type: "tuple",
      },
      {
        components: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "validAfter", type: "uint256" },
          { name: "validBefore", type: "uint256" },
          { name: "nonce", type: "bytes32" },
          { name: "v", type: "uint8" },
          { name: "r", type: "bytes32" },
          { name: "s", type: "bytes32" },
        ],
        name: "paymentAuthorization",
        type: "tuple",
      },
    ],
    name: "submitQuestionWithX402Payment",
    outputs: [{ name: "contentId", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

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

function getRpcUrl(config: X402QuestionSubmissionConfig["targetNetwork"]): string | null {
  return config.rpcUrls.default.http[0] ?? null;
}

export function getX402QuestionFallbackChainId(): number | undefined {
  return getPrimaryServerTargetNetwork()?.id;
}

export function resolveX402QuestionConfig(chainId: number): X402QuestionSubmissionConfig {
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
  const x402QuestionSubmitterAddress = getSharedDeploymentAddress(chainId, "X402QuestionSubmitter");
  if (!contentRegistryAddress || !questionRewardPoolEscrowAddress || !x402QuestionSubmitterAddress) {
    throw new X402QuestionConfigError("Curyo contracts are not deployed for the requested chain.");
  }

  const rpcUrl = getRpcUrl(targetNetwork);
  if (!rpcUrl) {
    throw new X402QuestionConfigError(`No RPC URL is configured for chain ${chainId}.`);
  }

  return {
    chainId,
    contentRegistryAddress,
    questionRewardPoolEscrowAddress,
    rpcUrl,
    targetNetwork,
    usdcAddress,
    x402QuestionSubmitterAddress,
  };
}

function getQuestionSubmissionDependencies() {
  return {
    buildAgentWalletQuestionSubmissionPlan:
      x402QuestionSubmissionTestOverrides?.buildAgentWalletQuestionSubmissionPlan ??
      buildAgentWalletQuestionSubmissionPlan,
    buildNativeX402QuestionSubmissionPlan:
      x402QuestionSubmissionTestOverrides?.buildNativeX402QuestionSubmissionPlan ??
      buildNativeX402QuestionSubmissionPlan,
    preflightX402QuestionSubmission:
      x402QuestionSubmissionTestOverrides?.preflightX402QuestionSubmission ?? preflightX402QuestionSubmission,
    resolveX402QuestionConfig:
      x402QuestionSubmissionTestOverrides?.resolveX402QuestionConfig ?? resolveX402QuestionConfig,
    waitForSuccessfulReceipt: x402QuestionSubmissionTestOverrides?.waitForSuccessfulReceipt ?? waitForSuccessfulReceipt,
  };
}

function createPublicQuestionClient(config: X402QuestionSubmissionConfig) {
  return createPublicClient({ chain: config.targetNetwork, transport: http(config.rpcUrl) });
}

type X402PublicClient = ReturnType<typeof createPublicQuestionClient>;

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
  assertSupportedX402BundleBounty(params.payload.bounty);

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
  const publicClient = createPublicQuestionClient(params.config);
  const preflight = await preflightX402QuestionSubmissionWithClient({
    config: params.config,
    payload: params.payload,
    publicClient,
  });

  return {
    operation,
    paymentAmount: params.payload.bounty.amount,
    ...preflight,
  };
}

function buildDeterministicQuestionSalt(params: {
  index: number;
  operationKey: Hex;
  payloadHash: string;
  submissionKey: Hex;
  walletAddress: Address;
}) {
  return `0x${createHash("sha256")
    .update(
      [
        "curyo",
        "agent-wallet-question-salt",
        params.operationKey,
        params.payloadHash,
        params.walletAddress.toLowerCase(),
        params.submissionKey,
        params.index.toString(),
      ].join(":"),
    )
    .digest("hex")}` as Hex;
}

function buildQuestionSubmissionCallContext(params: {
  payload: X402QuestionPayload;
  salts: Hex[];
  submissionKeys: Hex[];
  submitter: Address;
}) {
  const questions = params.payload.questions.map((question, index) => ({
    categoryId: question.categoryId,
    contextUrl: question.contextUrl,
    description: question.description,
    imageUrls: question.imageUrls,
    salt: params.salts[index],
    spec: {
      questionMetadataHash: question.questionMetadataHash,
      resultSpecHash: question.resultSpecHash,
    },
    tags: question.tags,
    title: question.title,
    videoUrl: question.videoUrl,
  }));
  const rewardTerms = {
    asset: X402_SUBMISSION_REWARD_ASSET_USDC,
    amount: params.payload.bounty.amount,
    requiredVoters: params.payload.bounty.requiredVoters,
    requiredSettledRounds: params.payload.bounty.requiredSettledRounds,
    bountyClosesAt: params.payload.bounty.rewardPoolExpiresAt,
    feedbackClosesAt: params.payload.bounty.feedbackClosesAt,
  } as const;
  const roundConfigAbi = questionRoundConfigToAbi(params.payload.roundConfig);
  const isBundleSubmission = questions.length > 1;
  const primaryQuestion = questions[0];
  const primarySubmissionKey = params.submissionKeys[0];
  if (!primaryQuestion || !primarySubmissionKey) {
    throw new Error("Question payload is empty.");
  }

  const revealCommitment = isBundleSubmission
    ? buildQuestionBundleSubmissionRevealCommitment({
        questions,
        rewardAmount: params.payload.bounty.amount,
        rewardAsset: X402_SUBMISSION_REWARD_ASSET_USDC,
        requiredSettledRounds: params.payload.bounty.requiredSettledRounds,
        requiredVoters: params.payload.bounty.requiredVoters,
        rewardPoolExpiresAt: params.payload.bounty.rewardPoolExpiresAt,
        feedbackClosesAt: params.payload.bounty.feedbackClosesAt,
        roundConfig: params.payload.roundConfig,
        submitter: params.submitter,
      })
    : buildQuestionSubmissionRevealCommitment({
        categoryId: primaryQuestion.categoryId,
        description: primaryQuestion.description,
        imageUrls: primaryQuestion.imageUrls,
        questionMetadataHash: primaryQuestion.spec.questionMetadataHash,
        rewardAmount: params.payload.bounty.amount,
        rewardAsset: X402_SUBMISSION_REWARD_ASSET_USDC,
        requiredSettledRounds: params.payload.bounty.requiredSettledRounds,
        requiredVoters: params.payload.bounty.requiredVoters,
        resultSpecHash: primaryQuestion.spec.resultSpecHash,
        rewardPoolExpiresAt: params.payload.bounty.rewardPoolExpiresAt,
        feedbackClosesAt: params.payload.bounty.feedbackClosesAt,
        roundConfig: params.payload.roundConfig,
        salt: primaryQuestion.salt,
        submissionKey: primarySubmissionKey,
        submitter: params.submitter,
        tags: primaryQuestion.tags,
        title: primaryQuestion.title,
        videoUrl: primaryQuestion.videoUrl,
      });

  const submitFunctionName: "submitQuestionBundleWithRewardAndRoundConfig" | "submitQuestionWithRewardAndRoundConfig" =
    isBundleSubmission ? "submitQuestionBundleWithRewardAndRoundConfig" : "submitQuestionWithRewardAndRoundConfig";
  const submitArgs = isBundleSubmission
    ? ([questions, rewardTerms, roundConfigAbi] as const)
    : ([
        primaryQuestion.contextUrl,
        primaryQuestion.imageUrls,
        primaryQuestion.videoUrl,
        primaryQuestion.title,
        primaryQuestion.description,
        primaryQuestion.tags,
        primaryQuestion.categoryId,
        primaryQuestion.salt,
        rewardTerms,
        roundConfigAbi,
        primaryQuestion.spec,
      ] as const);

  return {
    isBundleSubmission,
    primaryQuestion,
    primarySubmissionKey,
    questions,
    revealCommitment,
    rewardTerms,
    roundConfigAbi,
    submitArgs,
    submitFunctionName,
  };
}

export async function buildAgentWalletQuestionSubmissionPlan(params: {
  config: X402QuestionSubmissionConfig;
  payload: X402QuestionPayload;
  walletAddress: Address;
}): Promise<AgentWalletQuestionSubmissionPlan> {
  const publicClient = createPublicQuestionClient(params.config);
  const operation = buildX402QuestionOperation(params.payload);
  const preflight = await preflightX402QuestionSubmissionWithClient({
    config: params.config,
    payload: params.payload,
    publicClient,
  });
  const salts = preflight.submissionKeys.map((submissionKey, index) =>
    buildDeterministicQuestionSalt({
      index,
      operationKey: operation.operationKey,
      payloadHash: operation.payloadHash,
      submissionKey,
      walletAddress: params.walletAddress,
    }),
  );
  const context = buildQuestionSubmissionCallContext({
    payload: params.payload,
    salts,
    submissionKeys: preflight.submissionKeys,
    submitter: params.walletAddress,
  });
  const submitDescription =
    params.payload.questions.length > 1
      ? `Submit ${params.payload.questions.length} question bundle and fund protocol escrow`
      : "Submit question and fund protocol escrow";

  return {
    calls: [
      {
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [params.config.questionRewardPoolEscrowAddress, params.payload.bounty.amount],
        }),
        description: "Approve protocol escrow to pull the exact USDC bounty amount",
        functionName: "approve",
        id: "approve-usdc",
        phase: "approve_usdc",
        to: params.config.usdcAddress,
        value: "0",
      },
      {
        data: encodeFunctionData({
          abi: ContentRegistryAbi,
          functionName: "reserveSubmission",
          args: [context.revealCommitment],
        }),
        description: "Reserve the deterministic question commitment from the wallet signer",
        functionName: "reserveSubmission",
        id: "reserve-submission",
        phase: "reserve_submission",
        to: params.config.contentRegistryAddress,
        value: "0",
        waitAfterMs: RESERVED_SUBMISSION_WAIT_MS,
      },
      {
        data: encodeFunctionData({
          abi: ContentRegistryAbi,
          functionName: context.submitFunctionName,
          args: context.submitArgs as never,
        }),
        description: submitDescription,
        functionName: context.submitFunctionName,
        id: "submit-question",
        phase: "submit_question",
        to: params.config.contentRegistryAddress,
        value: "0",
      },
    ],
    chainId: params.payload.chainId,
    operationKey: operation.operationKey,
    payment: {
      amount: params.payload.bounty.amount.toString(),
      asset: "USDC",
      bountyAmount: params.payload.bounty.amount.toString(),
      decimals: X402_USDC_DECIMALS,
      spender: params.config.questionRewardPoolEscrowAddress,
      tokenAddress: params.config.usdcAddress,
    },
    payloadHash: operation.payloadHash,
    questionCount: params.payload.questions.length,
    requiresOrderedExecution: true,
    revealCommitment: context.revealCommitment,
    roundConfig: serializeQuestionRoundConfig(params.payload.roundConfig),
    submissionKeys: preflight.submissionKeys,
    walletAddress: params.walletAddress,
  };
}

type NativeX402PaymentAuthorizationInput = {
  from?: unknown;
  nonce?: unknown;
  signature?: unknown;
  to?: unknown;
  validAfter?: unknown;
  validBefore?: unknown;
  value?: unknown;
};

function parseUnsignedBigInt(value: unknown, fieldName: string): bigint | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "bigint") return value >= 0n ? value : null;
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 ? BigInt(value) : null;
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return BigInt(value.trim());
  }
  throw new X402QuestionConflictError(`${fieldName} must be a non-negative integer.`);
}

function parseHexBytes(value: unknown, fieldName: string): Hex | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string" && /^0x([0-9a-fA-F]{2})*$/.test(value)) return value as Hex;
  throw new X402QuestionConflictError(`${fieldName} must be hex bytes.`);
}

function parseAddressField(value: unknown, fieldName: string): Address | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string" && isAddress(value, { strict: false })) return value as Address;
  throw new X402QuestionConflictError(`${fieldName} must be an EVM address.`);
}

function normalizeNativeX402AuthorizationInput(
  value: NativeX402PaymentAuthorizationInput | null | undefined,
): Partial<NativeX402PaymentAuthorization> {
  if (!value) return {};
  return {
    from: parseAddressField(value.from, "paymentAuthorization.from") ?? undefined,
    nonce: parseHexBytes(value.nonce, "paymentAuthorization.nonce") ?? undefined,
    signature: parseHexBytes(value.signature, "paymentAuthorization.signature") ?? undefined,
    to: parseAddressField(value.to, "paymentAuthorization.to") ?? undefined,
    validAfter: parseUnsignedBigInt(value.validAfter, "paymentAuthorization.validAfter")?.toString(),
    validBefore: parseUnsignedBigInt(value.validBefore, "paymentAuthorization.validBefore")?.toString(),
    value: parseUnsignedBigInt(value.value, "paymentAuthorization.value")?.toString(),
  };
}

function defaultNativeX402ValidBefore() {
  return BigInt(Math.floor(Date.now() / 1000) + 30 * 60);
}

function getEip3009SignatureParts(signature: Hex) {
  if (signature.length !== 132) {
    throw new X402QuestionConflictError("paymentAuthorization.signature must be a 65-byte EIP-3009 signature.");
  }
  const parsed = parseSignature(signature);
  return {
    r: parsed.r,
    s: parsed.s,
    v: Number(parsed.v ?? BigInt(parsed.yParity + 27)),
  };
}

function buildNativeX402TypedData(params: {
  authorization: NativeX402PaymentAuthorization;
  chainId: number;
  tokenAddress: Address;
}) {
  return {
    domain: {
      chainId: params.chainId,
      name: "USDC",
      verifyingContract: params.tokenAddress,
      version: "2",
    },
    message: {
      from: params.authorization.from,
      nonce: params.authorization.nonce,
      to: params.authorization.to,
      validAfter: params.authorization.validAfter,
      validBefore: params.authorization.validBefore,
      value: params.authorization.value,
    },
    primaryType: "ReceiveWithAuthorization",
    types: {
      ReceiveWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    },
  };
}

export async function buildNativeX402QuestionSubmissionPlan(params: {
  config: X402QuestionSubmissionConfig;
  payload: X402QuestionPayload;
  paymentAuthorization?: NativeX402PaymentAuthorizationInput | null;
  walletAddress: Address;
}): Promise<NativeX402QuestionSubmissionPlan> {
  if (params.payload.questions.length !== 1) {
    throw new X402QuestionConflictError("Native x402 authorization currently supports single-question asks only.");
  }
  if (!params.config.x402QuestionSubmitterAddress) {
    throw new X402QuestionConfigError("Native x402 question submissions require the X402 submitter deployment.");
  }

  const publicClient = createPublicQuestionClient(params.config);
  const operation = buildX402QuestionOperation(params.payload);
  const preflight = await preflightX402QuestionSubmissionWithClient({
    config: params.config,
    payload: params.payload,
    publicClient,
  });
  const submissionKey = preflight.submissionKeys[0];
  if (!submissionKey) throw new X402QuestionConflictError("Question submission key was not available.");

  const salt = buildDeterministicQuestionSalt({
    index: 0,
    operationKey: operation.operationKey,
    payloadHash: operation.payloadHash,
    submissionKey,
    walletAddress: params.walletAddress,
  });
  const context = buildQuestionSubmissionCallContext({
    payload: params.payload,
    salts: [salt],
    submissionKeys: [submissionKey],
    submitter: params.walletAddress,
  });
  const question = context.primaryQuestion;
  const inputAuthorization = normalizeNativeX402AuthorizationInput(params.paymentAuthorization);
  const validAfter = BigInt(inputAuthorization.validAfter ?? "0");
  const validBefore = BigInt(inputAuthorization.validBefore ?? defaultNativeX402ValidBefore().toString());
  if (validBefore <= validAfter) {
    throw new X402QuestionConflictError("paymentAuthorization.validBefore must be greater than validAfter.");
  }

  const computedNonce = (await publicClient.readContract({
    address: params.config.x402QuestionSubmitterAddress,
    abi: X402QuestionSubmitterAbi,
    functionName: "computeX402QuestionPaymentNonce",
    args: [
      {
        categoryId: question.categoryId,
        description: question.description,
        tags: question.tags,
        title: question.title,
        url: question.contextUrl,
      },
      question.imageUrls,
      question.videoUrl,
      question.salt,
      context.rewardTerms,
      context.roundConfigAbi,
      question.spec,
      params.walletAddress,
      params.config.x402QuestionSubmitterAddress,
      params.payload.bounty.amount,
      validAfter,
      validBefore,
    ],
  })) as Hex;
  if (inputAuthorization.nonce && inputAuthorization.nonce.toLowerCase() !== computedNonce.toLowerCase()) {
    throw new X402QuestionConflictError("paymentAuthorization.nonce does not match the Curyo x402 ask payload.");
  }
  if (inputAuthorization.from && inputAuthorization.from.toLowerCase() !== params.walletAddress.toLowerCase()) {
    throw new X402QuestionConflictError("paymentAuthorization.from must match the agent wallet address.");
  }
  if (
    inputAuthorization.to &&
    inputAuthorization.to.toLowerCase() !== params.config.x402QuestionSubmitterAddress.toLowerCase()
  ) {
    throw new X402QuestionConflictError("paymentAuthorization.to must be the Curyo x402 submitter.");
  }
  if (inputAuthorization.value && BigInt(inputAuthorization.value) !== params.payload.bounty.amount) {
    throw new X402QuestionConflictError("paymentAuthorization.value must equal the bounty amount.");
  }

  const authorization: NativeX402PaymentAuthorization = {
    from: params.walletAddress,
    nonce: computedNonce,
    signature: inputAuthorization.signature,
    to: params.config.x402QuestionSubmitterAddress,
    validAfter: validAfter.toString(),
    validBefore: validBefore.toString(),
    value: params.payload.bounty.amount.toString(),
  };
  const calls: AgentWalletTransactionCall[] = authorization.signature
    ? (() => {
        const signatureParts = getEip3009SignatureParts(authorization.signature);
        return [
          {
            data: encodeFunctionData({
              abi: ContentRegistryAbi,
              functionName: "reserveSubmission",
              args: [context.revealCommitment],
            }),
            description: "Reserve the deterministic question commitment from the wallet signer",
            functionName: "reserveSubmission",
            id: "reserve-submission",
            phase: "reserve_submission",
            to: params.config.contentRegistryAddress,
            value: "0",
            waitAfterMs: RESERVED_SUBMISSION_WAIT_MS,
          },
          {
            data: encodeFunctionData({
              abi: X402QuestionSubmitterAbi,
              functionName: "submitQuestionWithX402Payment",
              args: [
                question.contextUrl,
                question.imageUrls,
                question.videoUrl,
                question.title,
                question.description,
                question.tags,
                question.categoryId,
                question.salt,
                context.rewardTerms,
                context.roundConfigAbi,
                question.spec,
                {
                  from: authorization.from,
                  nonce: authorization.nonce,
                  to: authorization.to,
                  validAfter: BigInt(authorization.validAfter),
                  validBefore: BigInt(authorization.validBefore),
                  value: BigInt(authorization.value),
                  v: signatureParts.v,
                  r: signatureParts.r,
                  s: signatureParts.s,
                },
              ],
            }),
            description: "Submit the question and fund protocol escrow with the signed x402 USDC authorization",
            functionName: "submitQuestionWithX402Payment",
            id: "submit-x402-question",
            phase: "submit_x402_question",
            to: params.config.x402QuestionSubmitterAddress,
            value: "0",
          },
        ];
      })()
    : [];

  return {
    authorization,
    calls,
    chainId: params.payload.chainId,
    operationKey: operation.operationKey,
    payment: {
      amount: params.payload.bounty.amount.toString(),
      asset: "USDC",
      bountyAmount: params.payload.bounty.amount.toString(),
      decimals: X402_USDC_DECIMALS,
      spender: params.config.x402QuestionSubmitterAddress,
      tokenAddress: params.config.usdcAddress,
    },
    payloadHash: operation.payloadHash,
    questionCount: params.payload.questions.length,
    requiresOrderedExecution: true,
    revealCommitment: context.revealCommitment,
    roundConfig: serializeQuestionRoundConfig(params.payload.roundConfig),
    submissionKey,
    walletAddress: params.walletAddress,
  };
}

function readSubmissionResult(
  receipt: TransactionReceipt,
  contentRegistryAddress: Address,
): {
  bundleId: bigint | null;
  contentIds: bigint[];
  rewardPoolId: bigint | null;
  rewardAttachments: SubmittedRewardAttachment[];
  roundConfigsByContentId: Map<string, SubmittedRoundConfig>;
  submittedContents: SubmittedQuestionContent[];
  submitters: Address[];
} {
  const expectedEmitter = normalizedAddress(contentRegistryAddress);
  let bundleId: bigint | null = null;
  const contentIds: bigint[] = [];
  let rewardPoolId: bigint | null = null;
  const rewardAttachments: SubmittedRewardAttachment[] = [];
  const roundConfigsByContentId = new Map<string, SubmittedRoundConfig>();
  const submittedContents: SubmittedQuestionContent[] = [];
  const submitters = new Set<Address>();

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== expectedEmitter) {
      continue;
    }

    try {
      const decoded = decodeEventLog({
        abi: ContentRegistryAbi,
        data: log.data,
        topics: log.topics,
      }) as { eventName: string; args: Record<string, unknown> };

      if (decoded.eventName === "ContentSubmitted" && typeof decoded.args.contentId === "bigint") {
        contentIds.push(decoded.args.contentId);
        if (
          isBytes32Hex(decoded.args.contentHash) &&
          typeof decoded.args.submitter === "string" &&
          isAddress(decoded.args.submitter)
        ) {
          submittedContents.push({
            contentHash: decoded.args.contentHash.toLowerCase() as Hex,
            contentId: decoded.args.contentId,
            submitter: decoded.args.submitter,
          });
        }
      }
      if (typeof decoded.args.submitter === "string" && isAddress(decoded.args.submitter)) {
        submitters.add(decoded.args.submitter);
      }
      if (decoded.eventName === "QuestionBundleSubmitted") {
        if (typeof decoded.args.bundleId === "bigint") {
          bundleId = decoded.args.bundleId;
        }
        if (typeof decoded.args.rewardPoolId === "bigint") {
          rewardPoolId = decoded.args.rewardPoolId;
        }
        if (typeof decoded.args.submitter === "string" && isAddress(decoded.args.submitter)) {
          rewardAttachments.push({
            amount: toDecimalString(decoded.args.amount),
            asset: toDecimalString(decoded.args.rewardAsset),
            bundleId: typeof decoded.args.bundleId === "bigint" ? decoded.args.bundleId : null,
            bountyClosesAt: toDecimalString(decoded.args.bountyClosesAt),
            contentId: null,
            feedbackClosesAt: toDecimalString(decoded.args.feedbackClosesAt),
            questionCount: toDecimalString(decoded.args.questionCount),
            rewardPoolId: typeof decoded.args.rewardPoolId === "bigint" ? decoded.args.rewardPoolId : null,
            requiredSettledRounds: "1",
            requiredVoters: toDecimalString(decoded.args.requiredCompleters),
            submitter: decoded.args.submitter,
          });
        }
      } else if (
        decoded.eventName === "SubmissionRewardPoolAttached" &&
        typeof decoded.args.rewardPoolId === "bigint"
      ) {
        rewardPoolId = decoded.args.rewardPoolId;
        if (
          typeof decoded.args.contentId === "bigint" &&
          typeof decoded.args.submitter === "string" &&
          isAddress(decoded.args.submitter)
        ) {
          rewardAttachments.push({
            amount: toDecimalString(decoded.args.amount),
            asset: toDecimalString(decoded.args.rewardAsset),
            bundleId: null,
            bountyClosesAt: toDecimalString(decoded.args.bountyClosesAt),
            contentId: decoded.args.contentId,
            feedbackClosesAt: toDecimalString(decoded.args.feedbackClosesAt),
            questionCount: null,
            rewardPoolId: decoded.args.rewardPoolId,
            requiredSettledRounds: toDecimalString(decoded.args.requiredSettledRounds),
            requiredVoters: toDecimalString(decoded.args.requiredVoters),
            submitter: decoded.args.submitter,
          });
        }
      } else if (decoded.eventName === "ContentRoundConfigSet" && typeof decoded.args.contentId === "bigint") {
        roundConfigsByContentId.set(decoded.args.contentId.toString(), {
          epochDuration: toDecimalString(decoded.args.epochDuration),
          maxDuration: toDecimalString(decoded.args.maxDuration),
          maxVoters: toDecimalString(decoded.args.maxVoters),
          minVoters: toDecimalString(decoded.args.minVoters),
        });
      }
    } catch {
      // Ignore logs from token transfers and other contracts in the same receipt.
    }
  }

  return {
    bundleId,
    contentIds,
    rewardAttachments,
    rewardPoolId,
    roundConfigsByContentId,
    submittedContents,
    submitters: Array.from(submitters),
  };
}

function bundleCompleterCount(expectedRewardTerms: StoredQuestionRewardTerms): string {
  return (BigInt(expectedRewardTerms.requiredVoters) * BigInt(expectedRewardTerms.requiredSettledRounds)).toString();
}

function sameBundleRewardTerms(
  submitted: SubmittedRewardAttachment,
  expected: StoredQuestionRewardTerms,
  expectedQuestionCount: number,
) {
  return (
    submitted.contentId === null &&
    submitted.asset === expected.asset &&
    submitted.amount === expected.amount &&
    submitted.bountyClosesAt === expected.bountyClosesAt &&
    submitted.feedbackClosesAt === expected.feedbackClosesAt &&
    submitted.questionCount === expectedQuestionCount.toString() &&
    submitted.requiredVoters === bundleCompleterCount(expected)
  );
}

function matchConfirmedSubmissionPlan(params: {
  record: X402QuestionSubmissionRecord;
  rewardAttachments: SubmittedRewardAttachment[];
  roundConfigsByContentId: Map<string, SubmittedRoundConfig>;
  submittedContents: SubmittedQuestionContent[];
  walletAddress: Lowercase<Address>;
}): { bundleId: bigint | null; contentIds: bigint[]; rewardPoolId: bigint | null } {
  const planReceipt = parseStoredSubmissionPlanReceipt(params.record.paymentReceipt);
  const expectedContentHashes = planReceipt?.expectedContentHashes?.map(hash => hash.toLowerCase() as Hex) ?? [];
  if (expectedContentHashes.length === 0 || !planReceipt?.expectedRewardTerms || !planReceipt.expectedRoundConfig) {
    throw new X402QuestionConflictError("Agent wallet submission plan is missing payload confirmation data.");
  }

  const remainingWalletContents = params.submittedContents.filter(
    content => normalizedAddress(content.submitter) === params.walletAddress,
  );
  const matchedContentIds: bigint[] = [];

  for (const expectedHash of expectedContentHashes) {
    const matchIndex = remainingWalletContents.findIndex(content => content.contentHash.toLowerCase() === expectedHash);
    if (matchIndex < 0) {
      throw new X402QuestionConflictError("Confirmed submission did not match the planned question payload.");
    }

    const matchedContent = remainingWalletContents.splice(matchIndex, 1)[0];
    if (!matchedContent) {
      throw new X402QuestionConflictError("Confirmed submission did not match the planned question payload.");
    }
    matchedContentIds.push(matchedContent.contentId);
    const submittedRoundConfig = params.roundConfigsByContentId.get(matchedContent.contentId.toString());
    if (!sameRoundConfig(submittedRoundConfig, planReceipt.expectedRoundConfig)) {
      throw new X402QuestionConflictError("Confirmed submission did not use the planned round config.");
    }
  }

  if (matchedContentIds.length === 1) {
    const contentId = matchedContentIds[0];
    const rewardAttachment = params.rewardAttachments.find(
      attachment =>
        attachment.contentId === contentId &&
        normalizedAddress(attachment.submitter) === params.walletAddress &&
        sameRewardTerms(attachment, planReceipt.expectedRewardTerms),
    );
    if (!rewardAttachment) {
      throw new X402QuestionConflictError("Confirmed submission did not attach the planned bounty terms.");
    }
    return { bundleId: null, contentIds: matchedContentIds, rewardPoolId: rewardAttachment.rewardPoolId };
  }

  const bundleAttachment = params.rewardAttachments.find(
    attachment =>
      normalizedAddress(attachment.submitter) === params.walletAddress &&
      sameBundleRewardTerms(attachment, planReceipt.expectedRewardTerms!, matchedContentIds.length),
  );
  if (!bundleAttachment) {
    throw new X402QuestionConflictError("Confirmed bundle submission did not attach the planned bounty terms.");
  }

  return {
    bundleId: bundleAttachment.bundleId,
    contentIds: matchedContentIds,
    rewardPoolId: bundleAttachment.rewardPoolId,
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
    operationKey: params.operation.operationKey,
    questionCount: params.payload.questions.length,
    roundConfig: serializeQuestionRoundConfig(params.payload.roundConfig),
    payment: {
      amount: params.payload.bounty.amount.toString(),
      asset: params.config.usdcAddress,
    },
    rewardPoolId: params.record?.rewardPoolId ?? null,
    status: params.record?.status ?? "not_found",
    transactionHashes,
  };
}

async function recordAgentWalletSubmissionPlan(params: {
  agentId: string | null;
  config: X402QuestionSubmissionConfig;
  mode?: WalletSubmissionReceiptMode;
  operation: X402QuestionOperation;
  originalClientRequestId?: string;
  payload: X402QuestionPayload;
  plan: AgentWalletQuestionSubmissionPlan;
}) {
  const now = new Date();
  const receipt = JSON.stringify({
    ...(params.agentId ? { agentId: params.agentId } : {}),
    expectedContentHashes: buildExpectedQuestionContentHashes(params.payload),
    expectedRewardTerms: serializeExpectedRewardTerms(params.payload),
    expectedRoundConfig: serializeQuestionRoundConfig(params.payload.roundConfig),
    mode: params.mode ?? "agent-wallet-plan",
    operationKey: params.operation.operationKey,
    ...(params.originalClientRequestId ? { originalClientRequestId: params.originalClientRequestId } : {}),
    preparedAt: now.toISOString(),
    revealCommitment: params.plan.revealCommitment,
    walletAddress: params.plan.walletAddress,
  });

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
          question_count,
          status,
          payment_receipt,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        params.operation.operationKey,
        params.payload.clientRequestId,
        params.operation.payloadHash,
        params.payload.chainId,
        params.plan.walletAddress,
        params.config.usdcAddress,
        params.plan.payment.amount,
        params.payload.bounty.amount.toString(),
        params.payload.questions.length,
        "awaiting_wallet_signature",
        receipt,
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
            payment_asset = ?,
            payment_amount = ?,
            bounty_amount = ?,
            question_count = ?,
            status = CASE WHEN status = 'submitted' THEN status ELSE ? END,
            payment_receipt = CASE WHEN status = 'submitted' THEN payment_receipt ELSE ? END,
            error = CASE WHEN status = 'submitted' THEN error ELSE NULL END,
            updated_at = ?
        WHERE operation_key = ?
      `,
      args: [
        params.plan.walletAddress,
        params.config.usdcAddress,
        params.plan.payment.amount,
        params.payload.bounty.amount.toString(),
        params.payload.questions.length,
        "awaiting_wallet_signature",
        receipt,
        now,
        params.operation.operationKey,
      ],
    });
  }
}

async function recordNativeX402SubmissionPlan(params: {
  agentId: string | null;
  config: X402QuestionSubmissionConfig;
  mode?: WalletSubmissionReceiptMode;
  operation: X402QuestionOperation;
  originalClientRequestId?: string;
  payload: X402QuestionPayload;
  plan: NativeX402QuestionSubmissionPlan;
}) {
  const now = new Date();
  const receipt = JSON.stringify({
    ...(params.agentId ? { agentId: params.agentId } : {}),
    authorization: params.plan.authorization,
    expectedContentHashes: buildExpectedQuestionContentHashes(params.payload),
    expectedRewardTerms: serializeExpectedRewardTerms(params.payload),
    expectedRoundConfig: serializeQuestionRoundConfig(params.payload.roundConfig),
    mode: params.mode ?? "native-x402-authorization",
    operationKey: params.operation.operationKey,
    ...(params.originalClientRequestId ? { originalClientRequestId: params.originalClientRequestId } : {}),
    preparedAt: now.toISOString(),
    revealCommitment: params.plan.revealCommitment,
    walletAddress: params.plan.walletAddress,
  });

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
          question_count,
          status,
          payment_receipt,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        params.operation.operationKey,
        params.payload.clientRequestId,
        params.operation.payloadHash,
        params.payload.chainId,
        params.plan.walletAddress,
        params.config.usdcAddress,
        params.plan.payment.amount,
        params.payload.bounty.amount.toString(),
        params.payload.questions.length,
        "awaiting_wallet_signature",
        receipt,
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
            payment_asset = ?,
            payment_amount = ?,
            bounty_amount = ?,
            question_count = ?,
            status = CASE WHEN status = 'submitted' THEN status ELSE ? END,
            payment_receipt = CASE WHEN status = 'submitted' THEN payment_receipt ELSE ? END,
            error = CASE WHEN status = 'submitted' THEN error ELSE NULL END,
            updated_at = ?
        WHERE operation_key = ?
      `,
      args: [
        params.plan.walletAddress,
        params.config.usdcAddress,
        params.plan.payment.amount,
        params.payload.bounty.amount.toString(),
        params.payload.questions.length,
        "awaiting_wallet_signature",
        receipt,
        now,
        params.operation.operationKey,
      ],
    });
  }
}

function readStoredNativeX402Authorization(record: X402QuestionSubmissionRecord | null) {
  if (!record?.paymentReceipt) return null;
  try {
    const parsed = JSON.parse(record.paymentReceipt) as {
      authorization?: NativeX402PaymentAuthorizationInput;
      mode?: string;
    };
    return parsed.mode === "native-x402-authorization" ? (parsed.authorization ?? null) : null;
  } catch {
    return null;
  }
}

function readOriginalClientRequestId(record: X402QuestionSubmissionRecord | null) {
  if (!record?.paymentReceipt) return null;
  try {
    const parsed = JSON.parse(record.paymentReceipt) as {
      originalClientRequestId?: unknown;
    };
    return typeof parsed.originalClientRequestId === "string" && parsed.originalClientRequestId.trim()
      ? parsed.originalClientRequestId
      : null;
  } catch {
    return null;
  }
}

function agentWalletQuestionSubmissionPlanBody(params: {
  clientRequestId?: string;
  payload: X402QuestionPayload;
  plan: AgentWalletQuestionSubmissionPlan;
}) {
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
    clientRequestId: params.clientRequestId ?? params.payload.clientRequestId,
    operationKey: params.plan.operationKey,
    payment: params.plan.payment,
    payloadHash: params.plan.payloadHash,
    questionCount: params.payload.questions.length,
    ready: false,
    roundConfig: serializeQuestionRoundConfig(params.payload.roundConfig),
    status: "awaiting_wallet_signature",
    terminal: false,
    transactionPlan: {
      calls: params.plan.calls,
      requiresOrderedExecution: params.plan.requiresOrderedExecution,
    },
    paymentMode: "wallet_calls",
    wallet: {
      address: params.plan.walletAddress,
      fundingMode: "agent_wallet",
      note: "The wallet signer must execute every call; Curyo does not receive bounty funds.",
    },
  };
}

function nativeX402QuestionSubmissionPlanBody(params: {
  clientRequestId?: string;
  payload: X402QuestionPayload;
  plan: NativeX402QuestionSubmissionPlan;
}) {
  const signed = Boolean(params.plan.authorization.signature);
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
    clientRequestId: params.clientRequestId ?? params.payload.clientRequestId,
    nextAction: signed ? "submit_x402_transaction" : "sign_x402_authorization",
    operationKey: params.plan.operationKey,
    payment: params.plan.payment,
    paymentMode: "x402_authorization",
    payloadHash: params.plan.payloadHash,
    questionCount: params.payload.questions.length,
    ready: false,
    roundConfig: params.plan.roundConfig,
    status: "awaiting_wallet_signature",
    terminal: false,
    transactionPlan: signed
      ? {
          calls: params.plan.calls,
          requiresOrderedExecution: params.plan.requiresOrderedExecution,
        }
      : null,
    wallet: {
      address: params.plan.walletAddress,
      fundingMode: "x402_authorization",
      note: "Sign the x402 USDC authorization with this wallet; Curyo does not custody funds.",
    },
    x402AuthorizationRequest: {
      authorization: params.plan.authorization,
      eip712: buildNativeX402TypedData({
        authorization: params.plan.authorization,
        chainId: params.plan.chainId,
        tokenAddress: params.plan.payment.tokenAddress,
      }),
      submitTool: "curyo_ask_humans",
    },
  };
}

export async function prepareAgentWalletQuestionSubmissionRequest(params: {
  agentId: string;
  payload: X402QuestionPayload;
  walletAddress: Address;
}): Promise<{ body: unknown; status: number }> {
  return prepareWalletQuestionSubmissionRequest({
    agentId: params.agentId,
    payload: params.payload,
    walletAddress: params.walletAddress,
  });
}

export async function preparePermissionlessWalletQuestionSubmissionRequest(params: {
  payload: X402QuestionPayload;
  walletAddress: Address;
}): Promise<{ body: unknown; status: number }> {
  return prepareWalletQuestionSubmissionRequest({
    agentId: null,
    mode: "permissionless-wallet-plan",
    originalClientRequestId: params.payload.clientRequestId,
    payload: toPermissionlessWalletPayload(params.payload, params.walletAddress),
    responseClientRequestId: params.payload.clientRequestId,
    walletAddress: params.walletAddress,
  });
}

async function prepareWalletQuestionSubmissionRequest(params: {
  agentId: string | null;
  mode?: WalletSubmissionReceiptMode;
  originalClientRequestId?: string;
  payload: X402QuestionPayload;
  responseClientRequestId?: string;
  walletAddress: Address;
}): Promise<{ body: unknown; status: number }> {
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
      body: x402QuestionSubmissionStatusBody({ config, operation, payload: params.payload, record: existingRecord }),
      status: 200,
    };
  }

  const plan = await dependencies.buildAgentWalletQuestionSubmissionPlan({
    config,
    payload: params.payload,
    walletAddress: params.walletAddress,
  });
  await recordAgentWalletSubmissionPlan({
    agentId: params.agentId,
    config,
    mode: params.mode,
    operation,
    originalClientRequestId: params.originalClientRequestId,
    payload: params.payload,
    plan,
  });

  return {
    body: agentWalletQuestionSubmissionPlanBody({
      clientRequestId: params.responseClientRequestId,
      payload: params.payload,
      plan,
    }),
    status: 202,
  };
}

export async function prepareNativeX402QuestionSubmissionRequest(params: {
  agentId: string;
  paymentAuthorization?: NativeX402PaymentAuthorizationInput | null;
  payload: X402QuestionPayload;
  walletAddress: Address;
}): Promise<{ body: unknown; status: number }> {
  return prepareNativeQuestionSubmissionRequest({
    agentId: params.agentId,
    paymentAuthorization: params.paymentAuthorization,
    payload: params.payload,
    walletAddress: params.walletAddress,
  });
}

export async function preparePermissionlessNativeX402QuestionSubmissionRequest(params: {
  paymentAuthorization?: NativeX402PaymentAuthorizationInput | null;
  payload: X402QuestionPayload;
  walletAddress: Address;
}): Promise<{ body: unknown; status: number }> {
  return prepareNativeQuestionSubmissionRequest({
    agentId: null,
    mode: "permissionless-x402-authorization",
    originalClientRequestId: params.payload.clientRequestId,
    paymentAuthorization: params.paymentAuthorization,
    payload: toPermissionlessWalletPayload(params.payload, params.walletAddress),
    responseClientRequestId: params.payload.clientRequestId,
    walletAddress: params.walletAddress,
  });
}

async function prepareNativeQuestionSubmissionRequest(params: {
  agentId: string | null;
  mode?: WalletSubmissionReceiptMode;
  originalClientRequestId?: string;
  paymentAuthorization?: NativeX402PaymentAuthorizationInput | null;
  payload: X402QuestionPayload;
  responseClientRequestId?: string;
  walletAddress: Address;
}): Promise<{ body: unknown; status: number }> {
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
      body: x402QuestionSubmissionStatusBody({ config, operation, payload: params.payload, record: existingRecord }),
      status: 200,
    };
  }

  const storedAuthorization = readStoredNativeX402Authorization(existingRecord);
  const plan = await dependencies.buildNativeX402QuestionSubmissionPlan({
    config,
    payload: params.payload,
    paymentAuthorization: params.paymentAuthorization ?? storedAuthorization,
    walletAddress: params.walletAddress,
  });
  await recordNativeX402SubmissionPlan({
    agentId: params.agentId,
    config,
    mode: params.mode,
    operation,
    originalClientRequestId: params.originalClientRequestId,
    payload: params.payload,
    plan,
  });

  return {
    body: nativeX402QuestionSubmissionPlanBody({
      clientRequestId: params.responseClientRequestId,
      payload: params.payload,
      plan,
    }),
    status: 202,
  };
}

function assertTransactionHashes(value: Hex[]) {
  if (value.length === 0) {
    throw new X402QuestionConflictError("At least one transaction hash is required.");
  }
  for (const hash of value) {
    if (!/^0x[a-fA-F0-9]{64}$/.test(hash)) {
      throw new X402QuestionConflictError("transactionHashes must contain 32-byte hex transaction hashes.");
    }
  }
}

export async function confirmAgentWalletQuestionSubmissionRequest(params: {
  operationKey: `0x${string}`;
  transactionHashes: Hex[];
}): Promise<{ body: unknown; status: number }> {
  assertTransactionHashes(params.transactionHashes);
  const dependencies = getQuestionSubmissionDependencies();
  const record = await getX402QuestionSubmissionByOperationKey(params.operationKey);
  if (!record) {
    throw new X402QuestionConflictError("Agent wallet submission plan was not found.");
  }
  if (record.status === "submitted") {
    return {
      body: normalizeSubmittedRecordBody(record),
      status: 200,
    };
  }
  if (!record.payerAddress || !isAddress(record.payerAddress)) {
    throw new X402QuestionConflictError("Agent wallet submission plan is missing a wallet address.");
  }

  const config = dependencies.resolveX402QuestionConfig(record.chainId);
  const publicClient = createPublicQuestionClient(config);
  const walletAddress = record.payerAddress.toLowerCase();
  const rewardAttachments: SubmittedRewardAttachment[] = [];
  const roundConfigsByContentId = new Map<string, SubmittedRoundConfig>();
  const submittedContents: SubmittedQuestionContent[] = [];

  for (const hash of params.transactionHashes) {
    const receipt = await dependencies.waitForSuccessfulReceipt(publicClient, hash);
    const result = readSubmissionResult(receipt, config.contentRegistryAddress);
    submittedContents.push(...result.submittedContents);
    rewardAttachments.push(...result.rewardAttachments);
    for (const [contentId, roundConfig] of result.roundConfigsByContentId.entries()) {
      roundConfigsByContentId.set(contentId, roundConfig);
    }
  }

  if (submittedContents.length === 0) {
    throw new X402QuestionConflictError("Confirmed transactions did not include a Curyo question submission.");
  }
  if (!submittedContents.some(content => normalizedAddress(content.submitter) === walletAddress)) {
    throw new X402QuestionConflictError("Confirmed submission was not emitted for the planned wallet address.");
  }
  const { bundleId, contentIds, rewardPoolId } = matchConfirmedSubmissionPlan({
    record,
    rewardAttachments,
    roundConfigsByContentId,
    submittedContents,
    walletAddress: walletAddress as Lowercase<Address>,
  });

  await updateSubmissionStatus({
    bundleId,
    contentId: contentIds[0] ?? null,
    contentIds,
    operationKey: params.operationKey,
    rewardPoolId,
    status: "submitted",
    transactionHashes: params.transactionHashes,
  });

  const updatedRecord = await getX402QuestionSubmissionByOperationKey(params.operationKey);
  return {
    body: normalizeSubmittedRecordBody(updatedRecord ?? record),
    status: 200,
  };
}

function normalizeSubmittedRecordBody(record: X402QuestionSubmissionRecord) {
  return {
    ...x402QuestionSubmissionRecordBody(record),
    ready: false,
    terminal: false,
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
    clientRequestId: readOriginalClientRequestId(record) ?? record.clientRequestId,
    contentId: record.contentId,
    contentIds: record.contentIds ? parseStoredContentIds(record.contentIds) : [],
    error: record.error,
    operationKey: record.operationKey,
    payerAddress: record.payerAddress,
    payloadHash: record.payloadHash,
    payment: {
      amount: record.paymentAmount,
      asset: record.paymentAsset,
    },
    questionCount: record.questionCount,
    rewardPoolId: record.rewardPoolId,
    status: record.status,
    transactionHashes: parseStoredTransactionHashes(record.transactionHashes),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function __setX402QuestionSubmissionTestOverridesForTests(value: X402QuestionSubmissionTestOverrides | null) {
  x402QuestionSubmissionTestOverrides = value;
}
