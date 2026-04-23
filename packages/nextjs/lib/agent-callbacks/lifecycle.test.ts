import { __setAgentLifecycleTestOverridesForTests, sweepAgentLifecycleCallbacks } from "./lifecycle";
import assert from "node:assert/strict";
import test, { afterEach } from "node:test";

const CANDIDATE = {
  agentId: "agent-a",
  chainId: 42220,
  clientRequestId: "pitch-1",
  contentId: "42",
  operationKey: `0x${"1".repeat(64)}` as const,
};

function contentResponse(overrides: Record<string, unknown> = {}) {
  return {
    audienceContext: null,
    content: {
      openRound: {
        estimatedSettlementTime: "1700000600",
        roundId: "7",
      },
      ...overrides,
    },
    ratings: [],
    rounds: [],
  };
}

afterEach(() => {
  __setAgentLifecycleTestOverridesForTests(null);
});

test("sweepAgentLifecycleCallbacks emits open and settling for overdue open rounds", async () => {
  const enqueued: Array<{ eventId?: string; eventType: string; payload: unknown }> = [];

  __setAgentLifecycleTestOverridesForTests({
    enqueueAgentCallbackEvent: async params => {
      enqueued.push(params);
      return [];
    },
    getContentById: async () =>
      contentResponse({
        openRound: {
          estimatedSettlementTime: "1700000000",
          roundId: "7",
        },
      }) as never,
    listCandidates: async () => [CANDIDATE],
    listContentFeedback: async () =>
      ({
        items: [],
      }) as never,
  });

  const result = await sweepAgentLifecycleCallbacks({
    now: new Date("2023-11-14T22:13:40.000Z"),
  });

  assert.deepEqual(result.emitted, {
    feedbackUnlocked: 0,
    questionOpen: 1,
    questionSettled: 0,
    questionSettling: 1,
  });
  assert.deepEqual(
    enqueued.map(event => event.eventType),
    ["question.open", "question.settling"],
  );
});

test("sweepAgentLifecycleCallbacks emits settled and feedback unlocked for terminal rounds", async () => {
  const enqueued: Array<{ eventType: string }> = [];

  __setAgentLifecycleTestOverridesForTests({
    enqueueAgentCallbackEvent: async params => {
      enqueued.push({ eventType: params.eventType });
      return [];
    },
    getContentById: async () =>
      ({
        ...contentResponse({ openRound: null }),
        rounds: [{ roundId: "7", state: 1 }],
      }) as never,
    listCandidates: async () => [CANDIDATE],
    listContentFeedback: async () =>
      ({
        items: [{ id: 1 }],
      }) as never,
  });

  const result = await sweepAgentLifecycleCallbacks();

  assert.deepEqual(result.emitted, {
    feedbackUnlocked: 1,
    questionOpen: 0,
    questionSettled: 1,
    questionSettling: 0,
  });
  assert.deepEqual(
    enqueued.map(event => event.eventType),
    ["question.settled", "feedback.unlocked"],
  );
});

test("sweepAgentLifecycleCallbacks stays idempotent through stable event ids", async () => {
  const seen = new Set<string>();
  let duplicateCount = 0;

  __setAgentLifecycleTestOverridesForTests({
    enqueueAgentCallbackEvent: async params => {
      if (params.eventId && seen.has(params.eventId)) duplicateCount += 1;
      if (params.eventId) seen.add(params.eventId);
      return [];
    },
    getContentById: async () =>
      contentResponse({
        openRound: {
          estimatedSettlementTime: "1700000000",
          roundId: "7",
        },
      }) as never,
    listCandidates: async () => [CANDIDATE],
    listContentFeedback: async () =>
      ({
        items: [],
      }) as never,
  });

  await sweepAgentLifecycleCallbacks({
    now: new Date("2023-11-14T22:13:40.000Z"),
  });
  await sweepAgentLifecycleCallbacks({
    now: new Date("2023-11-14T22:13:40.000Z"),
  });

  assert.equal(seen.size, 2);
  assert.equal(duplicateCount, 2);
});
