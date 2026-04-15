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
  questionBounty: "questionBounty",
  questionBountyClaim: "questionBountyClaim",
  questionBountyRound: "questionBountyRound",
}));

function resolveSetter(valuesOrUpdater: Record<string, unknown> | ((row: any) => Record<string, unknown>)) {
  if (typeof valuesOrUpdater !== "function") return valuesOrUpdater;

  return valuesOrUpdater({
    allocatedAmount: 0n,
    claimedAmount: 0n,
    claimedCount: 0,
    qualifiedRounds: 0,
    refundedAmount: 0n,
    unallocatedAmount: 100_000_000n,
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
  await import("../src/QuestionBountyEscrow.js");
  return handlers;
}

afterEach(() => {
  handlers.clear();
  vi.resetModules();
  vi.clearAllMocks();
});

describe("QuestionBountyEscrow ponder handlers", () => {
  it("indexes created bounties with USDC accounting fields", async () => {
    const { db, inserts, updates } = createDb({ content: { id: 1n } });
    const registeredHandlers = await loadHandlers();
    const handler = registeredHandlers.get("QuestionBountyEscrow:BountyCreated");

    expect(handler).toBeDefined();

    await handler!({
      event: {
        args: {
          bountyId: 7n,
          contentId: 1n,
          funder: "0x0000000000000000000000000000000000000001",
          funderVoterId: 11n,
          amount: 100_000_000n,
          requiredVoters: 5n,
          requiredSettledRounds: 2n,
          startRoundId: 3n,
          expiresAt: 0n,
        },
        block: { number: 10n, timestamp: 1_700n },
      },
      context: { db },
    });

    expect(inserts).toContainEqual({
      table: "questionBounty",
      values: expect.objectContaining({
        id: 7n,
        contentId: 1n,
        fundedAmount: 100_000_000n,
        unallocatedAmount: 100_000_000n,
        requiredVoters: 5,
        requiredSettledRounds: 2,
        startRoundId: 3n,
      }),
    });
    expect(updates).toContainEqual(expect.objectContaining({ table: "content" }));
  });

  it("updates bounty and round accounting for qualifications, claims, and refunds", async () => {
    const { db, inserts, updates } = createDb({
      'questionBounty:{"id":"7"}': { id: 7n, contentId: 1n },
      content: { id: 1n },
    });
    const registeredHandlers = await loadHandlers();

    await registeredHandlers.get("QuestionBountyEscrow:BountyRoundQualified")!({
      event: {
        args: {
          bountyId: 7n,
          contentId: 1n,
          roundId: 3n,
          allocation: 50_000_000n,
          eligibleVoters: 5n,
        },
        block: { number: 11n, timestamp: 1_800n },
      },
      context: { db },
    });

    await registeredHandlers.get("QuestionBountyEscrow:BountyRewardClaimed")!({
      event: {
        args: {
          bountyId: 7n,
          contentId: 1n,
          roundId: 3n,
          claimant: "0x0000000000000000000000000000000000000002",
          voterId: 12n,
          amount: 10_000_000n,
        },
        block: { number: 12n, timestamp: 1_900n },
      },
      context: { db },
    });

    await registeredHandlers.get("QuestionBountyEscrow:BountyRefunded")!({
      event: {
        args: {
          bountyId: 7n,
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
          table: "questionBountyRound",
          values: expect.objectContaining({ id: "7-3", allocation: 50_000_000n, eligibleVoters: 5 }),
        }),
        expect.objectContaining({
          table: "questionBountyClaim",
          values: expect.objectContaining({ id: "7-3-12", amount: 10_000_000n }),
        }),
      ]),
    );
    expect(updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "questionBounty",
          values: expect.objectContaining({ allocatedAmount: 50_000_000n, qualifiedRounds: 1 }),
        }),
        expect.objectContaining({
          table: "questionBountyRound",
          values: expect.objectContaining({ claimedAmount: 10_000_000n, claimedCount: 1 }),
        }),
        expect.objectContaining({
          table: "questionBounty",
          values: expect.objectContaining({ refunded: true, refundedAmount: 50_000_000n }),
        }),
      ]),
    );
  });
});
