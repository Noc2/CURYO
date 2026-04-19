import { afterEach, describe, expect, it, vi } from "vitest";

type RegisteredHandler = (args: {
  event: {
    args: Record<string, unknown>;
    block: { number: bigint; timestamp: bigint };
  };
  context: Record<string, any>;
}) => Promise<void>;

const handlers = new Map<string, RegisteredHandler>();

vi.mock("ponder:registry", () => ({
  ponder: {
    on: vi.fn((name: string, handler: RegisteredHandler) => {
      handlers.set(name, handler);
    }),
  },
}));

vi.mock("ponder", () => ({
  and: vi.fn(() => "and"),
  eq: vi.fn(() => "eq"),
}));

vi.mock("ponder:schema", () => ({
  category: "category",
  content: "content",
  dailyVoteActivity: "dailyVoteActivity",
  globalStats: "globalStats",
  profile: "profile",
  rewardClaim: "rewardClaim",
  round: "round",
  vote: "vote",
  voterCategoryStats: "voterCategoryStats",
  voterStats: "voterStats",
  voterStreak: "voterStreak",
}));

vi.mock("@curyo/contracts/protocol", () => ({
  DEFAULT_ROUND_CONFIG: {
    epochDurationSeconds: 1200,
    maxDurationSeconds: 604800,
    minVoters: 3,
    maxVoters: 1000,
  },
  ROUND_STATE: {
    Open: 0,
    Settled: 1,
    Cancelled: 2,
    Tied: 3,
    RevealFailed: 4,
  },
}));

function createDb({ existingRound = null }: { existingRound?: Record<string, unknown> | null } = {}) {
  const insertCalls: Array<{ table: string; values: Record<string, unknown> }> = [];
  const updateCalls: Array<{ table: string; key: Record<string, unknown>; values: Record<string, unknown> }> = [];
  const contentRecord = { id: 7n, rating: 64, ratingBps: 6400 };

  return {
    db: {
      find: vi.fn(async (table: string) => {
        if (table === "content") return contentRecord;
        if (table === "round") return existingRound;
        return null;
      }),
      insert: vi.fn((table: string) => ({
        values: vi.fn(async (values: Record<string, unknown>) => {
          insertCalls.push({ table, values });
        }),
      })),
      update: vi.fn((table: string, key: Record<string, unknown>) => ({
        set: vi.fn(async (values: Record<string, unknown>) => {
          updateCalls.push({ table, key, values });
        }),
      })),
    },
    insertCalls,
    updateCalls,
  };
}

async function loadHandlers() {
  handlers.clear();
  await import("../src/RoundVotingEngine.js");
  return handlers;
}

afterEach(() => {
  handlers.clear();
  vi.resetModules();
  vi.clearAllMocks();
});

describe("RoundVotingEngine ponder handlers", () => {
  it("inserts per-round config snapshots before votes arrive", async () => {
    const { db, insertCalls } = createDb();
    const registeredHandlers = await loadHandlers();
    const handler = registeredHandlers.get("RoundVotingEngine:RoundConfigSnapshotted");

    expect(handler).toBeDefined();

    await handler!({
      event: {
        args: {
          contentId: 7n,
          roundId: 2n,
          epochDuration: 600,
          maxDuration: 7200,
          minVoters: 5,
          maxVoters: 50,
        },
        block: {
          number: 42n,
          timestamp: 999n,
        },
      },
      context: { db },
    });

    expect(insertCalls).toEqual([
      {
        table: "round",
        values: expect.objectContaining({
          id: "7-2",
          contentId: 7n,
          roundId: 2n,
          referenceRatingBps: 6400,
          epochDuration: 600,
          maxDuration: 7200,
          minVoters: 5,
          maxVoters: 50,
        }),
      },
    ]);
  });

  it("updates an existing round when the config snapshot arrives late", async () => {
    const { db, updateCalls } = createDb({ existingRound: { id: "7-2" } });
    const registeredHandlers = await loadHandlers();
    const handler = registeredHandlers.get("RoundVotingEngine:RoundConfigSnapshotted");

    expect(handler).toBeDefined();

    await handler!({
      event: {
        args: {
          contentId: 7n,
          roundId: 2n,
          epochDuration: 900,
          maxDuration: 10800,
          minVoters: 7,
          maxVoters: 70,
        },
        block: {
          number: 42n,
          timestamp: 999n,
        },
      },
      context: { db },
    });

    expect(updateCalls).toEqual([
      {
        table: "round",
        key: { id: "7-2" },
        values: {
          epochDuration: 900,
          maxDuration: 10800,
          minVoters: 7,
          maxVoters: 70,
        },
      },
    ]);
  });
});
