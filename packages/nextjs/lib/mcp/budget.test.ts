import type { McpAgentAuth } from "./auth";
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

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
  await dbModule.dbClient.execute("DELETE FROM mcp_agent_daily_budget_usage");
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

test("reserveMcpAgentBudget keeps submitted reservations idempotent without re-reserving", async () => {
  const first = await budget.reserveMcpAgentBudget({
    agent: AGENT,
    amount: 1_000_000n,
    categoryId: "5",
    chainId: 42220,
    clientRequestId: "ask-submitted",
    operationKey: `0x${"a".repeat(64)}`,
    payloadHash: "payload-submitted",
  });
  await budget.updateMcpBudgetReservation({
    contentId: "42",
    operationKey: first.operationKey,
    status: "submitted",
  });

  const second = await budget.reserveMcpAgentBudget({
    agent: AGENT,
    amount: 1_000_000n,
    categoryId: "5",
    chainId: 42220,
    clientRequestId: "ask-submitted",
    operationKey: first.operationKey,
    payloadHash: "payload-submitted",
  });

  assert.equal(second.status, "submitted");

  const summary = await budget.getMcpAgentBudgetSummary(AGENT);
  assert.equal(summary.spentTodayAtomic, "1000000");
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

test("reserveMcpAgentBudget enforces daily caps and releases failed reservations", async () => {
  const first = await budget.reserveMcpAgentBudget({
    agent: AGENT,
    amount: 2_000_000n,
    categoryId: "5",
    chainId: 42220,
    clientRequestId: "ask-daily-1",
    operationKey: `0x${"4".repeat(64)}`,
    payloadHash: "payload-d",
  });

  await assert.rejects(
    () =>
      budget.reserveMcpAgentBudget({
        agent: AGENT,
        amount: 2_000_000n,
        categoryId: "5",
        chainId: 42220,
        clientRequestId: "ask-daily-2",
        operationKey: `0x${"5".repeat(64)}`,
        payloadHash: "payload-e",
      }),
    /remaining daily budget/,
  );

  await budget.updateMcpBudgetReservation({
    error: "submission failed",
    operationKey: first.operationKey,
    status: "failed",
  });

  const second = await budget.reserveMcpAgentBudget({
    agent: AGENT,
    amount: 2_000_000n,
    categoryId: "5",
    chainId: 42220,
    clientRequestId: "ask-daily-2",
    operationKey: `0x${"5".repeat(64)}`,
    payloadHash: "payload-e",
  });

  assert.equal(second.clientRequestId, "ask-daily-2");
});

test("reserveMcpAgentBudget re-reserves failed retries before allowing reuse", async () => {
  const failed = await budget.reserveMcpAgentBudget({
    agent: AGENT,
    amount: 2_000_000n,
    categoryId: "5",
    chainId: 42220,
    clientRequestId: "ask-failed-retry",
    operationKey: `0x${"6".repeat(64)}`,
    payloadHash: "payload-f",
  });
  await budget.updateMcpBudgetReservation({
    error: "submission failed",
    operationKey: failed.operationKey,
    status: "failed",
  });

  await budget.reserveMcpAgentBudget({
    agent: AGENT,
    amount: 2_000_000n,
    categoryId: "5",
    chainId: 42220,
    clientRequestId: "ask-cap-holder",
    operationKey: `0x${"7".repeat(64)}`,
    payloadHash: "payload-g",
  });

  await assert.rejects(
    () =>
      budget.reserveMcpAgentBudget({
        agent: AGENT,
        amount: 2_000_000n,
        categoryId: "5",
        chainId: 42220,
        clientRequestId: "ask-failed-retry",
        operationKey: failed.operationKey,
        payloadHash: "payload-f",
      }),
    /remaining daily budget/,
  );
});

test("reserveMcpAgentBudget re-reserves released retries before allowing reuse", async () => {
  const released = await budget.reserveMcpAgentBudget({
    agent: AGENT,
    amount: 2_000_000n,
    categoryId: "5",
    chainId: 42220,
    clientRequestId: "ask-released-retry",
    operationKey: `0x${"8".repeat(64)}`,
    payloadHash: "payload-h",
  });
  await budget.updateMcpBudgetReservation({
    operationKey: released.operationKey,
    status: "released",
  });

  await budget.reserveMcpAgentBudget({
    agent: AGENT,
    amount: 2_000_000n,
    categoryId: "5",
    chainId: 42220,
    clientRequestId: "ask-cap-holder",
    operationKey: `0x${"9".repeat(64)}`,
    payloadHash: "payload-i",
  });

  await assert.rejects(
    () =>
      budget.reserveMcpAgentBudget({
        agent: AGENT,
        amount: 2_000_000n,
        categoryId: "5",
        chainId: 42220,
        clientRequestId: "ask-released-retry",
        operationKey: released.operationKey,
        payloadHash: "payload-h",
      }),
    /remaining daily budget/,
  );
});
