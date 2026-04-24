import deployedContracts from "@curyo/contracts/deployedContracts";
import { and, eq, sql } from "drizzle-orm";
import "server-only";
import {
  type Abi,
  type Address,
  type Hash,
  type Hex,
  createPublicClient,
  decodeFunctionData,
  getAddress,
  http,
  isAddress,
  isHash,
  isHex,
  parseAbi,
  parseEventLogs,
  toHex,
} from "viem";
import { db } from "~~/lib/db";
import { freeTransactionQuotas, freeTransactionReservations } from "~~/lib/db/schema";
import {
  getFreeTransactionLimit,
  getServerEnvironmentScope,
  getServerRpcOverrides,
  getServerTargetNetworkById,
} from "~~/lib/env/server";
import { buildFreeTransactionOperationKey } from "~~/lib/thirdweb/freeTransactionOperation";
import {
  buildVerifiedFreeTransactionFallbackSummary,
  isFreeTransactionStoreUnavailableError,
} from "~~/lib/thirdweb/freeTransactionStoreFallback";

type DeployedContractsMap = Record<
  number,
  Record<
    string,
    {
      address: Address;
      abi: Abi;
    }
  >
>;

type ThirdwebVerifierUserOp = {
  sender?: string;
  targets?: string[];
  gasLimit?: string;
  gasPrice?: string;
  data?: {
    targets?: string[];
    callDatas?: string[];
    values?: string[];
  };
};

type ThirdwebVerifierRequest = {
  clientId?: string;
  chainId?: number;
  userOp?: ThirdwebVerifierUserOp;
};

type FreeTransactionDbWrite = Pick<typeof db, "insert" | "select" | "update">;
type ResolveVoterIdTokenId = (address: `0x${string}`, chainId: number) => Promise<string | null>;
type CheckTransactionHashesSucceeded = (params: {
  chainId: number;
  transactionHashes: Hash[];
  walletAddress: `0x${string}`;
}) => Promise<boolean>;
type TransactionVerificationLog = {
  address: Address;
  data: Hex;
  topics: readonly Hex[];
};
type TransactionVerificationClient = {
  getTransaction: (params: { hash: Hash }) => Promise<{ chainId: bigint | number; from: Address }>;
  getTransactionReceipt: (params: {
    hash: Hash;
  }) => Promise<{ logs: readonly TransactionVerificationLog[]; status: "reverted" | "success" }>;
};
type GetTransactionVerificationClient = (chainId: number) => Promise<TransactionVerificationClient | null>;

export type FreeTransactionAllowanceSummary = {
  chainId: number;
  environment: string;
  limit: number;
  used: number;
  remaining: number;
  verified: boolean;
  exhausted: boolean;
  walletAddress: `0x${string}` | null;
  voterIdTokenId: string | null;
};

export type FreeTransactionAllowanceDecision =
  | {
      isAllowed: true;
      summary: FreeTransactionAllowanceSummary;
      debugCode?: string;
    }
  | {
      isAllowed: false;
      reason: string;
      summary?: FreeTransactionAllowanceSummary;
      debugCode:
        | "invalid_chain"
        | "invalid_sender"
        | "invalid_targets"
        | "target_not_allowlisted"
        | "unsupported_operation"
        | "invalid_operation_key"
        | "missing_voter_id"
        | "free_tx_exhausted";
    };

