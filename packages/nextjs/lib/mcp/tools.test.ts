import type { McpAgentAuth } from "./auth";
import { __setMcpToolTestOverridesForTests, callCuryoMcpTool } from "./tools";
import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";

const AGENT: McpAgentAuth = {
  allowedCategoryIds: null,
  dailyBudgetAtomic: 5_000_000n,
  id: "agent-a",
  perAskLimitAtomic: 2_000_000n,
  scopes: new Set(["curyo:ask"]),
  tokenHash: "a".repeat(64),
};
const OPERATION_KEY = `0x${"1".repeat(64)}` as const;

function askArguments(overrides: Record<string, unknown> = {}) {
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
    ...overrides,
  };
}

function budgetReservation() {
  return {
    agentId: AGENT.id,
    categoryId: "5",
    chainId: 42220,
    clientRequestId: "ask-bookkeeping-failure",
    contentId: null,
    createdAt: new Date(),
    error: null,
    operationKey: OPERATION_KEY,
    paymentAmount: "1000000",
    payloadHash: "payload-hash",
    status: "reserved",
    updatedAt: new Date(),
  } as const;
}

function quoteOverrides() {
  return {
    preflightX402QuestionSubmission: async () => ({
      operation: {
        canonicalPayload: {} as never,
        operationKey: OPERATION_KEY,
        payloadHash: "payload-hash",
      },
      paymentAmount: 1_000_000n,
      resolvedCategoryIds: [5n],
      submissionKeys: [`0x${"2".repeat(64)}` as const],
    }),
    reserveMcpAgentBudget: async () => budgetReservation(),
    resolveX402QuestionConfig: () =>
      ({
        usdcAddress: "0x0000000000000000000000000000000000000001",
      }) as never,
  };
}

function managedBudgetSummary() {
  return {
    agentId: AGENT.id,
    dailyBudgetAtomic: "5000000",
    perAskLimitAtomic: "2000000",
    remainingDailyBudgetAtomic: "4000000",
    spentTodayAtomic: "1000000",
  };
}

afterEach(() => {
  mock.reset();
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
        operationKey: OPERATION_KEY,
        payment: {
          amount: "1000000",
          asset: "0x0000000000000000000000000000000000000001",
          serviceFeeAmount: "0",
        },
        status: "submitted",
      },
      status: 200,
    }),
    ...quoteOverrides(),
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

test("curyo_ask_humans still enqueues question.submitted when submitted bookkeeping fails", async () => {
  mock.method(console, "error", () => {});
  const enqueued: unknown[] = [];

  __setMcpToolTestOverridesForTests({
    enqueueAgentCallbackEvent: async params => {
      enqueued.push(params);
      return [];
    },
    getMcpAgentBudgetSummary: async () => managedBudgetSummary(),
    handleManagedQuestionSubmissionRequest: async () => ({
      body: {
        contentId: "123",
        contentIds: ["123"],
        operationKey: OPERATION_KEY,
        payment: {
          amount: "1000000",
          asset: "0x0000000000000000000000000000000000000001",
          serviceFeeAmount: "0",
        },
        status: "submitted",
      },
      status: 200,
    }),
    ...quoteOverrides(),
    updateMcpBudgetReservation: async params => {
      if (params.status === "submitted") {
        throw new Error("budget write failed after submit");
      }
      return null;
    },
    upsertAgentCallbackSubscription: async () => null,
  });

  const result = await callCuryoMcpTool({
    agent: AGENT,
    arguments: askArguments({
      webhookEvents: ["question.submitted"],
      webhookSecret: "webhook-secret",
      webhookUrl: "https://agent.example/curyo",
    }),
    name: "curyo_ask_humans",
  });

  const body = result as unknown as { warnings: string[] };

  assert.deepEqual(body.warnings, ["submitted_budget_update_failed"]);
  assert.equal(enqueued.length, 1);
  assert.deepEqual(enqueued[0], {
    agentId: AGENT.id,
    eventId: `${OPERATION_KEY}:question.submitted`,
    eventType: "question.submitted",
    payload: {
      chainId: 42220,
      clientRequestId: "ask-bookkeeping-failure",
      contentId: "123",
      contentIds: ["123"],
      error: null,
      eventType: "question.submitted",
      operationKey: OPERATION_KEY,
      publicUrl: "http://localhost:3000/rate?content=123",
      status: "submitted",
    },
  });
});

