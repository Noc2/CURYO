import type { PoolClient, QueryResultRow } from "pg";
import { dbClient, dbPool } from "~~/lib/db";
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
  createdAt: Date;
  error: string | null;
  operationKey: `0x${string}`;
  paymentAmount: string;
  payloadHash: string;
  status: McpBudgetReservationStatus;
  updatedAt: Date;
};

function rowToReservation(row: QueryResultRow | Record<string, unknown> | undefined): McpBudgetReservationRecord | null {
  if (!row) return null;
  return {
    agentId: String(row.agent_id),
    categoryId: String(row.category_id),
    chainId: Number(row.chain_id),
    clientRequestId: String(row.client_request_id),
    contentId: typeof row.content_id === "string" ? row.content_id : null,
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(String(row.created_at)),
    error: typeof row.error === "string" ? row.error : null,
    operationKey: String(row.operation_key) as `0x${string}`,
    paymentAmount: String(row.payment_amount),
    payloadHash: String(row.payload_hash),
    status: String(row.status) as McpBudgetReservationStatus,
    updatedAt: row.updated_at instanceof Date ? row.updated_at : new Date(String(row.updated_at)),
  };
}

function startOfUtcDay(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function budgetDateKey(now = new Date()) {
  return startOfUtcDay(now).toISOString().slice(0, 10);
}

function dailyBudgetKey(agentId: string, budgetDate: string) {
  return `${agentId}:${budgetDate}`;
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

export async function getMcpBudgetReservationByClientRequest(params: {
  agentId: string;
  chainId: number;
  clientRequestId: string;
}) {
  const result = await dbClient.execute({
    sql: `
      SELECT *
      FROM mcp_agent_budget_reservations
      WHERE agent_id = ? AND chain_id = ? AND client_request_id = ?
      LIMIT 1
    `,
    args: [params.agentId, params.chainId, params.clientRequestId],
  });

  return rowToReservation(result.rows[0]);
}

async function getMcpBudgetReservationByOperationForUpdate(client: PoolClient, operationKey: `0x${string}`) {
  const result = await client.query(
    `
      SELECT *
      FROM mcp_agent_budget_reservations
      WHERE operation_key = $1
      LIMIT 1
      FOR UPDATE
    `,
    [operationKey],
  );

  return rowToReservation(result.rows[0]);
}

async function getMcpBudgetReservationByClientRequestForUpdate(
  client: PoolClient,
  params: {
    agentId: string;
    chainId: number;
    clientRequestId: string;
  },
) {
  const result = await client.query(
    `
      SELECT *
      FROM mcp_agent_budget_reservations
      WHERE agent_id = $1 AND chain_id = $2 AND client_request_id = $3
      LIMIT 1
      FOR UPDATE
    `,
    [params.agentId, params.chainId, params.clientRequestId],
  );

  return rowToReservation(result.rows[0]);
}

async function withBudgetTransaction<T>(callback: (client: PoolClient) => Promise<T>) {
  const client = await dbPool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // The original transaction error is more useful than a rollback failure.
    }
    throw error;
  } finally {
    client.release();
  }
}

async function reserveDailyBudgetCapacity(
  client: PoolClient,
  params: {
    agent: McpAgentAuth;
    amount: bigint;
    budgetDate: string;
    now: Date;
  },
) {
  const budgetKey = dailyBudgetKey(params.agent.id, params.budgetDate);
  const values = [
    budgetKey,
    params.agent.id,
    params.budgetDate,
    params.amount.toString(),
    params.now,
    params.agent.dailyBudgetAtomic.toString(),
  ];

  for (let attempt = 0; attempt < 2; attempt++) {
    const updateResult = await client.query(
      `
        UPDATE mcp_agent_daily_budget_usage
        SET reserved_amount = reserved_amount + CAST($4 AS numeric),
            updated_at = CAST($5 AS timestamp with time zone)
        WHERE budget_key = $1
          AND reserved_amount + CAST($4 AS numeric) <= CAST($6 AS numeric)
        RETURNING reserved_amount
      `,
      values,
    );
    if (updateResult.rows[0]) return;

    const existingResult = await client.query(
      `
        SELECT reserved_amount
        FROM mcp_agent_daily_budget_usage
        WHERE budget_key = $1
        LIMIT 1
      `,
      [budgetKey],
    );
    if (existingResult.rows[0]) {
      throw new McpBudgetError("Question exceeds this MCP agent's remaining daily budget.");
    }

    const insertResult = await client.query(
      `
        INSERT INTO mcp_agent_daily_budget_usage (
          budget_key,
          agent_id,
          budget_date,
          reserved_amount,
          created_at,
          updated_at
        )
        SELECT $1, $2, $3, CAST($4 AS numeric), CAST($5 AS timestamp with time zone), CAST($5 AS timestamp with time zone)
        WHERE CAST($4 AS numeric) <= CAST($6 AS numeric)
        ON CONFLICT(budget_key) DO NOTHING
        RETURNING reserved_amount
      `,
      values,
    );
    if (insertResult.rows[0]) return;
  }

  throw new McpBudgetError("Question exceeds this MCP agent's remaining daily budget.");
}

