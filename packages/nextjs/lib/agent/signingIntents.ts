import { createHash, randomBytes } from "crypto";
import "server-only";
import { type Address, type Hex, isAddress } from "viem";
import { dbClient } from "~~/lib/db";
import { McpToolError, callPublicCuryoMcpTool } from "~~/lib/mcp/tools";
import { parseX402QuestionRequest } from "~~/lib/x402/questionPayload";

type JsonObject = Record<string, unknown>;

export type AgentSigningIntentStatus = "pending" | "prepared" | "submitted" | "failed" | "expired";

export type AgentSigningIntentRecord = {
  chainId: number | null;
  clientRequestId: string | null;
  completedAt: Date | null;
  createdAt: Date;
  error: string | null;
  expiresAt: Date;
  id: string;
  operationKey: `0x${string}` | null;
  payloadHash: string | null;
  paymentMode: "wallet_calls" | "x402_authorization";
  requestBody: JsonObject;
  status: AgentSigningIntentStatus;
  tokenHash: string;
  transactionHashes: Hex[];
  updatedAt: Date;
  walletAddress: Address | null;
};

const DEFAULT_SIGNING_INTENT_TTL_MS = 30 * 60 * 1000;
const MAX_SIGNING_INTENT_TTL_MS = 24 * 60 * 60 * 1000;

function nowDate() {
  return new Date();
}

function randomToken() {
  return randomBytes(32).toString("base64url");
}

function randomIntentId() {
  return `asi_${randomBytes(16).toString("hex")}`;
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function asJsonObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new McpToolError("Signing intent request body must be a JSON object.");
  }
  return value as JsonObject;
}

function parsePaymentMode(value: unknown): "wallet_calls" | "x402_authorization" {
  if (value === undefined || value === null || value === "" || value === "wallet_calls" || value === "agent_wallet") {
    return "wallet_calls";
  }
  if (value === "x402_authorization" || value === "native_x402" || value === "x402") {
    return "x402_authorization";
  }
  throw new McpToolError("paymentMode must be wallet_calls or x402_authorization.");
}

function parseOptionalAddress(value: unknown, fieldName: string): Address | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "string" && isAddress(value)) return value as Address;
  throw new McpToolError(`${fieldName} must be an EVM address.`);
}

function parseTransactionHashes(value: unknown): Hex[] {
  if (!Array.isArray(value)) {
    throw new McpToolError("transactionHashes must be an array.");
  }
  const hashes = value.filter((hash): hash is Hex => typeof hash === "string") as Hex[];
  if (hashes.length === 0 || hashes.length !== value.length) {
    throw new McpToolError("transactionHashes must contain at least one transaction hash.");
  }
  return hashes;
}

function parseStoredJson(value: string): JsonObject {
  try {
    return asJsonObject(JSON.parse(value));
  } catch {
    throw new McpToolError("Signing intent stored request body is invalid.", 500);
  }
}

function parseStoredHashes(value: string | null): Hex[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((entry): entry is Hex => typeof entry === "string") : [];
  } catch {
    return [];
  }
}

function rowToIntent(row: Record<string, unknown> | undefined): AgentSigningIntentRecord | null {
  if (!row) return null;
  return {
    chainId: row.chain_id === null || row.chain_id === undefined ? null : Number(row.chain_id),
    clientRequestId: typeof row.client_request_id === "string" ? row.client_request_id : null,
    completedAt:
      row.completed_at instanceof Date
        ? row.completed_at
        : row.completed_at
          ? new Date(String(row.completed_at))
          : null,
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(String(row.created_at)),
    error: typeof row.error === "string" ? row.error : null,
    expiresAt: row.expires_at instanceof Date ? row.expires_at : new Date(String(row.expires_at)),
    id: String(row.id),
    operationKey: typeof row.operation_key === "string" ? (row.operation_key as `0x${string}`) : null,
    payloadHash: typeof row.payload_hash === "string" ? row.payload_hash : null,
    paymentMode: parsePaymentMode(row.payment_mode),
    requestBody: parseStoredJson(String(row.request_body)),
    status: String(row.status) as AgentSigningIntentStatus,
    tokenHash: String(row.token_hash),
    transactionHashes: parseStoredHashes(typeof row.transaction_hashes === "string" ? row.transaction_hashes : null),
    updatedAt: row.updated_at instanceof Date ? row.updated_at : new Date(String(row.updated_at)),
    walletAddress:
      typeof row.wallet_address === "string" && isAddress(row.wallet_address) ? (row.wallet_address as Address) : null,
  };
}

