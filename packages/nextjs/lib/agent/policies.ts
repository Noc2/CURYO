import { createHash, randomBytes, randomUUID } from "crypto";
import "server-only";
import { dbClient } from "~~/lib/db";
import type { McpAgentAuth } from "~~/lib/mcp/auth";
import { isValidWalletAddress, normalizeWalletAddress } from "~~/lib/watchlist/contentWatch";

export const AGENT_POLICY_STATUSES = ["active", "paused", "revoked"] as const;
export type AgentPolicyStatus = (typeof AGENT_POLICY_STATUSES)[number];

const MCP_SCOPE_VALUES = ["curyo:ask", "curyo:balance", "curyo:quote", "curyo:read"] as const;
const DEFAULT_AGENT_SCOPES = MCP_SCOPE_VALUES;
const TOKEN_PREFIX = "curyo_mcp_";

export type AgentPolicyRecord = {
  agentId: string;
  agentWalletAddress: `0x${string}`;
  categories: string[];
  createdAt: string;
  dailyBudgetAtomic: string;
  expiresAt: string | null;
  hasToken: boolean;
  id: string;
  ownerWalletAddress: `0x${string}`;
  perAskLimitAtomic: string;
  revokedAt: string | null;
  scopes: string[];
  status: AgentPolicyStatus;
  tokenIssuedAt: string | null;
  tokenRevokedAt: string | null;
  updatedAt: string;
};

export type AgentAskSummary = {
  categoryId: string;
  chainId: number;
  clientRequestId: string;
  contentId: string | null;
  createdAt: string;
  error: string | null;
  operationKey: `0x${string}`;
  paymentAmount: string;
  status: string;
  updatedAt: string;
};

export class AgentPolicyLifecycleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentPolicyLifecycleError";
  }
}

export type AgentPolicyInput = {
  agentId: string;
  agentWalletAddress: string;
  categories?: string[];
  dailyBudgetAtomic: string;
  expiresAt?: string | null;
  perAskLimitAtomic: string;
  policyId?: string | null;
  scopes?: string[];
};

export type NormalizedAgentPolicyInput = {
  agentId: string;
  agentWalletAddress: `0x${string}`;
  categories: string[];
  dailyBudgetAtomic: string;
  expiresAt: Date | null;
  perAskLimitAtomic: string;
  policyId: string | null;
  scopes: string[];
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hashMcpBearerToken(token: string): string {
  return sha256(token);
}

function parseJsonStringArray(value: unknown): string[] {
  if (typeof value !== "string" || value.trim().length === 0) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string") : [];
  } catch {
    return [];
  }
}

function normalizeStringList(values: unknown, options?: { allowNumericOnly?: boolean; allowed?: Set<string> }) {
  if (!Array.isArray(values)) return [];
  const normalized = values
    .map(value =>
      typeof value === "string" || typeof value === "number" || typeof value === "bigint" ? String(value) : "",
    )
    .map(value => value.trim())
    .filter(Boolean)
    .filter(value => !options?.allowNumericOnly || /^\d+$/.test(value))
    .filter(value => !options?.allowed || options.allowed.has(value));

  return Array.from(new Set(normalized)).sort((a, b) => a.localeCompare(b));
}