async function releaseDailyBudgetCapacity(
  client: PoolClient,
  params: {
    agentId: string;
    amount: bigint;
    budgetDate: string;
    now: Date;
  },
) {
  await client.query(
    `
      UPDATE mcp_agent_daily_budget_usage
      SET reserved_amount = GREATEST(reserved_amount - CAST($2 AS numeric), 0),
          updated_at = $3
      WHERE budget_key = $1
    `,
    [dailyBudgetKey(params.agentId, params.budgetDate), params.amount.toString(), params.now],
  );
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
  const budgetDate = budgetDateKey(now);
  return withBudgetTransaction(async client => {
    const existingByOperation = await getMcpBudgetReservationByOperationForUpdate(client, params.operationKey);
    if (existingByOperation) {
      if (existingByOperation.agentId !== params.agent.id || existingByOperation.payloadHash !== params.payloadHash) {
        throw new McpBudgetError("This MCP operation key is already reserved for a different request.");
      }
      return existingByOperation;
    }

    const existingByClientRequest = await getMcpBudgetReservationByClientRequestForUpdate(client, {
      agentId: params.agent.id,
      chainId: params.chainId,
      clientRequestId: params.clientRequestId,
    });
    if (existingByClientRequest) {
      if (existingByClientRequest.payloadHash !== params.payloadHash) {
        throw new McpBudgetError("clientRequestId has already been used for a different question payload.");
      }
      return existingByClientRequest;
    }

    await reserveDailyBudgetCapacity(client, {
      agent: params.agent,
      amount: params.amount,
      budgetDate,
      now,
    });

    const insertResult = await client.query(
      `
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
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'reserved', $8, $8)
        RETURNING *
      `,
      [
        params.operationKey,
        params.agent.id,
        params.clientRequestId,
        params.payloadHash,
        params.chainId,
        params.categoryId,
        params.amount.toString(),
        now,
      ],
    );

    const inserted = rowToReservation(insertResult.rows[0]);
    if (!inserted) {
      throw new McpBudgetError("Unable to reserve MCP agent budget.", 500);
    }
    return inserted;
  });
}

export async function updateMcpBudgetReservation(params: {
  contentId?: string | null;
  error?: string | null;
  operationKey: `0x${string}`;
  status: McpBudgetReservationStatus;
}) {
  const now = new Date();
  const result = await withBudgetTransaction(async client => {
    const existing = await getMcpBudgetReservationByOperationForUpdate(client, params.operationKey);
    const updateResult = await client.query(
      `
        UPDATE mcp_agent_budget_reservations
        SET status = $1,
            content_id = $2,
            error = $3,
            updated_at = $4
        WHERE operation_key = $5
        RETURNING *
      `,
      [params.status, params.contentId ?? null, params.error ?? null, now, params.operationKey],
    );

    if (
      existing &&
      (existing.status === "reserved" || existing.status === "submitted") &&
      (params.status === "failed" || params.status === "released")
    ) {
      await releaseDailyBudgetCapacity(client, {
        agentId: existing.agentId,
        amount: BigInt(existing.paymentAmount),
        budgetDate: budgetDateKey(existing.createdAt),
        now,
      });
    }

    return updateResult;
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
