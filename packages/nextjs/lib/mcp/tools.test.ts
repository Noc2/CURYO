import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import type { McpAgentAuth } from "./auth";
import { __setMcpToolTestOverridesForTests, callCuryoMcpTool } from "./tools";

const AGENT: McpAgentAuth = {
  allowedCategoryIds: null,
  dailyBudgetAtomic: 5_000_000n,
  id: "agent-a",
  perAskLimitAtomic: 2_000_000n,
  scopes: new Set(["curyo:ask"]),
  tokenHash: "a".repeat(64),
};

function askArguments() {
  return {
    bounty: {
      amount: "1000000",
      asset: "USDC",
    },
    chainId: 42220,
    clientRequestId: "ask-bookkeeping-failure",
    maxPaymentAmount: "1500000",
    question: {
      categoryId: "5",
      contextUrl: "https://example.com/context",
      description: "Should this autonomous action continue?",
      tags: ["agents"],
      title: "Agent action approval",
    },
  };
}

afterEach(() => {
  __setMcpToolTestOverridesForTests(null);
});

test("curyo_ask_humans does not mark failed after submitted ask bookkeeping fails", async () => {
  mock.method(console, "error", () => {});
  const reservationUpdates: string[] = [];

  __setMcpToolTestOverridesForTests({
    getMcpAgentBudgetSummary: async () => {
      throw new Error("summary offline");
    },
    handleManagedQuestionSubmissionRequest: async () => ({
      body: {
        contentId: "123",
        operationKey: `0x${"1".repeat(64)}`,
        payment: {
          amount: "1000000",
          asset: "0x0000000000000000000000000000000000000001",
          serviceFeeAmount: "0",
        },
        status: "submitted",
      },
      status: 200,
    }),
    preflightX402QuestionSubmission: async () => ({
      operation: {
        canonicalPayload: {} as never,
        operationKey: `0x${"1".repeat(64)}`,
        payloadHash: "payload-hash",
      },
      paymentAmount: 1_000_000n,
      resolvedCategoryId: 5n,
      submissionKey: `0x${"2".repeat(64)}`,
    }),
    reserveMcpAgentBudget: async () =>
      ({
        agentId: AGENT.id,
        categoryId: "5",
        chainId: 42220,
        clientRequestId: "ask-bookkeeping-failure",
        contentId: null,
        createdAt: new Date(),
        error: null,
        operationKey: `0x${"1".repeat(64)}`,
        paymentAmount: "1000000",
        payloadHash: "payload-hash",
        status: "reserved",
        updatedAt: new Date(),
      }) as const,
    resolveX402QuestionConfig: () =>
      ({
        usdcAddress: "0x0000000000000000000000000000000000000001",
      }) as never,
    updateMcpBudgetReservation: async params => {
      reservationUpdates.push(params.status);
      if (params.status === "submitted") {
        throw new Error("budget write failed after submit");
      }
      return null;
    },
  });

  const result = await callCuryoMcpTool({
    agent: AGENT,
    arguments: askArguments(),
    name: "curyo_ask_humans",
  });

  const body = result as unknown as { status: string; warnings: string[] };

  assert.equal(body.status, "submitted");
  assert.deepEqual(reservationUpdates, ["submitted"]);
  assert.deepEqual(body.warnings, ["submitted_budget_update_failed", "managed_budget_unavailable"]);
});
