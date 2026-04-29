import { afterEach, describe, expect, it, vi } from "vitest";

type RegisteredHandler = (args: {
  event: {
    args: Record<string, unknown>;
    block: { number: bigint; timestamp: bigint };
  };
  context: { db: ReturnType<typeof createDb>["db"] };
}) => Promise<void>;

const handlers = new Map<string, RegisteredHandler>();

vi.mock("ponder:registry", () => ({
  ponder: {
    on: vi.fn((name: string, handler: RegisteredHandler) => {
      handlers.set(name, handler);
    }),
  },
}));

vi.mock("ponder:schema", () => ({
  content: "content",
  questionBundleClaim: "questionBundleClaim",
  questionBundleQuestion: "questionBundleQuestion",
  questionBundleRound: "questionBundleRound",
  questionBundleRoundSet: "questionBundleRoundSet",
  questionBundleReward: "questionBundleReward",
  questionRewardPool: "questionRewardPool",
  questionRewardPoolClaim: "questionRewardPoolClaim",
  questionRewardPoolRound: "questionRewardPoolRound",
}));

function resolveSetter(
  valuesOrUpdater:
    | Record<string, unknown>
    | ((row: any) => Record<string, unknown>),
) {
  if (typeof valuesOrUpdater !== "function") return valuesOrUpdater;

  return valuesOrUpdater({
    allocatedAmount: 0n,
    claimedAmount: 0n,
    claimedCount: 0,
    completedRoundSetCount: 0,
    frontendClaimedAmount: 0n,
    qualifiedRounds: 0,
    refundedAmount: 0n,
    totalRecordedQuestionRounds: 0,
    unallocatedAmount: 100_000_000n,
    voterClaimedAmount: 0n,
  });
}

function createDb(findResults: Record<string, unknown> = {}) {
  const inserts: Array<{ table: string; values: Record<string, unknown> }> = [];
  const updates: Array<{
    table: string;
    key: Record<string, unknown>;
    values: Record<string, unknown>;
  }> = [];

  const db = {
    find: vi.fn(async (table: string, key: Record<string, unknown>) => {
      const lookupKey = `${table}:${JSON.stringify(key, (_name, value) =>
        typeof value === "bigint" ? value.toString() : value,
      )}`;
      return findResults[lookupKey] ?? findResults[table] ?? null;
    }),
    insert: vi.fn((table: string) => ({
      values: vi.fn((values: Record<string, unknown>) => {
        inserts.push({ table, values });
        return {
          onConflictDoNothing: vi.fn(async () => undefined),
          onConflictDoUpdate: vi.fn(async () => undefined),
        };
      }),
    })),
    update: vi.fn((table: string, key: Record<string, unknown>) => ({
      set: vi.fn(
        async (
          valuesOrUpdater:
            | Record<string, unknown>
            | ((row: any) => Record<string, unknown>),
        ) => {
          updates.push({ table, key, values: resolveSetter(valuesOrUpdater) });
        },
      ),
    })),
  };

  return { db, inserts, updates };
}

async function loadHandlers() {
  handlers.clear();
  await import("../src/QuestionRewardPoolEscrow.js");
  return handlers;
}

afterEach(() => {
  handlers.clear();
  vi.resetModules();
  vi.clearAllMocks();
});