function normalizeAtomicAmount(value: unknown, fieldName: string) {
  const raw =
    typeof value === "string" || typeof value === "number" || typeof value === "bigint" ? String(value).trim() : "";
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${fieldName} must be an atomic USDC integer string.`);
  }
  return BigInt(raw).toString();
}

function normalizeAgentId(value: unknown) {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!/^[a-z0-9][a-z0-9_-]{1,63}$/.test(raw)) {
    throw new Error("Agent id must be 2-64 lowercase letters, numbers, dashes, or underscores.");
  }
  return raw;
}

function normalizeExpiresAt(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw new Error("Expiry must be an ISO timestamp.");
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error("Expiry must be an ISO timestamp.");
  return parsed;
}

export function normalizeAgentPolicyInput(input: AgentPolicyInput): NormalizedAgentPolicyInput {
  if (!isValidWalletAddress(input.agentWalletAddress)) {
    throw new Error("Agent wallet must be a valid EVM address.");
  }

  const allowedScopes = new Set<string>(MCP_SCOPE_VALUES);
  const scopes = normalizeStringList(input.scopes?.length ? input.scopes : DEFAULT_AGENT_SCOPES, {
    allowed: allowedScopes,
  });
  if (scopes.length === 0) {
    throw new Error("At least one MCP scope is required.");
  }

  return {
    agentId: normalizeAgentId(input.agentId),
    agentWalletAddress: normalizeWalletAddress(input.agentWalletAddress),
    categories: normalizeStringList(input.categories ?? [], { allowNumericOnly: true }),
    dailyBudgetAtomic: normalizeAtomicAmount(input.dailyBudgetAtomic, "Daily budget"),
    expiresAt: normalizeExpiresAt(input.expiresAt),
    perAskLimitAtomic: normalizeAtomicAmount(input.perAskLimitAtomic, "Per-ask limit"),
    policyId: typeof input.policyId === "string" && input.policyId.trim() ? input.policyId.trim() : null,
    scopes,
  };
}

function rowDate(row: Record<string, unknown>, key: string) {
  const value = row[key];
  return value ? new Date(String(value)).toISOString() : null;
}

function rowToPolicy(row: Record<string, unknown>): AgentPolicyRecord {
  return {
    agentId: String(row.agent_id),
    agentWalletAddress: normalizeWalletAddress(String(row.agent_wallet_address)),
    categories: parseJsonStringArray(row.categories),
    createdAt: new Date(String(row.created_at)).toISOString(),
    dailyBudgetAtomic: String(row.daily_budget_atomic),
    expiresAt: rowDate(row, "expires_at"),
    hasToken: typeof row.token_hash === "string" && row.token_hash.length > 0,
    id: String(row.id),
    ownerWalletAddress: normalizeWalletAddress(String(row.owner_wallet_address)),
    perAskLimitAtomic: String(row.per_ask_limit_atomic),
    revokedAt: rowDate(row, "revoked_at"),
    scopes: parseJsonStringArray(row.scopes),
    status: AGENT_POLICY_STATUSES.includes(String(row.status) as AgentPolicyStatus)
      ? (String(row.status) as AgentPolicyStatus)
      : "paused",
    tokenIssuedAt: rowDate(row, "token_issued_at"),
    tokenRevokedAt: rowDate(row, "token_revoked_at"),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

export function createAgentPolicyTimestamp(nowMs = Date.now()): Date {
  return new Date(Math.floor(nowMs / 1000) * 1000);
}

export async function ensureAgentWalletPolicyTables() {
  // Schema is managed via Drizzle migrations.
}

async function appendPolicyAudit(params: {
  agentId: string;
  agentWalletAddress: `0x${string}`;
  details?: Record<string, unknown>;
  eventType: string;
  ownerWalletAddress: `0x${string}`;
  policyId: string;
  status: AgentPolicyStatus;
}) {
  await dbClient.execute({
    sql: `
      INSERT INTO agent_wallet_policy_audit_records (
        policy_id, owner_wallet_address, agent_id, agent_wallet_address,
        event_type, status, details, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    args: [
      params.policyId,
      params.ownerWalletAddress,
      params.agentId,
      params.agentWalletAddress,
      params.eventType,
      params.status,
      params.details ? JSON.stringify(params.details) : null,
      createAgentPolicyTimestamp(),
    ],
  });
}

export async function listAgentPolicies(ownerWalletAddress: `0x${string}`): Promise<AgentPolicyRecord[]> {
  await ensureAgentWalletPolicyTables();
  const result = await dbClient.execute({
    sql: `
      SELECT *
      FROM agent_wallet_policies
      WHERE owner_wallet_address = ?
      ORDER BY updated_at DESC
    `,
    args: [ownerWalletAddress],
  });

  return result.rows.map(row => rowToPolicy(row));
}