test("curyo_ask_humans async returns submitting and scheduled completion marks budget submitted", async () => {
  const scheduledTasks: Array<() => Promise<void> | void> = [];
  const reservationUpdates: Array<{ contentId?: string | null; status: string }> = [];
  let completed = false;

  __setMcpToolTestOverridesForTests({
    completeManagedQuestionSubmissionRequest: async () => {
      completed = true;
      return {
        body: {
          contentId: "777",
          operationKey: OPERATION_KEY,
          status: "submitted",
        },
        status: 200,
      };
    },
    getMcpAgentBudgetSummary: async () => managedBudgetSummary(),
    startManagedQuestionSubmissionRequest: async () => ({
      body: {
        contentId: null,
        operationKey: OPERATION_KEY,
        payment: {
          amount: "1000000",
          asset: "0x0000000000000000000000000000000000000001",
          serviceFeeAmount: "0",
        },
        status: "submitting",
      },
      shouldSubmit: true,
      status: 202,
    }),
    ...quoteOverrides(),
    updateMcpBudgetReservation: async params => {
      reservationUpdates.push({ contentId: params.contentId, status: params.status });
      return null;
    },
  });

  const result = await callCuryoMcpTool({
    agent: AGENT,
    arguments: askArguments({ mode: "async" }),
    name: "curyo_ask_humans",
    scheduleBackgroundTask: task => {
      scheduledTasks.push(task);
    },
  });

  const body = result as unknown as {
    clientRequestId: string;
    managedBudget: { remainingDailyBudgetAtomic: string };
    pollAfterMs: number;
    status: string;
    statusTool: string;
  };

  assert.equal(body.status, "submitting");
  assert.equal(body.clientRequestId, "ask-bookkeeping-failure");
  assert.equal(body.pollAfterMs, 5_000);
  assert.equal(body.statusTool, "curyo_get_question_status");
  assert.equal(body.managedBudget.remainingDailyBudgetAtomic, "4000000");
  assert.equal(completed, false);
  assert.equal(scheduledTasks.length, 1);
  assert.deepEqual(reservationUpdates, []);

  await scheduledTasks[0]?.();

  assert.equal(completed, true);
  assert.deepEqual(reservationUpdates, [{ contentId: "777", status: "submitted" }]);
});

test("curyo_ask_humans async completion failure marks budget failed", async () => {
  mock.method(console, "error", () => {});
  const scheduledTasks: Array<() => Promise<void> | void> = [];
  const reservationUpdates: Array<{ error?: string | null; status: string }> = [];

  __setMcpToolTestOverridesForTests({
    completeManagedQuestionSubmissionRequest: async () => {
      throw new Error("chain submit failed");
    },
    getMcpAgentBudgetSummary: async () => managedBudgetSummary(),
    startManagedQuestionSubmissionRequest: async () => ({
      body: {
        contentId: null,
        operationKey: OPERATION_KEY,
        status: "submitting",
      },
      shouldSubmit: true,
      status: 202,
    }),
    ...quoteOverrides(),
    updateMcpBudgetReservation: async params => {
      reservationUpdates.push({ error: params.error, status: params.status });
      return null;
    },
  });

  await callCuryoMcpTool({
    agent: AGENT,
    arguments: askArguments({ mode: "async" }),
    name: "curyo_ask_humans",
    scheduleBackgroundTask: task => {
      scheduledTasks.push(task);
    },
  });

  await scheduledTasks[0]?.();

  assert.deepEqual(reservationUpdates, [{ error: "chain submit failed", status: "failed" }]);
});