describe("QuestionRewardPoolEscrow ponder handlers", () => {
  it("indexes created bounties with USDC accounting fields", async () => {
    const { db, inserts, updates } = createDb({ content: { id: 1n } });
    const registeredHandlers = await loadHandlers();
    const handler = registeredHandlers.get(
      "QuestionRewardPoolEscrow:RewardPoolCreated",
    );

    expect(handler).toBeDefined();

    await handler!({
      event: {
        args: {
          rewardPoolId: 7n,
          contentId: 1n,
          funder: "0x0000000000000000000000000000000000000001",
          funderVoterId: 11n,
          amount: 100_000_000n,
          requiredVoters: 5n,
          requiredSettledRounds: 2n,
          startRoundId: 3n,
          bountyOpensAt: 1_700n,
          bountyClosesAt: 2_592_000n,
          feedbackClosesAt: 2_592_000n,
          frontendFeeBps: 300n,
        },
        block: { number: 10n, timestamp: 1_700n },
      },
      context: { db },
    });

    expect(inserts).toContainEqual({
      table: "questionRewardPool",
      values: expect.objectContaining({
        id: 7n,
        contentId: 1n,
        fundedAmount: 100_000_000n,
        unallocatedAmount: 100_000_000n,
        frontendFeeBps: 300,
        requiredVoters: 5,
        requiredSettledRounds: 2,
        startRoundId: 3n,
      }),
    });
    expect(updates).toContainEqual(
      expect.objectContaining({ table: "content" }),
    );
  });

  it("updates bounty and round accounting for qualifications, claims, and refunds", async () => {
    const { db, inserts, updates } = createDb({
      'questionRewardPool:{"id":"7"}': { id: 7n, contentId: 1n },
      content: { id: 1n },
    });
    const registeredHandlers = await loadHandlers();

    await registeredHandlers.get(
      "QuestionRewardPoolEscrow:RewardPoolRoundQualified",
    )!({
      event: {
        args: {
          rewardPoolId: 7n,
          contentId: 1n,
          roundId: 3n,
          allocation: 50_000_000n,
          eligibleVoters: 5n,
          frontendFeeAllocation: 1_500_000n,
        },
        block: { number: 11n, timestamp: 1_800n },
      },
      context: { db },
    });

    await registeredHandlers.get(
      "QuestionRewardPoolEscrow:QuestionRewardClaimed",
    )!({
      event: {
        args: {
          rewardPoolId: 7n,
          contentId: 1n,
          roundId: 3n,
          claimant: "0x0000000000000000000000000000000000000002",
          voterId: 12n,
          amount: 9_700_000n,
          frontend: "0x00000000000000000000000000000000000000f1",
          frontendRecipient: "0x00000000000000000000000000000000000000f1",
          frontendFee: 300_000n,
          grossAmount: 10_000_000n,
        },
        block: { number: 12n, timestamp: 1_900n },
      },
      context: { db },
    });

    await registeredHandlers.get(
      "QuestionRewardPoolEscrow:RewardPoolRefunded",
    )!({
      event: {
        args: {
          rewardPoolId: 7n,
          funder: "0x0000000000000000000000000000000000000001",
          amount: 50_000_000n,
        },
        block: { number: 13n, timestamp: 2_000n },
      },
      context: { db },
    });

    expect(inserts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "questionRewardPoolRound",
          values: expect.objectContaining({
            id: "7-3",
            allocation: 50_000_000n,
            frontendFeeAllocation: 1_500_000n,
            eligibleVoters: 5,
          }),
        }),
        expect.objectContaining({
          table: "questionRewardPoolClaim",
          values: expect.objectContaining({
            id: "7-3-12",
            amount: 9_700_000n,
            grossAmount: 10_000_000n,
            frontendFee: 300_000n,
          }),
        }),
      ]),
    );
    expect(updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "questionRewardPool",
          values: expect.objectContaining({
            allocatedAmount: 50_000_000n,
            qualifiedRounds: 1,
          }),
        }),
        expect.objectContaining({
          table: "questionRewardPoolRound",
          values: expect.objectContaining({
            claimedAmount: 10_000_000n,
            voterClaimedAmount: 9_700_000n,
            frontendClaimedAmount: 300_000n,
            claimedCount: 1,
          }),
        }),
        expect.objectContaining({
          table: "questionRewardPool",
          values: expect.objectContaining({
            claimedAmount: 10_000_000n,
            voterClaimedAmount: 9_700_000n,
            frontendClaimedAmount: 300_000n,
          }),
        }),
        expect.objectContaining({
          table: "questionRewardPool",
          values: expect.objectContaining({
            refunded: true,
            refundedAmount: 50_000_000n,
          }),
        }),
      ]),
    );
  });

  it("indexes multi-round bundle reward round sets and claims", async () => {
    const { db, inserts, updates } = createDb();
    const registeredHandlers = await loadHandlers();

    await registeredHandlers.get(
      "QuestionRewardPoolEscrow:QuestionBundleRewardCreated",
    )!({
      event: {
        args: {
          bundleId: 9n,
          funder: "0x0000000000000000000000000000000000000001",
          funderVoterId: 11n,
          amount: 120_000_000n,
          requiredCompleters: 3n,
          questionCount: 2n,
          requiredSettledRounds: 2n,
          bountyOpensAt: 1_700n,
          bountyClosesAt: 2_592_000n,
          feedbackClosesAt: 2_592_000n,
          frontendFeeBps: 300n,
          asset: 1n,
        },
        block: { number: 20n, timestamp: 1_700n },
      },
      context: { db },
    });

    await registeredHandlers.get(
      "QuestionRewardPoolEscrow:QuestionBundleRoundRecorded",
    )!({
      event: {
        args: {
          bundleId: 9n,
          contentId: 101n,
          roundId: 4n,
          bundleIndex: 0n,
          roundSetIndex: 1n,
        },
        block: { number: 21n, timestamp: 1_800n },
      },
      context: { db },
    });

    await registeredHandlers.get(
      "QuestionRewardPoolEscrow:QuestionBundleRoundSetQualified",
    )!({
      event: {
        args: {
          bundleId: 9n,
          roundSetIndex: 1n,
          allocation: 60_000_000n,
          frontendFeeAllocation: 1_800_000n,
        },
        block: { number: 22n, timestamp: 1_900n },
      },
      context: { db },
    });

    await registeredHandlers.get(
      "QuestionRewardPoolEscrow:QuestionBundleRewardClaimed",
    )!({
      event: {
        args: {
          bundleId: 9n,
          roundSetIndex: 1n,
          claimant: "0x0000000000000000000000000000000000000002",
          voterId: 12n,
          amount: 19_400_000n,
          frontend: "0x00000000000000000000000000000000000000f1",
          frontendRecipient: "0x00000000000000000000000000000000000000f1",
          frontendFee: 600_000n,
          grossAmount: 20_000_000n,
        },
        block: { number: 23n, timestamp: 2_000n },
      },
      context: { db },
    });

    expect(inserts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "questionBundleReward",
          values: expect.objectContaining({
            id: 9n,
            fundedAmount: 120_000_000n,
            unallocatedAmount: 120_000_000n,
            requiredCompleters: 3,
            requiredSettledRounds: 2,
            questionCount: 2,
          }),
        }),
        expect.objectContaining({
          table: "questionBundleRound",
          values: expect.objectContaining({
            id: "9-1-0",
            bundleId: 9n,
            roundSetIndex: 1,
            roundId: 4n,
          }),
        }),
        expect.objectContaining({
          table: "questionBundleRoundSet",
          values: expect.objectContaining({
            id: "9-1",
            allocation: 60_000_000n,
            frontendFeeAllocation: 1_800_000n,
          }),
        }),
        expect.objectContaining({
          table: "questionBundleClaim",
          values: expect.objectContaining({
            id: "9-1-12",
            roundSetIndex: 1,
            amount: 19_400_000n,
            frontendFee: 600_000n,
          }),
        }),
      ]),
    );
    expect(updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "questionBundleReward",
          values: expect.objectContaining({ totalRecordedQuestionRounds: 1 }),
        }),
        expect.objectContaining({
          table: "questionBundleReward",
          values: expect.objectContaining({
            unallocatedAmount: 40_000_000n,
            allocatedAmount: 60_000_000n,
            completedRoundSetCount: 1,
          }),
        }),
        expect.objectContaining({
          table: "questionBundleRoundSet",
          values: expect.objectContaining({
            claimedAmount: 20_000_000n,
            voterClaimedAmount: 19_400_000n,
            frontendClaimedAmount: 600_000n,
            claimedCount: 1,
          }),
        }),
      ]),
    );
  });

  it("marks bundle rewards refunded when unused funds are returned or forfeited", async () => {
    const { db, updates } = createDb();
    const registeredHandlers = await loadHandlers();

    expect(
      registeredHandlers.has("QuestionRewardPoolEscrow:QuestionBundleFailed"),
    ).toBe(false);

    await registeredHandlers.get(
      "QuestionRewardPoolEscrow:QuestionBundleRewardRefunded",
    )!({
      event: {
        args: {
          bundleId: 9n,
          funder: "0x0000000000000000000000000000000000000001",
          amount: 30_000_000n,
        },
        block: { number: 21n, timestamp: 2_100n },
      },
      context: { db },
    });

    await registeredHandlers.get(
      "QuestionRewardPoolEscrow:QuestionBundleRewardForfeited",
    )!({
      event: {
        args: {
          bundleId: 10n,
          treasury: "0x0000000000000000000000000000000000000003",
          amount: 20_000_000n,
        },
        block: { number: 22n, timestamp: 2_200n },
      },
      context: { db },
    });

    expect(updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "questionBundleReward",
          key: { id: 9n },
          values: expect.objectContaining({
            refunded: true,
            refundedAmount: 30_000_000n,
          }),
        }),
        expect.objectContaining({
          table: "questionBundleReward",
          key: { id: 10n },
          values: expect.objectContaining({
            refunded: true,
            refundedAmount: 20_000_000n,
          }),
        }),
      ]),
    );
  });
});
