import deployedContracts from "@curyo/contracts/deployedContracts";
import { and, eq, sql } from "drizzle-orm";
import "server-only";
import { type Abi, type Address, type Hash, createPublicClient, getAddress, http, isAddress, isHash } from "viem";
import { db } from "~~/lib/db";
import { freeTransactionQuotas, freeTransactionReservations } from "~~/lib/db/schema";
import {
  getFreeTransactionLimit,
  getServerEnvironmentScope,
  getServerRpcOverrides,
  getServerTargetNetworkById,
} from "~~/lib/env/server";
import { buildFreeTransactionOperationKey } from "~~/lib/thirdweb/freeTransactionOperation";

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

type FreeTransactionReservationStatus = "pending" | "confirmed" | "released";

type FreeTransactionDbRead = Pick<typeof db, "select">;
type FreeTransactionDbWrite = Pick<typeof db, "insert" | "select" | "update">;

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
    }
  | {
      isAllowed: false;
      reason: string;
      summary?: FreeTransactionAllowanceSummary;
    };

const DEFAULT_DENY_REASON = "Transaction not sponsored.";
const FREE_TX_EXHAUSTED_REASON = "Free transactions used up. Add CELO to continue.";
const NO_VOTER_ID_REASON = "Verify your ID to unlock free transactions.";
const FREE_TRANSACTION_RESERVATION_TTL_MS = 30 * 60_000;
const FREE_TRANSACTION_IDEMPOTENCY_WINDOW_MS = 2 * 60_000;

let ensureFreeTransactionQuotaTablePromise: Promise<void> | null = null;

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

function getAllowedContractAddresses(chainId: number) {
  const contracts = getContractsForChain(chainId);
  if (!contracts) {
    return new Set<string>();
  }

  return new Set(
    Object.entries(contracts)
      .filter(([name, contract]) => !name.endsWith("Lib") && isCallableAbi(contract.abi))
      .map(([, contract]) => contract.address.toLowerCase()),
  );
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
  pendingCount: number;
  freeTxUsed: number;
  voterIdTokenId: string;
  walletAddress: `0x${string}`;
}) {
  const used = params.freeTxUsed + params.pendingCount;

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

async function readActivePendingReservationCount(
  database: FreeTransactionDbRead,
  params: {
    identityKey: string;
    now: Date;
    excludeOperationKey?: Hash;
  },
) {
  const conditions = [
    eq(freeTransactionReservations.identityKey, params.identityKey),
    eq(freeTransactionReservations.status, "pending" satisfies FreeTransactionReservationStatus),
    sql`${freeTransactionReservations.expiresAt} > ${params.now}`,
  ];

  if (params.excludeOperationKey) {
    conditions.push(sql`${freeTransactionReservations.operationKey} <> ${params.excludeOperationKey}`);
  }

  const [row] = await database
    .select({
      count: sql<number>`count(*)`,
    })
    .from(freeTransactionReservations)
    .where(and(...conditions));

  return Number(row?.count ?? 0);
}

async function readQuotaSummary(params: {
  chainId: number;
  environment: string;
  voterIdTokenId: string;
  walletAddress: `0x${string}`;
}) {
  const identityKey = await ensureQuotaRow(db, params);
  const [row] = await db
    .select()
    .from(freeTransactionQuotas)
    .where(eq(freeTransactionQuotas.identityKey, identityKey))
    .limit(1);

  if (!row) {
    return null;
  }

  const pendingCount = await readActivePendingReservationCount(db, {
    identityKey,
    now: new Date(),
  });

  return buildQuotaSummary({
    chainId: row.chainId,
    environment: row.environment,
    freeTxLimit: row.freeTxLimit,
    freeTxUsed: row.freeTxUsed,
    pendingCount,
    voterIdTokenId: row.voterIdTokenId,
    walletAddress: params.walletAddress,
  });
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

function extractTargetAddresses(body: ThirdwebVerifierRequest) {
  const rawTargets = [...(body.userOp?.targets ?? []), ...(body.userOp?.data?.targets ?? [])];
  const normalizedTargets = new Set<string>();

  for (const target of rawTargets) {
    if (!isAddress(target)) {
      return null;
    }

    normalizedTargets.add(normalizeAddress(target).toLowerCase());
  }

  return normalizedTargets;
}

function extractOperationKey(body: ThirdwebVerifierRequest): Hash | null {
  const sender = body.userOp?.sender;
  if (!sender || !body.chainId) {
    return null;
  }

  const targets = body.userOp?.data?.targets ?? body.userOp?.targets ?? [];
  if (targets.length === 0) {
    return null;
  }

  const callDatas = body.userOp?.data?.callDatas;
  const values = body.userOp?.data?.values;

  if (callDatas && callDatas.length !== targets.length) {
    return null;
  }

  if (values && values.length !== targets.length) {
    return null;
  }

  return buildFreeTransactionOperationKey({
    chainId: body.chainId,
    calls: targets.map((target, index) => ({
      data: callDatas?.[index] as `0x${string}` | undefined,
      to: target as `0x${string}`,
      value: values?.[index] as `0x${string}` | undefined,
    })),
    sender,
  });
}

async function allTransactionHashesSucceeded(params: {
  chainId: number;
  transactionHashes: Hash[];
  walletAddress: `0x${string}`;
}) {
  const client = await getPublicClientForChain(params.chainId);
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
          ok:
            receipt.status === "success" &&
            transaction.from.toLowerCase() === params.walletAddress.toLowerCase() &&
            Number(transaction.chainId) === params.chainId,
        };
      } catch {
        return { ok: false };
      }
    }),
  );

  return receipts.every(receipt => receipt.ok);
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
  const voterIdTokenId = await resolveVoterIdTokenId(walletAddress, params.chainId);

  if (!voterIdTokenId) {
    return buildUnverifiedSummary({
      chainId: params.chainId,
      walletAddress,
    });
  }

  const summary = await readQuotaSummary({
    chainId: params.chainId,
    environment: getServerEnvironmentScope(),
    voterIdTokenId,
    walletAddress,
  });

  return (
    summary ??
    buildUnverifiedSummary({
      chainId: params.chainId,
      walletAddress,
    })
  );
}

