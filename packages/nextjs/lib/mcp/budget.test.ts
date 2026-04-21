import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import type { McpAgentAuth } from "./auth";

process.env.DATABASE_URL = "memory:";

type BudgetModule = typeof import("./budget");
type DbModule = typeof import("../db");
type DbTestMemoryModule = typeof import("../db/testMemory");

let budget: BudgetModule;
let dbModule: DbModule;
let dbTestMemory: DbTestMemoryModule;

const AGENT: McpAgentAuth = {
  allowedCategoryIds: new Set(["5"]),
  dailyBudgetAtomic: 3_000_000n,
  id: "agent-a",
  perAskLimitAtomic: 2_000_000n,
  scopes: new Set(["curyo:ask"]),
  tokenHash: "a".repeat(64),
};

before(async () => {
  dbModule = await import("../db");
  dbTestMemory = await import("../db/testMemory");
  dbModule.__setDatabaseResourcesForTests(dbTestMemory.createMemoryDatabaseResources());
  budget = await import("./budget");
});

beforeEach(async () => {
  await dbModule.dbClient.execute("DELETE FROM mcp_agent_budget_reservations");
});

after(() => {
  dbModule.__setDatabaseResourcesForTests(null);
});

test("reserveMcpAgentBudget stores a managed spend reservation", async () => {
  const reservation = await budget.reserveMcpAgentBudget({
    agent: AGENT,
    amount: 1_000_000n,
    categoryId: "5",
    chainId: 42220,
    clientRequestId: "ask-1",
    operationKey: `0x${"1".repeat(64)}`,
    payloadHash: "payload-a",
  });

  assert.equal(reservation.agentId, "agent-a");
  assert.equal(reservation.paymentAmount, "1000000");

  const summary = await budget.getMcpAgentBudgetSummary(AGENT);
  assert.equal(summary.spentTodayAtomic, "1000000");
  assert.equal(summary.remainingDailyBudgetAtomic, "2000000");
});

test("reserveMcpAgentBudget is idempotent for the same operation", async () => {
  const first = await budget.reserveMcpAgentBudget({
    agent: AGENT,
    amount: 1_000_000n,
    categoryId: "5",
    chainId: 42220,
    clientRequestId: "ask-1",
    operationKey: `0x${"1".repeat(64)}`,
    payloadHash: "payload-a",
  });
  const second = await budget.reserveMcpAgentBudget({
    agent: AGENT,
    amount: 1_000_000n,
    categoryId: "5",
    chainId: 42220,
    clientRequestId: "ask-1",
    operationKey: `0x${"1".repeat(64)}`,
    payloadHash: "payload-a",
  });

  assert.deepEqual(second, first);
});

test("reserveMcpAgentBudget enforces category and spend caps", async () => {
  await assert.rejects(
    () =>
      budget.reserveMcpAgentBudget({
        agent: AGENT,
        amount: 1_000_000n,
        categoryId: "6",
        chainId: 42220,
        clientRequestId: "ask-bad-category",
        operationKey: `0x${"2".repeat(64)}`,
        payloadHash: "payload-b",
      }),
    /not allowed/,
  );

  await assert.rejects(
    () =>
      budget.reserveMcpAgentBudget({
        agent: AGENT,
        amount: 2_500_000n,
        categoryId: "5",
        chainId: 42220,
        clientRequestId: "ask-too-large",
        operationKey: `0x${"3".repeat(64)}`,
        payloadHash: "payload-c",
      }),
    /per-ask budget/,
  );
});
