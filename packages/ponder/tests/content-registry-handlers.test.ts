import { afterEach, describe, expect, it, vi } from "vitest";

type RegisteredHandler = (args: {
  event: {
    args: Record<string, unknown>;
    block: { number: bigint; timestamp: bigint };
  };
  context: Record<string, unknown>;
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
  category: "category",
  content: "content",
  globalStats: "globalStats",
  profile: "profile",
  ratingChange: "ratingChange",
  round: "round",
}));

vi.mock("@curyo/contracts/abis", () => ({
  ContentRegistryAbi: [],
}));

vi.mock("@curyo/contracts/protocol", () => ({
  ROUND_STATE: { Settled: 1 },
}));

function createDb(existingRound = { id: "1-2" }) {
  const updateCalls: Array<{ table: string; key: Record<string, unknown>; values: Record<string, unknown> }> = [];
  const insertCalls: Array<{ table: string; values: Record<string, unknown> }> = [];

  return {
    db: {
      find: vi.fn(async () => existingRound),
      insert: vi.fn((table: string) => ({
        values: vi.fn((values: Record<string, unknown>) => {
          insertCalls.push({ table, values });
          return {
            onConflictDoNothing: vi.fn(async () => undefined),
          };
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
  await import("../src/ContentRegistry.js");
  return handlers;
}

afterEach(() => {
  handlers.clear();
  vi.resetModules();
  vi.clearAllMocks();
});

describe("ContentRegistry ponder handlers", () => {
  it("does not create synthetic rating history rows for RatingUpdated display refreshes", async () => {
    const { db, insertCalls, updateCalls } = createDb();

    const registeredHandlers = await loadHandlers();
    const handler = registeredHandlers.get("ContentRegistry:RatingUpdated");

    expect(handler).toBeDefined();

    await handler!({
      event: {
        args: {
          contentId: 1n,
          newRating: 57,
          oldRating: 50,
        },
        block: {
          number: 42n,
          timestamp: 999n,
        },
      },
      context: {
        client: { readContract: vi.fn() },
        contracts: {
          ContentRegistry: {
            address: "0x000000000000000000000000000000000000c0de",
          },
        },
        db,
      },
    });

    expect(updateCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "content",
          values: expect.objectContaining({
            conservativeRatingBps: 5700,
            rating: 57,
            ratingBps: 5700,
          }),
        }),
      ]),
    );
    expect(insertCalls).toEqual([]);
  });

  it("loads lowSince from on-chain rating state for RatingStateUpdated events", async () => {
    const { db, insertCalls, updateCalls } = createDb();
    const readContract = vi.fn(async () => ({
      lowSince: 777n,
    }));

    const registeredHandlers = await loadHandlers();
    const handler = registeredHandlers.get("ContentRegistry:RatingStateUpdated");

    expect(handler).toBeDefined();

    await handler!({
      event: {
        args: {
          confidenceMass: 123n,
          conservativeRatingBps: 5200,
          contentId: 1n,
          effectiveEvidence: 456n,
          newRatingBps: 5700,
          oldRatingBps: 5000,
          referenceRatingBps: 5000,
          roundId: 2n,
          settledRounds: 3,
        },
        block: {
          number: 99n,
          timestamp: 888n,
        },
      },
      context: {
        client: { readContract },
        contracts: {
          ContentRegistry: {
            address: "0x000000000000000000000000000000000000c0de",
          },
        },
        db,
      },
    });

    expect(readContract).toHaveBeenCalledWith({
      abi: [],
      address: "0x000000000000000000000000000000000000c0de",
      args: [1n],
      functionName: "getRatingState",
    });

    expect(updateCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "content",
          values: expect.objectContaining({ ratingLowSince: 777n }),
        }),
        expect.objectContaining({
          table: "round",
          values: expect.objectContaining({ lowSince: 777n }),
        }),
      ]),
    );

    expect(insertCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "ratingChange",
          values: expect.objectContaining({ lowSince: 777n }),
        }),
      ]),
    );
  });
});
