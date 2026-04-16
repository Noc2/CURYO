import { afterEach, describe, expect, it, vi } from "vitest";

type RegisteredHandler = (args: {
  event: {
    args: Record<string, unknown>;
    block: { timestamp: bigint };
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
}));

function createDb() {
  const upsertCalls: Array<{ table: string; values: Record<string, unknown>; update: Record<string, unknown> }> = [];

  return {
    db: {
      insert: vi.fn((table: string) => ({
        values: vi.fn((values: Record<string, unknown>) => ({
          onConflictDoUpdate: vi.fn(async (update: Record<string, unknown>) => {
            upsertCalls.push({ table, values, update });
          }),
        })),
      })),
    },
    upsertCalls,
  };
}

async function loadHandlers() {
  handlers.clear();
  await import("../src/CategoryRegistry.js");
  return handlers;
}

afterEach(() => {
  handlers.clear();
  vi.resetModules();
  vi.clearAllMocks();
});

describe("CategoryRegistry ponder handlers", () => {
  it("stores the CategoryAdded slug in the legacy domain column", async () => {
    const { db, upsertCalls } = createDb();

    const registeredHandlers = await loadHandlers();
    const handler = registeredHandlers.get("CategoryRegistry:CategoryAdded");

    expect(handler).toBeDefined();

    await handler!({
      event: {
        args: {
          categoryId: 1n,
          name: "Products",
          slug: "products",
        },
        block: {
          timestamp: 1_776_351_559n,
        },
      },
      context: { db },
    });

    expect(upsertCalls).toEqual([
      {
        table: "category",
        values: {
          id: 1n,
          name: "Products",
          domain: "products",
          createdAt: 1_776_351_559n,
          totalVotes: 0,
          totalContent: 0,
        },
        update: {
          name: "Products",
          domain: "products",
        },
      },
    ]);
  });
});
