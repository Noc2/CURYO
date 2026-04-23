import type { McpAgentAuth } from "./auth";
import { McpToolError, __setMcpToolTestOverridesForTests, callCuryoMcpTool, normalizeToolError } from "./tools";
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { __setDatabaseResourcesForTests, dbClient } from "~~/lib/db";
import { createMemoryDatabaseResources } from "~~/lib/db/testMemory";

const env = process.env as Record<string, string | undefined>;
const originalDatabaseUrl = env.DATABASE_URL;

const AGENT: McpAgentAuth = {
  allowedCategoryIds: null,
  dailyBudgetAtomic: 5_000_000n,
  id: "agent-read",
  perAskLimitAtomic: 2_000_000n,
  scopes: new Set(["curyo:read"]),
  tokenHash: "a".repeat(64),
};

before(() => {
  env.DATABASE_URL = "memory:";
  __setDatabaseResourcesForTests(createMemoryDatabaseResources());
});

beforeEach(async () => {
  __setMcpToolTestOverridesForTests(null);
  await dbClient.execute("DELETE FROM mcp_agent_budget_reservations");
  await dbClient.execute("DELETE FROM x402_question_submissions");
});

after(() => {
  __setMcpToolTestOverridesForTests(null);
  __setDatabaseResourcesForTests(null);
  if (originalDatabaseUrl === undefined) {
    delete env.DATABASE_URL;
  } else {
    env.DATABASE_URL = originalDatabaseUrl;
  }
});

test("curyo_get_result requires contentId when an operation maps to multiple bundle questions", async () => {
  const operationKey = `0x${"6".repeat(64)}` as const;
  const now = new Date("2026-04-23T12:00:00.000Z");

  await dbClient.execute({
    args: [
      operationKey,
      AGENT.id,
      "bundle-result",
      "payload-hash",
      42220,
      "5",
      "1000000",
      "submitted",
      "123",
      null,
      now,
      now,
    ],
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
        content_id,
        error,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  });

  await dbClient.execute({
    args: [
      operationKey,
      "bundle-result",
      "payload-hash",
      42220,
      "0x0000000000000000000000000000000000000001",
      "1000000",
      "1000000",
      "0",
      2,
      "submitted",
      "123",
      JSON.stringify(["123", "456"]),
      now,
      now,
      now,
    ],
    sql: `
      INSERT INTO x402_question_submissions (
        operation_key,
        client_request_id,
        payload_hash,
        chain_id,
        payment_asset,
        payment_amount,
        bounty_amount,
        service_fee_amount,
        question_count,
        status,
        content_id,
        content_ids,
        created_at,
        updated_at,
        submitted_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  });

  __setMcpToolTestOverridesForTests({
    getContentById: async () => {
      throw new Error("content lookup should not run without an explicit contentId");
    },
  });

  await assert.rejects(
    () =>
      callCuryoMcpTool({
        agent: AGENT,
        arguments: {
          chainId: 42220,
          clientRequestId: "bundle-result",
        },
        name: "curyo_get_result",
      }),
    /provide contentid/i,
  );
});

test("normalizeToolError preserves category_disallowed for explicit MCP category blocks", () => {
  const normalized = normalizeToolError(new McpToolError("This MCP agent is not allowed to ask in category 6.", 403));
  assert.equal(normalized.code, "category_disallowed");
  assert.equal(normalized.originalCode, "McpToolError");
  assert.equal(normalized.retryable, false);
});
