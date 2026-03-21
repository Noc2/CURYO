import deployedContracts from "@curyo/contracts/deployedContracts";
import { and, eq, sql } from "drizzle-orm";
import "server-only";
import { type Abi, type Address, createPublicClient, getAddress, http, isAddress } from "viem";
import { db } from "~~/lib/db";
import { freeTransactionQuotas } from "~~/lib/db/schema";
import {
  getFreeTransactionLimit,
  getServerEnvironmentScope,
  getServerRpcOverrides,
  getServerTargetNetworkById,
} from "~~/lib/env/server";

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

async function ensureQuotaRow(params: {
  chainId: number;
  environment: string;
  voterIdTokenId: string;
  walletAddress: `0x${string}`;
}) {
  const now = new Date();
  const freeTxLimit = getFreeTransactionLimit();
  const identityKey = buildIdentityKey(params);

  await db
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

async function readQuotaSummary(params: {
  chainId: number;
  environment: string;
  voterIdTokenId: string;
  walletAddress: `0x${string}`;
}) {
  const identityKey = await ensureQuotaRow(params);
  const [row] = await db
    .select()
    .from(freeTransactionQuotas)
    .where(eq(freeTransactionQuotas.identityKey, identityKey))
    .limit(1);

  if (!row) {
    return null;
  }

  return {
    chainId: row.chainId,
    environment: row.environment,
    limit: row.freeTxLimit,
    used: row.freeTxUsed,
    remaining: Math.max(row.freeTxLimit - row.freeTxUsed, 0),
    verified: true,
    exhausted: row.freeTxUsed >= row.freeTxLimit,
    walletAddress: params.walletAddress,
    voterIdTokenId: row.voterIdTokenId,
  } satisfies FreeTransactionAllowanceSummary;
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

export async function ensureFreeTransactionQuotaTable() {
  if (!ensureFreeTransactionQuotaTablePromise) {
    ensureFreeTransactionQuotaTablePromise = (async () => {
      try {
        await db.run(
          sql.raw(`
            CREATE TABLE IF NOT EXISTS free_transaction_quotas (
              identity_key TEXT PRIMARY KEY NOT NULL,
              voter_id_token_id TEXT NOT NULL,
              chain_id INTEGER NOT NULL,
              environment TEXT NOT NULL,
              last_wallet_address TEXT NOT NULL,
              free_tx_limit INTEGER NOT NULL,
              free_tx_used INTEGER NOT NULL,
              exhausted_at INTEGER,
              created_at INTEGER NOT NULL,
              updated_at INTEGER NOT NULL
            )
          `),
        );
        await db.run(
          sql.raw(`
            CREATE UNIQUE INDEX IF NOT EXISTS free_transaction_quotas_token_chain_env_unique
            ON free_transaction_quotas (voter_id_token_id, chain_id, environment)
          `),
        );
        await db.run(
          sql.raw(`
            CREATE INDEX IF NOT EXISTS free_transaction_quotas_chain_updated_at_idx
            ON free_transaction_quotas (chain_id, updated_at)
          `),
        );
      } catch (err) {
        ensureFreeTransactionQuotaTablePromise = null;
        throw err;
      }
    })();
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
  const identityKey = await ensureQuotaRow({
    chainId: body.chainId,
    environment,
    voterIdTokenId,
    walletAddress,
  });
  const now = new Date();

  const updatedRows = await db
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
    .where(
      and(
        eq(freeTransactionQuotas.identityKey, identityKey),
        sql`${freeTransactionQuotas.freeTxUsed} < ${freeTransactionQuotas.freeTxLimit}`,
      ),
    )
    .returning({
      chainId: freeTransactionQuotas.chainId,
      environment: freeTransactionQuotas.environment,
      limit: freeTransactionQuotas.freeTxLimit,
      used: freeTransactionQuotas.freeTxUsed,
      walletAddress: freeTransactionQuotas.lastWalletAddress,
      voterIdTokenId: freeTransactionQuotas.voterIdTokenId,
    });

  if (updatedRows.length === 0) {
    const summary = await readQuotaSummary({
      chainId: body.chainId,
      environment,
      voterIdTokenId,
      walletAddress,
    });

    return {
      isAllowed: false,
      reason: FREE_TX_EXHAUSTED_REASON,
      summary: summary ?? undefined,
    };
  }

  const row = updatedRows[0];
  const summary = {
    chainId: row.chainId,
    environment: row.environment,
    limit: row.limit,
    used: row.used,
    remaining: Math.max(row.limit - row.used, 0),
    verified: true,
    exhausted: row.used >= row.limit,
    walletAddress,
    voterIdTokenId: row.voterIdTokenId,
  } satisfies FreeTransactionAllowanceSummary;

  return {
    isAllowed: true,
    summary,
  };
}
