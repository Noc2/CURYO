import { __setAgentLifecycleTestOverridesForTests, sweepAgentLifecycleCallbacks } from "./lifecycle";
import assert from "node:assert/strict";
import test, { afterEach } from "node:test";

const CANDIDATE = {
  agentId: "agent-a",
  chainId: 42220,
  clientRequestId: "pitch-1",
  contentId: "42",
  operationKey: `0x${"1".repeat(64)}` as const,
  sortAt: new Date("2023-11-14T22:00:00.000Z"),
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
    bountyLowResponse: 0,
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
    bountyLowResponse: 0,
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

test("sweepAgentLifecycleCallbacks pages past the first batch without starving newer asks", async () => {
  const listCalls: Array<{ after: string | null; limit: number }> = [];
  const openedContentIds: string[] = [];
  const candidates = [
    {
      ...CANDIDATE,
      contentId: "41",
      operationKey: `0x${"2".repeat(64)}` as const,
      sortAt: new Date("2023-11-14T22:00:00.000Z"),
    },
    {
      ...CANDIDATE,
      contentId: "42",
      operationKey: `0x${"3".repeat(64)}` as const,
      sortAt: new Date("2023-11-14T22:01:00.000Z"),
    },
    {
      ...CANDIDATE,
      contentId: "43",
      operationKey: `0x${"4".repeat(64)}` as const,
      sortAt: new Date("2023-11-14T22:02:00.000Z"),
    },
  ];

  __setAgentLifecycleTestOverridesForTests({
    enqueueAgentCallbackEvent: async params => {
      if (params.eventType === "question.open") {
        openedContentIds.push(String((params.payload as { contentId?: string }).contentId));
      }
      return [];
    },
    getContentById: async contentId =>
      contentResponse({
        id: contentId,
        openRound: {
          estimatedSettlementTime: "1700000600",
          roundId: "7",
        },
      }) as never,
    listCandidates: async ({ after, limit }) => {
      listCalls.push({
        after: after?.operationKey ?? null,
        limit,
      });
      return candidates
        .filter(candidate => {
          if (!after) return true;
          return (
            candidate.sortAt.getTime() > after.sortAt.getTime() ||
            (candidate.sortAt.getTime() === after.sortAt.getTime() &&
              candidate.operationKey > after.operationKey)
          );
        })
        .slice(0, limit);
    },
    listContentFeedback: async () =>
      ({
        items: [],
      }) as never,
  });

  const result = await sweepAgentLifecycleCallbacks({
    limit: 2,
    now: new Date("2023-11-14T22:13:40.000Z"),
  });

  assert.equal(result.scanned, 3);
  assert.deepEqual(openedContentIds, ["41", "42", "43"]);
  assert.deepEqual(listCalls, [
    {
      after: null,
      limit: 2,
    },
    {
      after: `0x${"3".repeat(64)}`,
      limit: 2,
    },
  ]);
});

test("sweepAgentLifecycleCallbacks emits bounty.low_response with live ask guidance", async () => {
  const enqueued: Array<{ eventType: string; payload: Record<string, unknown> }> = [];

  __setAgentLifecycleTestOverridesForTests({
    enqueueAgentCallbackEvent: async params => {
      enqueued.push({
        eventType: params.eventType,
        payload: params.payload as Record<string, unknown>,
      });
      return [];
    },
    getContentById: async () =>
      ({
        ...contentResponse({
          openRound: {
            epochDuration: 1200,
            estimatedSettlementTime: "1700000400",
            lowSince: "1700000100",
            maxDuration: 7200,
            maxVoters: 50,
            minVoters: 3,
            roundId: "7",
            voteCount: 1,
          },
          rewardPoolSummary: {
            currentRewardPoolAmount: "1000000",
            hasActiveBounty: true,
            nextBountyClosesAt: "1700000600",
          },
          roundEpochDuration: 1200,
          roundMaxDuration: 7200,
          roundMaxVoters: 50,
          roundMinVoters: 3,
        }),
        rounds: [],
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

  assert.equal(result.emitted.bountyLowResponse, 1);
  assert.equal(enqueued.at(-1)?.eventType, "bounty.low_response");
  assert.deepEqual(enqueued.at(-1)?.payload.liveAskGuidance, {
    lowResponseRisk: "high",
    reasonCodes: [
      "quorum_not_reached",
      "low_response_persisting",
      "bounty_below_healthy_target",
      "bounty_closing_soon",
      "settlement_near_with_quorum_gap",
    ],
    recommendedAction: "retry_later",
    suggestedTopUpAtomic: "500000",
  });
});