export async function upsertAgentPolicy(
  ownerWalletAddress: `0x${string}`,
  input: NormalizedAgentPolicyInput,
): Promise<AgentPolicyRecord> {
  await ensureAgentWalletPolicyTables();
  const now = createAgentPolicyTimestamp();
  const existingResult = await dbClient.execute({
    sql: `
      SELECT *
      FROM agent_wallet_policies
      WHERE owner_wallet_address = ?
        AND (${input.policyId ? "id = ?" : "agent_id = ?"})
      LIMIT 1
    `,
    args: [ownerWalletAddress, input.policyId ?? input.agentId],
  });
  const existing = existingResult.rows[0] as Record<string, unknown> | undefined;
  if (existing && String(existing.status) === "revoked") {
    throw new AgentPolicyLifecycleError("Revoked managed agents cannot be updated. Create a new agent policy.");
  }
  const policyId = existing ? String(existing.id) : input.policyId || `agent_policy_${randomUUID()}`;
  const eventType = existing ? "updated" : "created";

  if (existing) {
    await dbClient.execute({
      sql: `
        UPDATE agent_wallet_policies
        SET agent_id = ?,
            agent_wallet_address = ?,
            scopes = ?,
            categories = ?,
            daily_budget_atomic = ?,
            per_ask_limit_atomic = ?,
            expires_at = ?,
            updated_at = ?
        WHERE id = ? AND owner_wallet_address = ?
      `,
      args: [
        input.agentId,
        input.agentWalletAddress,
        JSON.stringify(input.scopes),
        JSON.stringify(input.categories),
        input.dailyBudgetAtomic,
        input.perAskLimitAtomic,
        input.expiresAt,
        now,
        policyId,
        ownerWalletAddress,
      ],
    });
  } else {
    await dbClient.execute({
      sql: `
        INSERT INTO agent_wallet_policies (
          id, owner_wallet_address, agent_id, agent_wallet_address, status,
          scopes, categories, daily_budget_atomic, per_ask_limit_atomic,
          expires_at, created_at, updated_at, revoked_at
        )
        VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, NULL)
      `,
      args: [
        policyId,
        ownerWalletAddress,
        input.agentId,
        input.agentWalletAddress,
        JSON.stringify(input.scopes),
        JSON.stringify(input.categories),
        input.dailyBudgetAtomic,
        input.perAskLimitAtomic,
        input.expiresAt,
        now,
        now,
      ],
    });
  }

  const policy = await getAgentPolicy(ownerWalletAddress, policyId);
  if (!policy) throw new Error("Agent policy was not saved.");
  await appendPolicyAudit({
    agentId: policy.agentId,
    agentWalletAddress: policy.agentWalletAddress,
    eventType,
    ownerWalletAddress,
    policyId: policy.id,
    status: policy.status,
  });
  return policy;
}

export async function getAgentPolicy(
  ownerWalletAddress: `0x${string}`,
  policyId: string,
): Promise<AgentPolicyRecord | null> {
  await ensureAgentWalletPolicyTables();
  const result = await dbClient.execute({
    sql: `
      SELECT *
      FROM agent_wallet_policies
      WHERE owner_wallet_address = ? AND id = ?
      LIMIT 1
    `,
    args: [ownerWalletAddress, policyId],
  });

  return result.rows[0] ? rowToPolicy(result.rows[0]) : null;
}

export async function updateAgentPolicyStatus(params: {
  ownerWalletAddress: `0x${string}`;
  policyId: string;
  status: AgentPolicyStatus;
}): Promise<AgentPolicyRecord> {
  if (!AGENT_POLICY_STATUSES.includes(params.status)) throw new Error("Invalid policy status.");
  const existing = await getAgentPolicy(params.ownerWalletAddress, params.policyId);
  if (!existing) throw new Error("Agent policy was not found.");
  if (existing.status === "revoked" && params.status !== "revoked") {
    throw new AgentPolicyLifecycleError("Revoked managed agents cannot be reactivated. Create a new agent policy.");
  }

  const now = createAgentPolicyTimestamp();
  const revokedAt = params.status === "revoked" ? now : null;
  await dbClient.execute({
    sql: `
      UPDATE agent_wallet_policies
      SET status = ?,
          updated_at = ?,
          revoked_at = ?,
          token_hash = CASE WHEN ? = 'revoked' THEN NULL ELSE token_hash END,
          token_revoked_at = CASE WHEN ? = 'revoked' THEN ? ELSE token_revoked_at END
      WHERE owner_wallet_address = ? AND id = ?
    `,
    args: [
      params.status,
      now,
      revokedAt,
      params.status,
      params.status,
      revokedAt,
      params.ownerWalletAddress,
      params.policyId,
    ],
  });

  const policy = await getAgentPolicy(params.ownerWalletAddress, params.policyId);
  if (!policy) throw new Error("Agent policy was not found.");
  await appendPolicyAudit({
    agentId: policy.agentId,
    agentWalletAddress: policy.agentWalletAddress,
    eventType: params.status === "revoked" ? "revoked" : params.status,
    ownerWalletAddress: params.ownerWalletAddress,
    policyId: policy.id,
    status: policy.status,
  });
  return policy;
}