function signingUrl(params: { intentId: string; origin: string; token: string }) {
  const url = new URL(`/agent/sign/${params.intentId}`, params.origin);
  url.searchParams.set("token", params.token);
  return url.toString();
}

function assertFresh(intent: AgentSigningIntentRecord) {
  if (intent.expiresAt.getTime() <= Date.now()) {
    throw new McpToolError("Signing intent has expired.", 410);
  }
}

async function markIntentExpired(intent: AgentSigningIntentRecord) {
  if (intent.status === "expired" || intent.status === "submitted") return;
  const now = nowDate();
  await dbClient.execute({
    sql: `
      UPDATE agent_signing_intents
      SET status = 'expired',
          updated_at = ?
      WHERE id = ?
    `,
    args: [now, intent.id],
  });
}

async function loadIntentByToken(params: { intentId: string; token: string }): Promise<AgentSigningIntentRecord> {
  const tokenHash = hashToken(params.token);
  const result = await dbClient.execute({
    sql: `
      SELECT *
      FROM agent_signing_intents
      WHERE id = ? AND token_hash = ?
      LIMIT 1
    `,
    args: [params.intentId, tokenHash],
  });
  const intent = rowToIntent(result.rows[0]);
  if (!intent) {
    throw new McpToolError("Signing intent was not found.", 404);
  }
  if (intent.expiresAt.getTime() <= Date.now() && intent.status !== "submitted") {
    await markIntentExpired(intent);
    return { ...intent, status: "expired" };
  }
  return intent;
}

function signingIntentResponse(intent: AgentSigningIntentRecord, extras: JsonObject = {}) {
  return {
    chainId: intent.chainId,
    clientRequestId: intent.clientRequestId,
    completedAt: intent.completedAt?.toISOString() ?? null,
    createdAt: intent.createdAt.toISOString(),
    error: intent.error,
    expiresAt: intent.expiresAt.toISOString(),
    id: intent.id,
    operationKey: intent.operationKey,
    payloadHash: intent.payloadHash,
    paymentMode: intent.paymentMode,
    requestBody: intent.requestBody,
    status: intent.status,
    transactionHashes: intent.transactionHashes,
    updatedAt: intent.updatedAt.toISOString(),
    walletAddress: intent.walletAddress,
    ...extras,
  };
}

