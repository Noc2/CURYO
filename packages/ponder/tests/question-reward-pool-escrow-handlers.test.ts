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
  questionRewardPool: "questionRewardPool",
  questionRewardPoolClaim: "questionRewardPoolClaim",
  questionRewardPoolRound: "questionRewardPoolRound",
}));

function resolveSetter(valuesOrUpdater: Record<string, unknown> | ((row: any) => Record<string, unknown>)) {
  if (typeof valuesOrUpdater !== "function") return valuesOrUpdater;

  return valuesOrUpdater({
    allocatedAmount: 0n,
    claimedAmount: 0n,
    claimedCount: 0,
    frontendClaimedAmount: 0n,
    qualifiedRounds: 0,
    refundedAmount: 0n,
    unallocatedAmount: 100_000_000n,
    voterClaimedAmount: 0n,
  });
}

function createDb(findResults: Record<string, unknown> = {}) {
  const inserts: Array<{ table: string; values: Record<string, unknown> }> = [];
  const updates: Array<{ table: string; key: Record<string, unknown>; values: Record<string, unknown> }> = [];

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
        };
      }),
    })),
    update: vi.fn((table: string, key: Record<string, unknown>) => ({
      set: vi.fn(async (valuesOrUpdater: Record<string, unknown> | ((row: any) => Record<string, unknown>)) => {
        updates.push({ table, key, values: resolveSetter(valuesOrUpdater) });
      }),
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
  it("indexes created reward pools with USDC accounting fields", async () => {
    const { db, inserts, updates } = createDb({ content: { id: 1n } });
    const registeredHandlers = await loadHandlers();
    const handler = registeredHandlers.get("QuestionRewardPoolEscrow:RewardPoolCreated");

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
          expiresAt: 0n,
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
    expect(updates).toContainEqual(expect.objectContaining({ table: "content" }));
  });

  it("updates reward pool and round accounting for qualifications, claims, and refunds", async () => {
    const { db, inserts, updates } = createDb({
      'questionRewardPool:{"id":"7"}': { id: 7n, contentId: 1n },
      content: { id: 1n },
    });
    const registeredHandlers = await loadHandlers();

    await registeredHandlers.get("QuestionRewardPoolEscrow:RewardPoolRoundQualified")!({
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

    await registeredHandlers.get("QuestionRewardPoolEscrow:QuestionRewardClaimed")!({
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

    await registeredHandlers.get("QuestionRewardPoolEscrow:RewardPoolRefunded")!({
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
          values: expect.objectContaining({ allocatedAmount: 50_000_000n, qualifiedRounds: 1 }),
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
          values: expect.objectContaining({ refunded: true, refundedAmount: 50_000_000n }),
        }),
      ]),
    );
  });
});
