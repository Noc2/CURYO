import { dbClient } from "~~/lib/db";
import type { McpAgentAuth } from "~~/lib/mcp/auth";

export type McpBudgetReservationStatus = "reserved" | "submitted" | "failed" | "released";

export class McpBudgetError extends Error {
  readonly status: number;

  constructor(message: string, status = 409) {
    super(message);
    this.name = "McpBudgetError";
    this.status = status;
  }
}

export type McpBudgetReservationRecord = {
  agentId: string;
  categoryId: string;
  chainId: number;
  clientRequestId: string;
  contentId: string | null;
  error: string | null;
  operationKey: `0x${string}`;
  paymentAmount: string;
  payloadHash: string;
  status: McpBudgetReservationStatus;
};

function rowToReservation(row: Record<string, unknown> | undefined): McpBudgetReservationRecord | null {
  if (!row) return null;
  return {
    agentId: String(row.agent_id),
    categoryId: String(row.category_id),
    chainId: Number(row.chain_id),
    clientRequestId: String(row.client_request_id),
    contentId: typeof row.content_id === "string" ? row.content_id : null,
    error: typeof row.error === "string" ? row.error : null,
    operationKey: String(row.operation_key) as `0x${string}`,
    paymentAmount: String(row.payment_amount),
    payloadHash: String(row.payload_hash),
    status: String(row.status) as McpBudgetReservationStatus,
  };
}

function startOfUtcDay(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function assertAgentMaySpend(params: { agent: McpAgentAuth; amount: bigint; categoryId: string }) {
  if (params.agent.perAskLimitAtomic <= 0n) {
    throw new McpBudgetError("MCP agent per-ask budget is not configured.", 503);
  }
  if (params.agent.dailyBudgetAtomic <= 0n) {
    throw new McpBudgetError("MCP agent daily budget is not configured.", 503);
  }
  if (params.amount > params.agent.perAskLimitAtomic) {
    throw new McpBudgetError("Question exceeds this MCP agent's per-ask budget.");
  }
  if (params.agent.allowedCategoryIds && !params.agent.allowedCategoryIds.has(params.categoryId)) {
    throw new McpBudgetError("This MCP agent is not allowed to ask in the selected category.", 403);
  }
}

export async function getMcpBudgetReservation(operationKey: `0x${string}`) {
  const result = await dbClient.execute({
    sql: `
      SELECT *
      FROM mcp_agent_budget_reservations
      WHERE operation_key = ?
      LIMIT 1
    `,
    args: [operationKey],
  });

  return rowToReservation(result.rows[0]);
}

export async function reserveMcpAgentBudget(params: {
  agent: McpAgentAuth;
  amount: bigint;
  categoryId: string;
  chainId: number;
  clientRequestId: string;
  operationKey: `0x${string}`;
  payloadHash: string;
}) {
  assertAgentMaySpend({
    agent: params.agent,
    amount: params.amount,
    categoryId: params.categoryId,
  });

  const now = new Date();
  const dayStart = startOfUtcDay(now);
  const insertResult = await dbClient.execute({
    sql: `
      INSERT INTO mcp_agent_budget_reservations (
        operation_key,
        agent_id,
        client_request_id,
        payload_hash,
        chain_id,
        category_id,
        payment_amount,
        status,
        created_at,
        updated_at
      )
      SELECT ?, ?, ?, ?, ?, ?, ?, 'reserved', ?, ?
      WHERE (
        SELECT COALESCE(SUM(payment_amount::numeric), 0)
        FROM mcp_agent_budget_reservations
        WHERE agent_id = ?
          AND status IN ('reserved', 'submitted')
          AND created_at >= ?
      ) + ? <= ?
      ON CONFLICT(operation_key) DO NOTHING
      RETURNING *
    `,
    args: [
      params.operationKey,
      params.agent.id,
      params.clientRequestId,
      params.payloadHash,
      params.chainId,
      params.categoryId,
      params.amount.toString(),
      now,
      now,
      params.agent.id,
      dayStart,
      params.amount.toString(),
      params.agent.dailyBudgetAtomic.toString(),
    ],
  });

  const inserted = rowToReservation(insertResult.rows[0]);
  if (inserted) return inserted;

  const existing = await getMcpBudgetReservation(params.operationKey);
  if (existing) {
    if (existing.agentId !== params.agent.id || existing.payloadHash !== params.payloadHash) {
      throw new McpBudgetError("This MCP operation key is already reserved for a different request.");
    }
    return existing;
  }

  throw new McpBudgetError("Question exceeds this MCP agent's remaining daily budget.");
}

export async function updateMcpBudgetReservation(params: {
  contentId?: string | null;
  error?: string | null;
  operationKey: `0x${string}`;
  status: McpBudgetReservationStatus;
}) {
  const now = new Date();
  const result = await dbClient.execute({
    sql: `
      UPDATE mcp_agent_budget_reservations
      SET status = ?,
          content_id = ?,
          error = ?,
          updated_at = ?
      WHERE operation_key = ?
      RETURNING *
    `,
    args: [params.status, params.contentId ?? null, params.error ?? null, now, params.operationKey],
  });

  return rowToReservation(result.rows[0]);
}

export async function getMcpAgentBudgetSummary(agent: McpAgentAuth) {
  const dayStart = startOfUtcDay();
  const result = await dbClient.execute({
    sql: `
      SELECT COALESCE(SUM(payment_amount::numeric), 0) AS spent
      FROM mcp_agent_budget_reservations
      WHERE agent_id = ?
        AND status IN ('reserved', 'submitted')
        AND created_at >= ?
    `,
    args: [agent.id, dayStart],
  });
  const spent = BigInt(String(result.rows[0]?.spent ?? "0").split(".")[0] || "0");
  const remaining = agent.dailyBudgetAtomic > spent ? agent.dailyBudgetAtomic - spent : 0n;

  return {
    agentId: agent.id,
    dailyBudgetAtomic: agent.dailyBudgetAtomic.toString(),
    remainingDailyBudgetAtomic: remaining.toString(),
    perAskLimitAtomic: agent.perAskLimitAtomic.toString(),
    spentTodayAtomic: spent.toString(),
  };
}