const DEFAULT_DENY_REASON = "Transaction not sponsored.";
const FREE_TX_EXHAUSTED_REASON = "Free transactions used up. Add CELO to continue.";
const NO_VOTER_ID_REASON = "Verify your ID to unlock free transactions.";
const FREE_TRANSACTION_RESERVATION_TTL_MS = 5 * 60_000;
const FREE_TRANSACTION_IDEMPOTENCY_WINDOW_MS = 2 * 60_000;
const USER_OPERATION_RECEIPT_EVENT_ABI = parseAbi([
  "event UserOperationEvent(bytes32 indexed userOpHash, address indexed sender, address indexed paymaster, uint256 nonce, bool success, uint256 actualGasCost, uint256 actualGasUsed)",
]);
const EXECUTED_RECEIPT_EVENT_ABI = parseAbi([
  "event Executed(address indexed user, address indexed signer, address indexed executor, uint256 batchSize)",
]);
const ERC20_APPROVAL_ABI = parseAbi(["function approve(address spender, uint256 amount) returns (bool)"]);
const CONTENT_REGISTRY_SUBMISSION_ABI = [
  {
    type: "function",
    name: "cancelReservedSubmission",
    inputs: [{ name: "revealCommitment", type: "bytes32" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "reserveSubmission",
    inputs: [{ name: "revealCommitment", type: "bytes32" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "submitQuestion",
    inputs: [
      { name: "contextUrl", type: "string" },
      { name: "imageUrls", type: "string[]" },
      { name: "videoUrl", type: "string" },
      { name: "title", type: "string" },
      { name: "description", type: "string" },
      { name: "tags", type: "string" },
      { name: "categoryId", type: "uint256" },
      { name: "salt", type: "bytes32" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "submitQuestionWithRewardAndRoundConfig",
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
        name: "rewardTerms",
        type: "tuple",
        components: [
          { name: "asset", type: "uint8" },
          { name: "amount", type: "uint256" },
          { name: "requiredVoters", type: "uint256" },
          { name: "requiredSettledRounds", type: "uint256" },
          { name: "bountyClosesAt", type: "uint256" },
          { name: "feedbackClosesAt", type: "uint256" },
        ],
      },
      {
        name: "roundConfig",
        type: "tuple",
        components: [
          { name: "epochDuration", type: "uint32" },
          { name: "maxDuration", type: "uint32" },
          { name: "minVoters", type: "uint16" },
          { name: "maxVoters", type: "uint16" },
        ],
      },
      {
        name: "spec",
        type: "tuple",
        components: [
          { name: "questionMetadataHash", type: "bytes32" },
          { name: "resultSpecHash", type: "bytes32" },
        ],
      },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "submitQuestionBundleWithRewardAndRoundConfig",
    inputs: [
      {
        name: "questions",
        type: "tuple[]",
        components: [
          { name: "contextUrl", type: "string" },
          { name: "imageUrls", type: "string[]" },
          { name: "videoUrl", type: "string" },
          { name: "title", type: "string" },
          { name: "description", type: "string" },
          { name: "tags", type: "string" },
          { name: "categoryId", type: "uint256" },
          { name: "salt", type: "bytes32" },
          {
            name: "spec",
            type: "tuple",
            components: [
              { name: "questionMetadataHash", type: "bytes32" },
              { name: "resultSpecHash", type: "bytes32" },
            ],
          },
        ],
      },
      {
        name: "rewardTerms",
        type: "tuple",
        components: [
          { name: "asset", type: "uint8" },
          { name: "amount", type: "uint256" },
          { name: "requiredVoters", type: "uint256" },
          { name: "requiredSettledRounds", type: "uint256" },
          { name: "bountyClosesAt", type: "uint256" },
          { name: "feedbackClosesAt", type: "uint256" },
        ],
      },
      {
        name: "roundConfig",
        type: "tuple",
        components: [
          { name: "epochDuration", type: "uint32" },
          { name: "maxDuration", type: "uint32" },
          { name: "minVoters", type: "uint16" },
          { name: "maxVoters", type: "uint16" },
        ],
      },
    ],
    outputs: [
      { name: "bundleId", type: "uint256" },
      { name: "contentIds", type: "uint256[]" },
    ],
    stateMutability: "nonpayable",
  },
] as const;

let ensureFreeTransactionQuotaTablePromise: Promise<void> | null = null;
let freeTransactionTestOverrides: {
  resolveVoterIdTokenId?: ResolveVoterIdTokenId;
  allTransactionHashesSucceeded?: CheckTransactionHashesSucceeded;
  getTransactionVerificationClient?: GetTransactionVerificationClient;
} | null = null;

function getContractsForChain(chainId: number) {
  return (deployedContracts as unknown as Partial<DeployedContractsMap>)[chainId];
}

function buildIdentityKey(params: { chainId: number; environment: string; voterIdTokenId: string }) {
  return `${params.environment}:${params.chainId}:${params.voterIdTokenId}`;
}

function normalizeAddress(value: string): `0x${string}` {
  return getAddress(value) as `0x${string}`;
}

function getTimestampMs(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

function isCallableAbi(abi: Abi) {
  return abi.some(entry => entry.type === "function");
}

function getContractsByAddress(chainId: number): Map<string, { name: string; address: Address; abi: Abi }> {
  const contracts = getContractsForChain(chainId);
  if (!contracts) {
    return new Map();
  }

  return new Map(
    Object.entries(contracts)
      .filter(([name, contract]) => !name.endsWith("Lib") && isCallableAbi(contract.abi))
      .map(([name, contract]) => [
        contract.address.toLowerCase(),
        { name, address: contract.address, abi: contract.abi },
      ]),
  );
}

function decodeContentRegistryCallData(data: Hex) {
  return decodeFunctionData({
    abi: CONTENT_REGISTRY_SUBMISSION_ABI,
    data,
  }) as { functionName: string; args: readonly unknown[] | undefined };
}

function getRpcUrl(chainId: number) {
  const network = getServerTargetNetworkById(chainId);
  if (!network) {
    return null;
  }

  const rpcOverrides = getServerRpcOverrides();
  return rpcOverrides[chainId] ?? network.rpcUrls.default.http[0] ?? null;
}

async function getPublicClientForChain(chainId: number) {
  const network = getServerTargetNetworkById(chainId);
  const rpcUrl = getRpcUrl(chainId);

  if (!network || !rpcUrl) {
    return null;
  }

  return createPublicClient({
    chain: network,
    transport: http(rpcUrl),
  });
}

async function getTransactionVerificationClient(chainId: number): Promise<TransactionVerificationClient | null> {
  if (freeTransactionTestOverrides?.getTransactionVerificationClient) {
    return freeTransactionTestOverrides.getTransactionVerificationClient(chainId);
  }

  const client = await getPublicClientForChain(chainId);
  if (!client) {
    return null;
  }

  return {
    getTransaction: async params => {
      const transaction = await client.getTransaction(params);

      return {
        chainId:
          typeof transaction.chainId === "bigint" || typeof transaction.chainId === "number"
            ? transaction.chainId
            : Number.NaN,
        from: transaction.from,
      };
    },
    getTransactionReceipt: params => client.getTransactionReceipt(params),
  };
}

async function resolveVoterIdTokenId(address: `0x${string}`, chainId: number) {
  const client = await getPublicClientForChain(chainId);
  const contracts = getContractsForChain(chainId);
  const voterIdContract = contracts?.VoterIdNFT;

  if (!client || !voterIdContract) {
    return null;
  }

  const hasVoterId = await client
    .readContract({
      address: voterIdContract.address,
      abi: voterIdContract.abi,
      functionName: "hasVoterId",
      args: [address],
    })
    .catch(() => false);

  if (!hasVoterId) {
    return null;
  }

  const tokenId = await client
    .readContract({
      address: voterIdContract.address,
      abi: voterIdContract.abi,
      functionName: "getTokenId",
      args: [address],
    })
    .catch(() => 0n);

  if (typeof tokenId !== "bigint" || tokenId <= 0n) {
    return null;
  }

  return tokenId.toString();
}

async function ensureQuotaRow(
  database: FreeTransactionDbWrite,
  params: {
    chainId: number;
    environment: string;
    voterIdTokenId: string;
    walletAddress: `0x${string}`;
  },
) {
  const now = new Date();
  const freeTxLimit = getFreeTransactionLimit();
  const identityKey = buildIdentityKey(params);

  await database
    .insert(freeTransactionQuotas)
    .values({
      identityKey,
      voterIdTokenId: params.voterIdTokenId,
      chainId: params.chainId,
      environment: params.environment,
      lastWalletAddress: params.walletAddress,
      freeTxLimit,
      freeTxUsed: 0,
      exhaustedAt: null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();

  return identityKey;
}

function buildQuotaSummary(params: {
  chainId: number;
  environment: string;
  freeTxLimit: number;
  freeTxUsed: number;
  pendingReservations?: number;
  voterIdTokenId: string;
  walletAddress: `0x${string}`;
}) {
  const used = params.freeTxUsed + (params.pendingReservations ?? 0);

  return {
    chainId: params.chainId,
    environment: params.environment,
    limit: params.freeTxLimit,
    used,
    remaining: Math.max(params.freeTxLimit - used, 0),
    verified: true,
    exhausted: used >= params.freeTxLimit,
    walletAddress: params.walletAddress,
    voterIdTokenId: params.voterIdTokenId,
  } satisfies FreeTransactionAllowanceSummary;
}

function normalizeQuotaRow(
  row:
    | {
        chainId?: number | string | null;
        chain_id?: number | string | null;
        chainid?: number | string | null;
        environment?: string | null;
        freeTxLimit?: number | string | null;
        free_tx_limit?: number | string | null;
        freetxlimit?: number | string | null;
        freeTxUsed?: number | string | null;
        free_tx_used?: number | string | null;
        freetxused?: number | string | null;
        voterIdTokenId?: string | null;
        voter_id_token_id?: string | null;
        voteridtokenid?: string | null;
      }
    | null
    | undefined,
) {
  if (!row) {
    return null;
  }

  return {
    chainId: Number(row.chainId ?? row.chain_id ?? row.chainid),
    environment: row.environment ?? "",
    freeTxLimit: Number(row.freeTxLimit ?? row.free_tx_limit ?? row.freetxlimit),
    freeTxUsed: Number(row.freeTxUsed ?? row.free_tx_used ?? row.freetxused),
    voterIdTokenId: row.voterIdTokenId ?? row.voter_id_token_id ?? row.voteridtokenid ?? "",
  };
}

function normalizeReservationRow(
  row:
    | {
        chainId?: number | string | null;
        chain_id?: number | string | null;
        chainid?: number | string | null;
        walletAddress?: string | null;
        wallet_address?: string | null;
        walletaddress?: string | null;
        status?: string | null;
        confirmedAt?: Date | string | null;
        confirmed_at?: Date | string | null;
        confirmedat?: Date | string | null;
        expiresAt?: Date | string | null;
        expires_at?: Date | string | null;
        expiresat?: Date | string | null;
      }
    | null
    | undefined,
) {
  if (!row) {
    return null;
  }

  return {
    chainId: Number(row.chainId ?? row.chain_id ?? row.chainid),
    walletAddress: row.walletAddress ?? row.wallet_address ?? row.walletaddress ?? "",
    status: row.status ?? "",
    confirmedAt: row.confirmedAt ?? row.confirmed_at ?? row.confirmedat ?? null,
    expiresAt: row.expiresAt ?? row.expires_at ?? row.expiresat ?? null,
  };
}

async function readQuotaSummary(params: {
  chainId: number;
  environment: string;
  voterIdTokenId: string;
  walletAddress: `0x${string}`;
}) {
  const identityKey = await ensureQuotaRow(db, params);
  const now = new Date();
  const [row] = await db
    .select()
    .from(freeTransactionQuotas)
    .where(eq(freeTransactionQuotas.identityKey, identityKey))
    .limit(1);

  if (!row) {
    return null;
  }

  const quotaRow = normalizeQuotaRow(row);
  if (!quotaRow) {
    return null;
  }

  const pendingReservations = await getActivePendingReservationCount(db, {
    identityKey,
    now,
  });

  return buildQuotaSummary({
    chainId: quotaRow.chainId,
    environment: quotaRow.environment,
    freeTxLimit: quotaRow.freeTxLimit,
    freeTxUsed: quotaRow.freeTxUsed,
    pendingReservations,
    voterIdTokenId: quotaRow.voterIdTokenId,
    walletAddress: params.walletAddress,
  });
}

export function __setFreeTransactionTestOverridesForTests(
  overrides: {
    resolveVoterIdTokenId?: ResolveVoterIdTokenId;
    allTransactionHashesSucceeded?: CheckTransactionHashesSucceeded;
    getTransactionVerificationClient?: GetTransactionVerificationClient;
  } | null,
) {
  freeTransactionTestOverrides = overrides;
}

function buildUnverifiedSummary(params: { chainId: number; walletAddress: `0x${string}` | null }) {
  const limit = getFreeTransactionLimit();

  return {
    chainId: params.chainId,
    environment: getServerEnvironmentScope(),
    limit,
    used: 0,
    remaining: 0,
    verified: false,
    exhausted: false,
    walletAddress: params.walletAddress,
    voterIdTokenId: null,
  } satisfies FreeTransactionAllowanceSummary;
}

type NormalizedVerifierCall = {
  data: Hex;
  to: `0x${string}`;
  value: Hex;
};

function normalizeCallValue(value: string | undefined): Hex | null {
  if (value === undefined) {
    return "0x0";
  }

  if (isHex(value)) {
    return toHex(BigInt(value));
  }

  if (/^\d+$/.test(value)) {
    return toHex(BigInt(value));
  }

  return null;
}

function extractOperationCalls(body: ThirdwebVerifierRequest): NormalizedVerifierCall[] | null {
  const targets = body.userOp?.data?.targets ?? body.userOp?.targets ?? [];
  const callDatas = body.userOp?.data?.callDatas;
  const values = body.userOp?.data?.values;

  if (
    !Array.isArray(targets) ||
    targets.length === 0 ||
    !Array.isArray(callDatas) ||
    callDatas.length !== targets.length
  ) {
    return null;
  }

  if (values && values.length !== targets.length) {
    return null;
  }

  const calls: NormalizedVerifierCall[] = [];
  for (const [index, target] of targets.entries()) {
    const callData = callDatas[index];
    const value = normalizeCallValue(values?.[index]);

    if (!isAddress(target) || !isHex(callData) || !value) {
      return null;
    }

    calls.push({
      data: callData,
      to: normalizeAddress(target),
      value,
    });
  }

  return calls;
}

function extractOperationKey(body: ThirdwebVerifierRequest, calls: readonly NormalizedVerifierCall[]): Hash | null {
  const sender = body.userOp?.sender;
  if (!sender || !body.chainId || calls.length === 0) {
    return null;
  }

  return buildFreeTransactionOperationKey({
    chainId: body.chainId,
    calls,
    sender,
  });
}

function isZeroCallValue(value: Hex) {
  return BigInt(value) === 0n;
}

function normalizeAddressArg(value: unknown): `0x${string}` | null {
  if (typeof value !== "string" || !isAddress(value)) {
    return null;
  }

  return normalizeAddress(value);
}

function isApprovalToAllowedSpender(callData: Hex, allowedSpenders: ReadonlySet<string>) {
  try {
    const decoded = decodeFunctionData({
      abi: ERC20_APPROVAL_ABI,
      data: callData,
    }) as { functionName: string; args: readonly unknown[] | undefined };
    const spender = normalizeAddressArg(decoded.args?.[0]);
    return decoded.functionName === "approve" && Boolean(spender && allowedSpenders.has(spender.toLowerCase()));
  } catch {
    return false;
  }
}

function validateSponsoredCalls(
  chainId: number,
  calls: readonly NormalizedVerifierCall[],
): { ok: true } | { ok: false; debugCode: "target_not_allowlisted" | "unsupported_operation" } {
  const contracts = getContractsForChain(chainId);
  const contractsByAddress = getContractsByAddress(chainId);
  const frontendRegistry = contracts?.FrontendRegistry;
  const rewardEscrow = contracts?.QuestionRewardPoolEscrow;
  const votingEngine = contracts?.RoundVotingEngine;
  const allowedApproveSpenders = new Set(
    [frontendRegistry?.address, rewardEscrow?.address]
      .filter((value): value is Address => Boolean(value))
      .map(value => value.toLowerCase()),
  );

  for (const call of calls) {
    if (!isZeroCallValue(call.value)) {
      return { ok: false, debugCode: "unsupported_operation" };
    }

    const contract = contractsByAddress.get(call.to.toLowerCase());
    if (!contract) {
      if (isApprovalToAllowedSpender(call.data, allowedApproveSpenders)) {
        continue;
      }
      return { ok: false, debugCode: "target_not_allowlisted" };
    }

    let decoded: { functionName: string; args: readonly unknown[] | undefined };
    try {
      decoded = decodeFunctionData({
        abi: contract.abi,
        data: call.data,
      }) as { functionName: string; args: readonly unknown[] | undefined };
    } catch {
      if (contract.name === "ContentRegistry") {
        try {
          decoded = decodeContentRegistryCallData(call.data);
        } catch {
          return { ok: false, debugCode: "unsupported_operation" };
        }
      } else {
        return { ok: false, debugCode: "unsupported_operation" };
      }
    }

    const args = decoded.args ?? [];
    const functionName = decoded.functionName;
    if (functionName === "approve") {
      const spender = normalizeAddressArg(args[0]);
      if (spender && allowedApproveSpenders.has(spender.toLowerCase())) {
        continue;
      }
    }

    switch (contract.name) {
      case "HumanReputation": {
        if (functionName === "transferAndCall") {
          const target = normalizeAddressArg(args[0]);
          if (target && votingEngine && target.toLowerCase() === votingEngine.address.toLowerCase()) {
            continue;
          }
        }

        return { ok: false, debugCode: "unsupported_operation" };
      }
      case "ContentRegistry":
        if (
          functionName === "cancelReservedSubmission" ||
          functionName === "reserveSubmission" ||
          functionName === "submitQuestion" ||
          functionName === "submitQuestionWithRewardAndRoundConfig" ||
          functionName === "submitQuestionBundleWithRewardAndRoundConfig"
        ) {
          continue;
        }
        return { ok: false, debugCode: "unsupported_operation" };
      case "FrontendRegistry":
        if (
          functionName === "register" ||
          functionName === "requestDeregister" ||
          functionName === "completeDeregister" ||
          functionName === "claimFees"
        ) {
          continue;
        }
        return { ok: false, debugCode: "unsupported_operation" };
      case "ProfileRegistry":
        if (
          functionName === "setProfile" ||
          functionName === "setAvatarAccent" ||
          functionName === "clearAvatarAccent"
        ) {
          continue;
        }
        return { ok: false, debugCode: "unsupported_operation" };
      case "RoundVotingEngine":
        if (functionName === "claimCancelledRoundRefund") {
          continue;
        }
        return { ok: false, debugCode: "unsupported_operation" };
      case "RoundRewardDistributor":
        if (
          functionName === "claimFrontendFee" ||
          functionName === "claimParticipationReward" ||
          functionName === "claimReward"
        ) {
          continue;
        }
        return { ok: false, debugCode: "unsupported_operation" };
      default:
        return { ok: false, debugCode: "target_not_allowlisted" };
    }
  }

  return { ok: true };
}

async function getActivePendingReservationCount(
  database: FreeTransactionDbWrite,
  params: { identityKey: string; now: Date },
) {
  const [row] = await database
    .select({
      pendingCount: sql<number>`count(*)`,
    })
    .from(freeTransactionReservations)
    .where(
      and(
        eq(freeTransactionReservations.identityKey, params.identityKey),
        eq(freeTransactionReservations.status, "pending"),
        sql`${freeTransactionReservations.expiresAt} > ${params.now}`,
      ),
    )
    .limit(1);

  return Number(row?.pendingCount ?? 0);
}

function logsIncludeWalletUserOperationSender(params: {
  logs: readonly TransactionVerificationLog[];
  walletAddress: `0x${string}`;
}) {
  const normalizedWalletAddress = params.walletAddress.toLowerCase();

  return parseEventLogs({
    abi: USER_OPERATION_RECEIPT_EVENT_ABI,
    logs: normalizeReceiptLogsForEventParsing(params.logs),
    strict: false,
  }).some(event => {
    const sender = event.args.sender;
    return typeof sender === "string" && sender.toLowerCase() === normalizedWalletAddress;
  });
}

function logsIncludeWalletExecutedEvent(params: {
  logs: readonly TransactionVerificationLog[];
  walletAddress: `0x${string}`;
}) {
  const normalizedWalletAddress = params.walletAddress.toLowerCase();

  return parseEventLogs({
    abi: EXECUTED_RECEIPT_EVENT_ABI,
    logs: normalizeReceiptLogsForEventParsing(params.logs),
    strict: false,
  }).some(event => {
    const user = event.args.user;
    return typeof user === "string" && user.toLowerCase() === normalizedWalletAddress;
  });
}

function logsIncludeWalletExecutionProof(params: {
  logs: readonly TransactionVerificationLog[];
  walletAddress: `0x${string}`;
}) {
  return logsIncludeWalletUserOperationSender(params) || logsIncludeWalletExecutedEvent(params);
}

function normalizeReceiptLogsForEventParsing(logs: readonly TransactionVerificationLog[]) {
  return logs.map(log => ({
    ...log,
    blockHash: null,
    blockNumber: null,
    logIndex: null,
    removed: false,
    topics: [...log.topics],
    transactionHash: null,
    transactionIndex: null,
  })) as Parameters<typeof parseEventLogs>[0]["logs"];
}

async function allTransactionHashesSucceeded(params: {
  chainId: number;
  transactionHashes: Hash[];
  walletAddress: `0x${string}`;
}) {
  const client = await getTransactionVerificationClient(params.chainId);
  if (!client || params.transactionHashes.length === 0) {
    return false;
  }

  const receipts = await Promise.all(
    params.transactionHashes.map(async hash => {
      try {
        const [receipt, transaction] = await Promise.all([
          client.getTransactionReceipt({ hash }),
          client.getTransaction({ hash }),
        ]);

        return {
          ok: receipt.status === "success" && Number(transaction.chainId) === params.chainId,
          from: transaction.from.toLowerCase(),
          matchesWallet:
            transaction.from.toLowerCase() === params.walletAddress.toLowerCase() ||
            logsIncludeWalletExecutionProof({
              logs: receipt.logs,
              walletAddress: params.walletAddress,
            }),
        };
      } catch {
        return { matchesWallet: false, ok: false };
      }
    }),
  );

  const hasWalletMismatch = receipts.some(receipt => receipt.ok && !receipt.matchesWallet);
  if (hasWalletMismatch) {
    console.warn("[thirdweb-free-tx] rejected sponsored transaction without wallet execution proof", {
      chainId: params.chainId,
      transactionHashes: params.transactionHashes,
      walletAddress: params.walletAddress,
    });
    return false;
  }

  return receipts.every(receipt => receipt.ok && receipt.matchesWallet);
}

export async function ensureFreeTransactionQuotaTable() {
  if (!ensureFreeTransactionQuotaTablePromise) {
    ensureFreeTransactionQuotaTablePromise = Promise.resolve();
  }

  await ensureFreeTransactionQuotaTablePromise;
}

export async function getFreeTransactionAllowanceSummary(params: { address: string; chainId: number }) {
  await ensureFreeTransactionQuotaTable();

  if (!isAddress(params.address)) {
    throw new Error("Invalid address");
  }

  const walletAddress = normalizeAddress(params.address);
  const voterIdTokenId = await (freeTransactionTestOverrides?.resolveVoterIdTokenId ?? resolveVoterIdTokenId)(
    walletAddress,
    params.chainId,
  );

  if (!voterIdTokenId) {
    return buildUnverifiedSummary({
      chainId: params.chainId,
      walletAddress,
    });
  }

  try {
    const summary = await readQuotaSummary({
      chainId: params.chainId,
      environment: getServerEnvironmentScope(),
      voterIdTokenId,
      walletAddress,
    });

    return (
      summary ??
      buildVerifiedFreeTransactionFallbackSummary({
        address: walletAddress,
        chainId: params.chainId,
        voterIdTokenId,
      })
    );
  } catch (error) {
    if (isFreeTransactionStoreUnavailableError(error)) {
      console.warn("[thirdweb-free-tx] quota store unavailable during summary lookup; failing open.", {
        address: walletAddress,
        chainId: params.chainId,
        voterIdTokenId,
      });
      return buildVerifiedFreeTransactionFallbackSummary({
        address: walletAddress,
        chainId: params.chainId,
        voterIdTokenId,
      });
    }

    throw error;
  }
}

export async function evaluateFreeTransactionAllowance(
  body: ThirdwebVerifierRequest,
): Promise<FreeTransactionAllowanceDecision> {
  await ensureFreeTransactionQuotaTable();

  if (typeof body.chainId !== "number") {
    return {
      isAllowed: false,
      debugCode: "invalid_chain",
      reason: DEFAULT_DENY_REASON,
    };
  }

  const sender = body.userOp?.sender;
  if (!sender || !isAddress(sender)) {
    return {
      isAllowed: false,
      debugCode: "invalid_sender",
      reason: DEFAULT_DENY_REASON,
    };
  }

  const calls = extractOperationCalls(body);
  if (!calls || calls.length === 0) {
    return {
      isAllowed: false,
      debugCode: "invalid_targets",
      reason: DEFAULT_DENY_REASON,
    };
  }

  const validatedCalls = validateSponsoredCalls(body.chainId, calls);
  if (!validatedCalls.ok) {
    return {
      isAllowed: false,
      debugCode: validatedCalls.debugCode,
      reason: DEFAULT_DENY_REASON,
    };
  }

  const operationKey = extractOperationKey(body, calls);
  if (!operationKey) {
    return {
      isAllowed: false,
      debugCode: "invalid_operation_key",
      reason: DEFAULT_DENY_REASON,
    };
  }

  const walletAddress = normalizeAddress(sender);
  const voterIdTokenId = await (freeTransactionTestOverrides?.resolveVoterIdTokenId ?? resolveVoterIdTokenId)(
    walletAddress,
    body.chainId,
  );

  if (!voterIdTokenId) {
    return {
      isAllowed: false,
      debugCode: "missing_voter_id",
      reason: NO_VOTER_ID_REASON,
      summary: buildUnverifiedSummary({
        chainId: body.chainId,
        walletAddress,
      }),
    };
  }

  const environment = getServerEnvironmentScope();

  try {
    return await db.transaction(async tx => {
      const identityKey = await ensureQuotaRow(tx, {
        chainId: body.chainId!,
        environment,
        voterIdTokenId,
        walletAddress,
      });
      const now = new Date();
      const expiresAt = new Date(now.getTime() + FREE_TRANSACTION_RESERVATION_TTL_MS);
      const [quotaRow] = await tx
        .select()
        .from(freeTransactionQuotas)
        .where(eq(freeTransactionQuotas.identityKey, identityKey))
        .limit(1);

      const normalizedQuotaRow = normalizeQuotaRow(quotaRow);
      if (!normalizedQuotaRow) {
        throw new Error("Failed to read free transaction quota.");
      }

      const activePendingReservations = await getActivePendingReservationCount(tx, {
        identityKey,
        now,
      });

      const [existingReservation] = await tx
        .select()
        .from(freeTransactionReservations)
        .where(eq(freeTransactionReservations.operationKey, operationKey))
        .limit(1);
      const normalizedReservation = normalizeReservationRow(existingReservation);

      const idempotentConfirmed =
        normalizedReservation?.status === "confirmed" &&
        normalizedReservation.confirmedAt &&
        now.getTime() - getTimestampMs(normalizedReservation.confirmedAt) <= FREE_TRANSACTION_IDEMPOTENCY_WINDOW_MS;

      if (
        normalizedReservation?.status === "pending" &&
        normalizedReservation.expiresAt &&
        getTimestampMs(normalizedReservation.expiresAt) > now.getTime()
      ) {
        return {
          isAllowed: true,
          summary: buildQuotaSummary({
            chainId: normalizedQuotaRow.chainId,
            environment: normalizedQuotaRow.environment,
            freeTxLimit: normalizedQuotaRow.freeTxLimit,
            freeTxUsed: normalizedQuotaRow.freeTxUsed,
            pendingReservations: activePendingReservations,
            voterIdTokenId: normalizedQuotaRow.voterIdTokenId,
            walletAddress,
          }),
        };
      }

      if (idempotentConfirmed) {
        return {
          isAllowed: true,
          summary: buildQuotaSummary({
            chainId: normalizedQuotaRow.chainId,
            environment: normalizedQuotaRow.environment,
            freeTxLimit: normalizedQuotaRow.freeTxLimit,
            freeTxUsed: normalizedQuotaRow.freeTxUsed,
            pendingReservations: activePendingReservations,
            voterIdTokenId: normalizedQuotaRow.voterIdTokenId,
            walletAddress,
          }),
        };
      }

      if (normalizedQuotaRow.freeTxUsed + activePendingReservations >= normalizedQuotaRow.freeTxLimit) {
        const [latestQuotaRow] = await tx
          .select()
          .from(freeTransactionQuotas)
          .where(eq(freeTransactionQuotas.identityKey, identityKey))
          .limit(1);

        const normalizedLatestQuotaRow = normalizeQuotaRow(latestQuotaRow);
        if (!normalizedLatestQuotaRow) {
          throw new Error("Failed to read free transaction quota.");
        }

        return {
          isAllowed: false,
          debugCode: "free_tx_exhausted",
          reason: FREE_TX_EXHAUSTED_REASON,
          summary: buildQuotaSummary({
            chainId: normalizedLatestQuotaRow.chainId,
            environment: normalizedLatestQuotaRow.environment,
            freeTxLimit: normalizedLatestQuotaRow.freeTxLimit,
            freeTxUsed: normalizedLatestQuotaRow.freeTxUsed,
            pendingReservations: activePendingReservations,
            voterIdTokenId: normalizedLatestQuotaRow.voterIdTokenId,
            walletAddress,
          }),
        };
      }

      if (existingReservation) {
        await tx
          .update(freeTransactionReservations)
          .set({
            identityKey,
            voterIdTokenId,
            chainId: body.chainId!,
            environment,
            walletAddress,
            status: "pending",
            txHashes: null,
            reservedAt: now,
            expiresAt,
            confirmedAt: null,
            releasedAt: null,
            updatedAt: now,
          })
          .where(eq(freeTransactionReservations.operationKey, operationKey));
      } else {
        await tx.insert(freeTransactionReservations).values({
          operationKey,
          identityKey,
          voterIdTokenId,
          chainId: body.chainId!,
          environment,
          walletAddress,
          status: "pending",
          txHashes: null,
          reservedAt: now,
          expiresAt,
          confirmedAt: null,
          releasedAt: null,
          updatedAt: now,
        });
      }

      return {
        isAllowed: true,
        summary: buildQuotaSummary({
          chainId: normalizedQuotaRow.chainId,
          environment: normalizedQuotaRow.environment,
          freeTxLimit: normalizedQuotaRow.freeTxLimit,
          freeTxUsed: normalizedQuotaRow.freeTxUsed,
          pendingReservations: activePendingReservations + 1,
          voterIdTokenId: normalizedQuotaRow.voterIdTokenId,
          walletAddress,
        }),
      };
    });
  } catch (error) {
    if (isFreeTransactionStoreUnavailableError(error)) {
      console.warn("[thirdweb-free-tx] quota store unavailable during verifier check; failing open.", {
        chainId: body.chainId,
        sender: walletAddress,
        voterIdTokenId,
      });
      return {
        isAllowed: true,
        debugCode: "store_unavailable_fail_open",
        summary: buildVerifiedFreeTransactionFallbackSummary({
          address: walletAddress,
          chainId: body.chainId,
          voterIdTokenId,
        }),
      };
    }

    throw error;
  }
}

export async function confirmFreeTransactionReservation(params: {
  address: string;
  chainId: number;
  operationKey: string;
  transactionHashes: string[];
}) {
  if (!isAddress(params.address) || !Number.isFinite(params.chainId) || !isHash(params.operationKey)) {
    throw new Error("Invalid free transaction confirmation payload");
  }

  const normalizedTransactionHashes = [...new Set(params.transactionHashes.filter(isHash))] as Hash[];
  if (normalizedTransactionHashes.length === 0) {
    throw new Error("At least one transaction hash is required");
  }

  const walletAddress = normalizeAddress(params.address);
  const allSucceeded = await (
    freeTransactionTestOverrides?.allTransactionHashesSucceeded ?? allTransactionHashesSucceeded
  )({
    chainId: params.chainId,
    transactionHashes: normalizedTransactionHashes,
    walletAddress,
  });

  if (!allSucceeded) {
    throw new Error("Sponsored transaction receipts could not be verified");
  }

  try {
    await ensureFreeTransactionQuotaTable();

    await db.transaction(async tx => {
      const [reservation] = await tx
        .select()
        .from(freeTransactionReservations)
        .where(eq(freeTransactionReservations.operationKey, params.operationKey as Hash))
        .limit(1);
      const normalizedReservation = normalizeReservationRow(reservation);

      if (!normalizedReservation) {
        return;
      }

      if (
        normalizedReservation.chainId !== params.chainId ||
        normalizedReservation.walletAddress.toLowerCase() !== walletAddress.toLowerCase()
      ) {
        throw new Error("Sponsored transaction reservation does not match the current wallet");
      }

      if (normalizedReservation.status === "confirmed") {
        return;
      }

      if (normalizedReservation.status !== "pending") {
        return;
      }

      const now = new Date();
      const updatedReservations = await tx
        .update(freeTransactionReservations)
        .set({
          status: "confirmed",
          txHashes: JSON.stringify(normalizedTransactionHashes),
          confirmedAt: now,
          releasedAt: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(freeTransactionReservations.operationKey, params.operationKey as Hash),
            eq(freeTransactionReservations.status, "pending"),
          ),
        )
        .returning({
          identityKey: freeTransactionReservations.identityKey,
        });

      if (updatedReservations.length === 0) {
        return;
      }

      const updatedIdentityKey =
        updatedReservations[0]?.identityKey ??
        (updatedReservations[0] as { identity_key?: string; identitykey?: string } | undefined)?.identity_key ??
        (updatedReservations[0] as { identity_key?: string; identitykey?: string } | undefined)?.identitykey;
      if (!updatedIdentityKey) {
        return;
      }

      await tx
        .update(freeTransactionQuotas)
        .set({
          lastWalletAddress: walletAddress,
          freeTxUsed: sql`${freeTransactionQuotas.freeTxUsed} + 1`,
          exhaustedAt: sql`
            CASE
              WHEN ${freeTransactionQuotas.freeTxUsed} + 1 >= ${freeTransactionQuotas.freeTxLimit}
              THEN ${now}
              ELSE ${freeTransactionQuotas.exhaustedAt}
            END
          `,
          updatedAt: now,
        })
        .where(eq(freeTransactionQuotas.identityKey, updatedIdentityKey));
    });
  } catch (error) {
    if (isFreeTransactionStoreUnavailableError(error)) {
      console.warn("[thirdweb-free-tx] quota store unavailable during confirmation; failing open.", {
        address: walletAddress,
        chainId: params.chainId,
        operationKey: params.operationKey,
      });
      return;
    }

    throw error;
  }
}