export async function rotateAgentPolicyToken(params: {
  ownerWalletAddress: `0x${string}`;
  policyId: string;
}): Promise<{ policy: AgentPolicyRecord; token: string }> {
  const existing = await getAgentPolicy(params.ownerWalletAddress, params.policyId);
  if (!existing) throw new Error("Agent policy was not found.");
  if (existing.status === "revoked") {
    throw new AgentPolicyLifecycleError("Revoked managed agents cannot receive new tokens. Create a new agent policy.");
  }

  const token = `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  const now = createAgentPolicyTimestamp();
  await dbClient.execute({
    sql: `
      UPDATE agent_wallet_policies
      SET token_hash = ?,
          token_issued_at = ?,
          token_revoked_at = NULL,
          updated_at = ?
      WHERE owner_wallet_address = ? AND id = ?
    `,
    args: [hashMcpBearerToken(token), now, now, params.ownerWalletAddress, params.policyId],
  });

  const policy = await getAgentPolicy(params.ownerWalletAddress, params.policyId);
  if (!policy) throw new Error("Agent policy was not found.");
  await appendPolicyAudit({
    agentId: policy.agentId,
    agentWalletAddress: policy.agentWalletAddress,
    eventType: "token_rotated",
    ownerWalletAddress: params.ownerWalletAddress,
    policyId: policy.id,
    status: policy.status,
  });
  return { policy, token };
}

export async function revokeAgentPolicyToken(params: {
  ownerWalletAddress: `0x${string}`;
  policyId: string;
}): Promise<AgentPolicyRecord> {
  const now = createAgentPolicyTimestamp();
  await dbClient.execute({
    sql: `
      UPDATE agent_wallet_policies
      SET token_hash = NULL,
          token_revoked_at = ?,
          updated_at = ?
      WHERE owner_wallet_address = ? AND id = ?
    `,
    args: [now, now, params.ownerWalletAddress, params.policyId],
  });

  const policy = await getAgentPolicy(params.ownerWalletAddress, params.policyId);
  if (!policy) throw new Error("Agent policy was not found.");
  await appendPolicyAudit({
    agentId: policy.agentId,
    agentWalletAddress: policy.agentWalletAddress,
    eventType: "token_revoked",
    ownerWalletAddress: params.ownerWalletAddress,
    policyId: policy.id,
    status: policy.status,
  });
  return policy;
}

export async function getMcpAgentFromPolicyTokenHash(tokenHash: string): Promise<McpAgentAuth | null> {
  await ensureAgentWalletPolicyTables();
  const result = await dbClient.execute({
    sql: `
      SELECT *
      FROM agent_wallet_policies
      WHERE token_hash = ?
        AND status = 'active'
        AND (expires_at IS NULL OR expires_at > ?)
      LIMIT 1
    `,
    args: [tokenHash, createAgentPolicyTimestamp()],
  });
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;

  const scopes = new Set(parseJsonStringArray(row.scopes));
  const categories = parseJsonStringArray(row.categories);
  return {
    allowedCategoryIds: categories.length > 0 ? new Set(categories) : null,
    dailyBudgetAtomic: BigInt(String(row.daily_budget_atomic)),
    id: String(row.id),
    perAskLimitAtomic: BigInt(String(row.per_ask_limit_atomic)),
    scopes,
    tokenHash,
    walletAddress: String(row.agent_wallet_address),
  };
}

export async function listAgentAskSummaries(params: {
  limit?: number;
  ownerWalletAddress: `0x${string}`;
  policyId: string;
}): Promise<AgentAskSummary[]> {
  const policy = await getAgentPolicy(params.ownerWalletAddress, params.policyId);
  if (!policy) return [];
  const limit = Math.min(Math.max(Math.floor(params.limit ?? 10), 1), 50);
  const result = await dbClient.execute({
    sql: `
      SELECT operation_key, agent_id, client_request_id, payload_hash, chain_id,
             category_id, payment_amount, status, content_id, error, created_at, updated_at
      FROM mcp_agent_budget_reservations
      WHERE agent_id = ?
      ORDER BY updated_at DESC
      LIMIT ${limit}
    `,
    args: [policy.id],
  });

  return result.rows.map(row => ({
    categoryId: String(row.category_id),
    chainId: Number(row.chain_id),
    clientRequestId: String(row.client_request_id),
    contentId: typeof row.content_id === "string" ? row.content_id : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
    error: typeof row.error === "string" ? row.error : null,
    operationKey: String(row.operation_key) as `0x${string}`,
    paymentAmount: String(row.payment_amount),
    status: String(row.status),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  }));
}
