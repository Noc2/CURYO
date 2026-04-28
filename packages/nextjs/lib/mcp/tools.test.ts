import type { McpAgentAuth } from "./auth";
import { __setMcpToolTestOverridesForTests, callCuryoMcpTool } from "./tools";
import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import { __setDatabaseResourcesForTests } from "~~/lib/db";
import { createMemoryDatabaseResources } from "~~/lib/db/testMemory";
import { __setUrlSafetyDnsResolversForTests } from "~~/utils/urlSafety";

const AGENT: McpAgentAuth = {
  allowedCategoryIds: null,
  dailyBudgetAtomic: 5_000_000n,
  id: "agent-a",
  perAskLimitAtomic: 2_000_000n,
  scopes: new Set(["curyo:ask"]),
  tokenHash: "a".repeat(64),
  walletAddress: "0x00000000000000000000000000000000000000aa",
};
const RESTRICTED_AGENT: McpAgentAuth = {
  ...AGENT,
  allowedCategoryIds: new Set(["5"]),
  id: "restricted-agent",
};
const OPERATION_KEY = `0x${"1".repeat(64)}` as const;

function askArguments(overrides: Record<string, unknown> = {}) {
  return {
    bounty: {
      amount: "1000000",
      asset: "USDC",
      rewardPoolExpiresAt: "1762000000",
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
        questionRewardPoolEscrowAddress: "0x0000000000000000000000000000000000000002",
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

beforeEach(() => {
  __setDatabaseResourcesForTests(createMemoryDatabaseResources());
  __setUrlSafetyDnsResolversForTests({
    resolve4: async () => ["93.184.216.34"],
    resolve6: async () => [],
  });
});

afterEach(() => {
  mock.reset();
  __setDatabaseResourcesForTests(null);
  __setUrlSafetyDnsResolversForTests(null);
  __setMcpToolTestOverridesForTests(null);
});

test("curyo_ask_humans returns a wallet transaction plan without submitting from the server", async () => {
  mock.method(console, "error", () => {});
  const prepared: unknown[] = [];

  __setMcpToolTestOverridesForTests({
    getMcpAgentBudgetSummary: async () => managedBudgetSummary(),
    prepareAgentWalletQuestionSubmissionRequest: async params => {
      prepared.push(params);
      return {
        body: {
          clientRequestId: "mcp:hashed",
          operationKey: OPERATION_KEY,
          payment: {
            amount: "1000000",
            asset: "USDC",
            bountyAmount: "1000000",
            decimals: 6,
            spender: "0x0000000000000000000000000000000000000002",
            tokenAddress: "0x0000000000000000000000000000000000000001",
          },
          status: "awaiting_wallet_signature",
          transactionPlan: {
            calls: [{ id: "approve-usdc", to: "0x0000000000000000000000000000000000000001" }],
            requiresOrderedExecution: true,
          },
          wallet: { address: params.walletAddress, fundingMode: "agent_wallet" },
        },
        status: 202,
      };
    },
    ...quoteOverrides(),
  });

  const result = await callCuryoMcpTool({
    agent: AGENT,
    arguments: askArguments(),
    name: "curyo_ask_humans",
  });

  const body = result as unknown as {
    confirmTool: string;
    managedBudget: { remainingDailyBudgetAtomic: string };
    status: string;
    transactionPlan: { calls: unknown[] };
    wallet: { address: string };
  };

  assert.equal(body.status, "awaiting_wallet_signature");
  assert.equal(body.confirmTool, "curyo_confirm_ask_transactions");
  assert.equal(body.wallet.address, AGENT.walletAddress);
  assert.equal(body.transactionPlan.calls.length, 1);
  assert.equal(body.managedBudget.remainingDailyBudgetAtomic, "4000000");
  assert.equal(prepared.length, 1);
});

test("curyo_ask_humans rejects bundle members outside the agent category allowlist", async () => {
  await assert.rejects(
    () =>
      callCuryoMcpTool({
        agent: RESTRICTED_AGENT,
        arguments: askArguments({
          questions: [
            {
              categoryId: "5",
              contextUrl: "https://example.com/context",
              description: "Should this autonomous action continue?",
              tags: ["agents"],
              title: "Agent action approval",
            },
            {
              categoryId: "6",
              contextUrl: "https://example.com/alternate",
              description: "Should this alternate action continue?",
              tags: ["agents"],
              title: "Agent action approval follow-up",
            },
          ],
          question: undefined,
        }),
        name: "curyo_ask_humans",
      }),
    /not allowed to ask in category 6/i,
  );
});

test("curyo_ask_humans registers webhooks and enqueues the awaiting-signature callback", async () => {
  const registered: unknown[] = [];
  const enqueued: unknown[] = [];

  __setMcpToolTestOverridesForTests({
    enqueueAgentCallbackEvent: async params => {
      enqueued.push(params);
      return [];
    },
    getMcpAgentBudgetSummary: async () => managedBudgetSummary(),
    prepareAgentWalletQuestionSubmissionRequest: async params => ({
      body: {
        operationKey: OPERATION_KEY,
        status: "awaiting_wallet_signature",
        wallet: { address: params.walletAddress, fundingMode: "agent_wallet" },
      },
      status: 202,
    }),
    ...quoteOverrides(),
    upsertAgentCallbackSubscription: async params => {
      registered.push(params);
      return null;
    },
  });

  const result = await callCuryoMcpTool({
    agent: AGENT,
    arguments: askArguments({
      webhookEvents: ["question.submitting"],
      webhookSecret: "webhook-secret",
      webhookUrl: "https://agent.example/curyo",
    }),
    name: "curyo_ask_humans",
  });

  const body = result as unknown as {
    webhook: { events: string[]; registered: boolean; signatureHeaders: string[] };
  };

  assert.equal(body.webhook.registered, true);
  assert.deepEqual(body.webhook.events, ["question.submitting"]);
  assert.ok(body.webhook.signatureHeaders.includes("x-curyo-callback-signature"));
  assert.equal(registered.length, 1);
  assert.deepEqual(registered[0], {
    agentId: AGENT.id,
    callbackUrl: "https://agent.example/curyo",
    eventTypes: ["question.submitting"],
    secret: "webhook-secret",
  });
  assert.equal(enqueued.length, 1);
  assert.deepEqual(enqueued[0], {
    agentId: AGENT.id,
    eventId: `${OPERATION_KEY}:question.submitting`,
    eventType: "question.submitting",
    payload: {
      chainId: 42220,
      clientRequestId: "ask-bookkeeping-failure",
      contentId: null,
      contentIds: [],
      error: null,
      eventType: "question.submitting",
      operationKey: OPERATION_KEY,
      publicUrl: null,
      status: "awaiting_wallet_signature",
    },
  });
});

test("curyo_ask_humans registers the default lifecycle webhook events", async () => {
  const registered: unknown[] = [];

  __setMcpToolTestOverridesForTests({
    enqueueAgentCallbackEvent: async () => [],
    getMcpAgentBudgetSummary: async () => managedBudgetSummary(),
    prepareAgentWalletQuestionSubmissionRequest: async () => ({
      body: {
        operationKey: OPERATION_KEY,
        status: "awaiting_wallet_signature",
      },
      status: 202,
    }),
    ...quoteOverrides(),
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

test("curyo_confirm_ask_transactions marks budget submitted and enqueues submitted callbacks", async () => {
  const enqueued: unknown[] = [];
  const reservationUpdates: unknown[] = [];

  __setMcpToolTestOverridesForTests({
    confirmAgentWalletQuestionSubmissionRequest: async () => ({
      body: {
        chainId: 42220,
        clientRequestId: "ask-bookkeeping-failure",
        contentId: "123",
        contentIds: ["123"],
        operationKey: OPERATION_KEY,
        status: "submitted",
      },
      status: 200,
    }),
    enqueueAgentCallbackEvent: async params => {
      enqueued.push(params);
      return [];
    },
    updateMcpBudgetReservation: async params => {
      reservationUpdates.push(params);
      return null;
    },
  });

  const result = await callCuryoMcpTool({
    agent: AGENT,
    arguments: {
      operationKey: OPERATION_KEY,
      transactionHashes: [`0x${"4".repeat(64)}`],
    },
    name: "curyo_confirm_ask_transactions",
  });

  const body = result as unknown as { contentId: string; publicUrl: string; status: string };
  assert.equal(body.status, "submitted");
  assert.equal(body.contentId, "123");
  assert.equal(body.publicUrl, "http://localhost:3000/rate?content=123");
  assert.deepEqual(reservationUpdates, [{ contentId: "123", operationKey: OPERATION_KEY, status: "submitted" }]);
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

test("curyo_ask_humans rejects unsafe webhook URLs before reservation or wallet planning", async () => {
  let prepared = false;
  let budgetReserved = false;

  __setMcpToolTestOverridesForTests({
    getMcpAgentBudgetSummary: async () => managedBudgetSummary(),
    prepareAgentWalletQuestionSubmissionRequest: async () => {
      prepared = true;
      return { body: { status: "awaiting_wallet_signature" }, status: 202 };
    },
    ...quoteOverrides(),
    reserveMcpAgentBudget: async () => {
      budgetReserved = true;
      return budgetReservation();
    },
  });

  await assert.rejects(
    () =>
      callCuryoMcpTool({
        agent: AGENT,
        arguments: askArguments({
          webhookSecret: "webhook-secret",
          webhookUrl: "http://127.0.0.1:3000/curyo",
        }),
        name: "curyo_ask_humans",
      }),
    /webhookUrl must be a public HTTPS URL/,
  );

  assert.equal(budgetReserved, false);
  assert.equal(prepared, false);
});