export async function evaluateFreeTransactionAllowance(
  body: ThirdwebVerifierRequest,
): Promise<FreeTransactionAllowanceDecision> {
  await ensureFreeTransactionQuotaTable();

  if (typeof body.chainId !== "number") {
    return {
      isAllowed: false,
      reason: DEFAULT_DENY_REASON,
    };
  }

  const sender = body.userOp?.sender;
  if (!sender || !isAddress(sender)) {
    return {
      isAllowed: false,
      reason: DEFAULT_DENY_REASON,
    };
  }

  const allowedTargets = getAllowedContractAddresses(body.chainId);
  const targets = extractTargetAddresses(body);
  if (!targets || targets.size === 0) {
    return {
      isAllowed: false,
      reason: DEFAULT_DENY_REASON,
    };
  }

  if ([...targets].some(target => !allowedTargets.has(target))) {
    return {
      isAllowed: false,
      reason: DEFAULT_DENY_REASON,
    };
  }

  const operationKey = extractOperationKey(body);
  if (!operationKey) {
    return {
      isAllowed: false,
      reason: DEFAULT_DENY_REASON,
    };
  }

  const walletAddress = normalizeAddress(sender);
  const voterIdTokenId = await resolveVoterIdTokenId(walletAddress, body.chainId);

  if (!voterIdTokenId) {
    return {
      isAllowed: false,
      reason: NO_VOTER_ID_REASON,
      summary: buildUnverifiedSummary({
        chainId: body.chainId,
        walletAddress,
      }),
    };
  }

  const environment = getServerEnvironmentScope();

  return db.transaction(async tx => {
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

    if (!quotaRow) {
      throw new Error("Failed to read free transaction quota.");
    }

    const [existingReservation] = await tx
      .select()
      .from(freeTransactionReservations)
      .where(eq(freeTransactionReservations.operationKey, operationKey))
      .limit(1);

    const pendingCountExcludingCurrent = await readActivePendingReservationCount(tx, {
      identityKey,
      now,
      excludeOperationKey: operationKey,
    });

    const idempotentConfirmed =
      existingReservation?.status === "confirmed" &&
      existingReservation.confirmedAt &&
      now.getTime() - getTimestampMs(existingReservation.confirmedAt) <= FREE_TRANSACTION_IDEMPOTENCY_WINDOW_MS;

    if (existingReservation?.status === "pending" && getTimestampMs(existingReservation.expiresAt) > now.getTime()) {
      return {
        isAllowed: true,
        summary: buildQuotaSummary({
          chainId: quotaRow.chainId,
          environment: quotaRow.environment,
          freeTxLimit: quotaRow.freeTxLimit,
          freeTxUsed: quotaRow.freeTxUsed,
          pendingCount: pendingCountExcludingCurrent + 1,
          voterIdTokenId: quotaRow.voterIdTokenId,
          walletAddress,
        }),
      };
    }

    if (idempotentConfirmed) {
      return {
        isAllowed: true,
        summary: buildQuotaSummary({
          chainId: quotaRow.chainId,
          environment: quotaRow.environment,
          freeTxLimit: quotaRow.freeTxLimit,
          freeTxUsed: quotaRow.freeTxUsed,
          pendingCount: pendingCountExcludingCurrent,
          voterIdTokenId: quotaRow.voterIdTokenId,
          walletAddress,
        }),
      };
    }

    if (quotaRow.freeTxUsed + pendingCountExcludingCurrent >= quotaRow.freeTxLimit) {
      return {
        isAllowed: false,
        reason: FREE_TX_EXHAUSTED_REASON,
        summary: buildQuotaSummary({
          chainId: quotaRow.chainId,
          environment: quotaRow.environment,
          freeTxLimit: quotaRow.freeTxLimit,
          freeTxUsed: quotaRow.freeTxUsed,
          pendingCount: pendingCountExcludingCurrent,
          voterIdTokenId: quotaRow.voterIdTokenId,
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

    await tx
      .update(freeTransactionQuotas)
      .set({
        lastWalletAddress: walletAddress,
        updatedAt: now,
      })
      .where(eq(freeTransactionQuotas.identityKey, identityKey));

    return {
      isAllowed: true,
      summary: buildQuotaSummary({
        chainId: quotaRow.chainId,
        environment: quotaRow.environment,
        freeTxLimit: quotaRow.freeTxLimit,
        freeTxUsed: quotaRow.freeTxUsed,
        pendingCount: pendingCountExcludingCurrent + 1,
        voterIdTokenId: quotaRow.voterIdTokenId,
        walletAddress,
      }),
    };
  });
}

export async function confirmFreeTransactionReservation(params: {
  address: string;
  chainId: number;
  operationKey: string;
  transactionHashes: string[];
}) {
  await ensureFreeTransactionQuotaTable();

  if (!isAddress(params.address) || !Number.isFinite(params.chainId) || !isHash(params.operationKey)) {
    throw new Error("Invalid free transaction confirmation payload");
  }

  const normalizedTransactionHashes = [...new Set(params.transactionHashes.filter(isHash))] as Hash[];
  if (normalizedTransactionHashes.length === 0) {
    throw new Error("At least one transaction hash is required");
  }

  const walletAddress = normalizeAddress(params.address);
  const allSucceeded = await allTransactionHashesSucceeded({
    chainId: params.chainId,
    transactionHashes: normalizedTransactionHashes,
    walletAddress,
  });

  if (!allSucceeded) {
    throw new Error("Sponsored transaction receipts could not be verified");
  }

  await db.transaction(async tx => {
    const [reservation] = await tx
      .select()
      .from(freeTransactionReservations)
      .where(eq(freeTransactionReservations.operationKey, params.operationKey as Hash))
      .limit(1);

    if (!reservation) {
      return;
    }

    if (
      reservation.chainId !== params.chainId ||
      reservation.walletAddress.toLowerCase() !== walletAddress.toLowerCase()
    ) {
      throw new Error("Sponsored transaction reservation does not match the current wallet");
    }

    if (reservation.status === "confirmed") {
      return;
    }

    if (reservation.status !== "pending") {
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
      .where(eq(freeTransactionQuotas.identityKey, updatedReservations[0].identityKey));
  });
}

export async function releaseFreeTransactionReservation(params: {
  address: string;
  chainId: number;
  operationKey: string;
}) {
  await ensureFreeTransactionQuotaTable();

  if (!isAddress(params.address) || !Number.isFinite(params.chainId) || !isHash(params.operationKey)) {
    throw new Error("Invalid free transaction release payload");
  }

  const walletAddress = normalizeAddress(params.address);
  const now = new Date();

  await db
    .update(freeTransactionReservations)
    .set({
      status: "released",
      releasedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(freeTransactionReservations.operationKey, params.operationKey as Hash),
        eq(freeTransactionReservations.chainId, params.chainId),
        eq(freeTransactionReservations.walletAddress, walletAddress),
        eq(freeTransactionReservations.status, "pending"),
      ),
    );
}