export async function createAgentSigningIntent(params: { origin: string; requestBody: unknown; ttlMs?: number }) {
  const requestBody = asJsonObject(params.requestBody);
  const payload = parseX402QuestionRequest(requestBody);
  if (requestBody.maxPaymentAmount === undefined || requestBody.maxPaymentAmount === null) {
    throw new McpToolError("maxPaymentAmount is required for browser signing links.");
  }

  const paymentMode = parsePaymentMode(requestBody.paymentMode ?? requestBody.fundingMode);
  const walletAddress = parseOptionalAddress(
    requestBody.walletAddress ?? requestBody.agentWalletAddress,
    "walletAddress",
  );
  const token = randomToken();
  const id = randomIntentId();
  const now = nowDate();
  const ttlMs = Math.min(Math.max(params.ttlMs ?? DEFAULT_SIGNING_INTENT_TTL_MS, 60_000), MAX_SIGNING_INTENT_TTL_MS);
  const expiresAt = new Date(now.getTime() + ttlMs);

  await dbClient.execute({
    sql: `
      INSERT INTO agent_signing_intents (
        id,
        token_hash,
        status,
        chain_id,
        client_request_id,
        payment_mode,
        wallet_address,
        request_body,
        expires_at,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    args: [
      id,
      hashToken(token),
      "pending",
      payload.chainId,
      payload.clientRequestId,
      paymentMode,
      walletAddress,
      JSON.stringify(requestBody),
      expiresAt,
      now,
      now,
    ],
  });

  const intent: AgentSigningIntentRecord = {
    chainId: payload.chainId,
    clientRequestId: payload.clientRequestId,
    completedAt: null,
    createdAt: now,
    error: null,
    expiresAt,
    id,
    operationKey: null,
    payloadHash: null,
    paymentMode,
    requestBody,
    status: "pending",
    tokenHash: hashToken(token),
    transactionHashes: [],
    updatedAt: now,
    walletAddress,
  };

  return signingIntentResponse(intent, {
    signingUrl: signingUrl({ intentId: id, origin: params.origin, token }),
  });
}

export async function getAgentSigningIntent(params: { intentId: string; token: string }) {
  const intent = await loadIntentByToken(params);
  return signingIntentResponse(intent);
}

export async function prepareAgentSigningIntent(params: {
  intentId: string;
  paymentAuthorization?: unknown;
  token: string;
  walletAddress: unknown;
}) {
  const intent = await loadIntentByToken(params);
  assertFresh(intent);
  if (intent.status === "submitted") {
    return signingIntentResponse(intent);
  }

  const walletAddress = parseOptionalAddress(params.walletAddress, "walletAddress");
  if (!walletAddress) {
    throw new McpToolError("walletAddress is required to prepare a browser signing intent.");
  }
  if (intent.walletAddress && intent.walletAddress.toLowerCase() !== walletAddress.toLowerCase()) {
    throw new McpToolError("Connected wallet does not match this signing intent.", 403);
  }

  try {
    const body = (await callPublicCuryoMcpTool({
      arguments: {
        ...intent.requestBody,
        paymentAuthorization: params.paymentAuthorization,
        paymentMode: intent.paymentMode,
        walletAddress,
      },
      name: "curyo_ask_humans",
    })) as JsonObject;

    const operationKey = typeof body.operationKey === "string" ? (body.operationKey as `0x${string}`) : null;
    const payloadHash = typeof body.payloadHash === "string" ? body.payloadHash : null;
    const now = nowDate();
    await dbClient.execute({
      sql: `
        UPDATE agent_signing_intents
        SET status = ?,
            wallet_address = ?,
            operation_key = ?,
            payload_hash = ?,
            error = NULL,
            updated_at = ?
        WHERE id = ?
      `,
      args: ["prepared", walletAddress, operationKey, payloadHash, now, intent.id],
    });

    return signingIntentResponse(
      {
        ...intent,
        operationKey,
        payloadHash,
        status: "prepared",
        updatedAt: now,
        walletAddress,
      },
      body,
    );
  } catch (error) {
    const now = nowDate();
    await dbClient.execute({
      sql: `
        UPDATE agent_signing_intents
        SET status = 'failed',
            error = ?,
            updated_at = ?
        WHERE id = ?
      `,
      args: [error instanceof Error ? error.message : String(error), now, intent.id],
    });
    throw error;
  }
}

export async function completeAgentSigningIntent(params: {
  intentId: string;
  token: string;
  transactionHashes: unknown;
}) {
  const intent = await loadIntentByToken(params);
  assertFresh(intent);
  if (!intent.operationKey) {
    throw new McpToolError("Prepare this signing intent before completing it.");
  }
  const transactionHashes = parseTransactionHashes(params.transactionHashes);

  try {
    const body = (await callPublicCuryoMcpTool({
      arguments: {
        operationKey: intent.operationKey,
        transactionHashes,
      },
      name: "curyo_confirm_ask_transactions",
    })) as JsonObject;
    const status = body.status === "submitted" ? "submitted" : "prepared";
    const now = nowDate();
    await dbClient.execute({
      sql: `
        UPDATE agent_signing_intents
        SET status = ?,
            transaction_hashes = ?,
            error = NULL,
            completed_at = CASE WHEN ? = 'submitted' THEN ? ELSE completed_at END,
            updated_at = ?
        WHERE id = ?
      `,
      args: [status, JSON.stringify(transactionHashes), status, now, now, intent.id],
    });

    return signingIntentResponse(
      {
        ...intent,
        completedAt: status === "submitted" ? now : intent.completedAt,
        status,
        transactionHashes,
        updatedAt: now,
      },
      body,
    );
  } catch (error) {
    const now = nowDate();
    await dbClient.execute({
      sql: `
        UPDATE agent_signing_intents
        SET status = 'failed',
            transaction_hashes = ?,
            error = ?,
            updated_at = ?
        WHERE id = ?
      `,
      args: [JSON.stringify(transactionHashes), error instanceof Error ? error.message : String(error), now, intent.id],
    });
    throw error;
  }
}