test("curyo_ask_humans async does not schedule duplicate active submissions", async () => {
  let scheduled = false;

  __setMcpToolTestOverridesForTests({
    getMcpAgentBudgetSummary: async () => managedBudgetSummary(),
    startManagedQuestionSubmissionRequest: async () => ({
      body: {
        contentId: null,
        operationKey: OPERATION_KEY,
        status: "submitting",
      },
      shouldSubmit: false,
      status: 202,
    }),
    ...quoteOverrides(),
    updateMcpBudgetReservation: async () => {
      throw new Error("budget should not be updated for active duplicate");
    },
  });

  const result = await callCuryoMcpTool({
    agent: AGENT,
    arguments: askArguments({ mode: "async" }),
    name: "curyo_ask_humans",
    scheduleBackgroundTask: () => {
      scheduled = true;
    },
  });

  assert.equal((result as unknown as { status: string }).status, "submitting");
  assert.equal(scheduled, false);
});

test("curyo_ask_humans registers webhooks and enqueues submitted callbacks", async () => {
  const registered: unknown[] = [];
  const enqueued: unknown[] = [];

  __setMcpToolTestOverridesForTests({
    enqueueAgentCallbackEvent: async params => {
      enqueued.push(params);
      return [];
    },
    getMcpAgentBudgetSummary: async () => managedBudgetSummary(),
    handleManagedQuestionSubmissionRequest: async () => ({
      body: {
        contentId: "123",
        contentIds: ["123"],
        operationKey: OPERATION_KEY,
        status: "submitted",
      },
      status: 200,
    }),
    ...quoteOverrides(),
    updateMcpBudgetReservation: async () => null,
    upsertAgentCallbackSubscription: async params => {
      registered.push(params);
      return null;
    },
  });

  const result = await callCuryoMcpTool({
    agent: AGENT,
    arguments: askArguments({
      webhookEvents: ["question.submitted"],
      webhookSecret: "webhook-secret",
      webhookUrl: "https://agent.example/curyo",
    }),
    name: "curyo_ask_humans",
  });

  const body = result as unknown as {
    webhook: { events: string[]; registered: boolean; signatureHeaders: string[] };
  };

  assert.equal(body.webhook.registered, true);
  assert.deepEqual(body.webhook.events, ["question.submitted"]);
  assert.ok(body.webhook.signatureHeaders.includes("x-curyo-callback-signature"));
  assert.equal(registered.length, 1);
  assert.deepEqual(registered[0], {
    agentId: AGENT.id,
    callbackUrl: "https://agent.example/curyo",
    eventTypes: ["question.submitted"],
    secret: "webhook-secret",
  });
  assert.equal(enqueued.length, 1);
  assert.deepEqual(enqueued[0], {
    agentId: AGENT.id,
    eventId: `${OPERATION_KEY}:question.submitted`,
    eventType: "question.submitted",
    payload: {
      chainId: 42220,
      clientRequestId: "ask-bookkeeping-failure",
      contentId: "123",
      contentIds: ["123"],
      error: null,
      eventType: "question.submitted",
      operationKey: OPERATION_KEY,
      publicUrl: "http://localhost:3000/rate?content=123",
      status: "submitted",
    },
  });
});

test("curyo_ask_humans registers the default lifecycle webhook events", async () => {
  const registered: unknown[] = [];

  __setMcpToolTestOverridesForTests({
    getMcpAgentBudgetSummary: async () => managedBudgetSummary(),
    handleManagedQuestionSubmissionRequest: async () => ({
      body: {
        contentId: "123",
        operationKey: OPERATION_KEY,
        status: "submitted",
      },
      status: 200,
    }),
    ...quoteOverrides(),
    updateMcpBudgetReservation: async () => null,
    upsertAgentCallbackSubscription: async params => {
      registered.push(params);
      return null;
    },
  });

  await callCuryoMcpTool({
    agent: AGENT,
    arguments: askArguments({
      webhookSecret: "webhook-secret",
      webhookUrl: "https://agent.example/curyo",
    }),
    name: "curyo_ask_humans",
  });

  assert.deepEqual(registered[0], {
    agentId: AGENT.id,
    callbackUrl: "https://agent.example/curyo",
    eventTypes: [
      "question.submitting",
      "question.submitted",
      "question.open",
      "question.settling",
      "question.failed",
      "question.settled",
      "feedback.unlocked",
      "bounty.low_response",
    ],
    secret: "webhook-secret",
  });
});
