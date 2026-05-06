import { afterEach, describe, expect, it, vi } from "vitest";

type RegisteredHandler = (args: {
  event: {
    args: Record<string, unknown>;
    block: { number: bigint; timestamp: bigint };
    log: { logIndex: number };
    transaction: { hash: `0x${string}` };
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
  humanFaucetClaim: "humanFaucetClaim",
  humanFaucetReferralReward: "humanFaucetReferralReward",
}));

function createDb() {
  const inserts: Array<{ table: string; values: Record<string, unknown> }> = [];

  const db = {
    insert: vi.fn((table: string) => ({
      values: vi.fn((values: Record<string, unknown>) => {
        inserts.push({ table, values });
        return {
          onConflictDoNothing: vi.fn(async () => undefined),
        };
      }),
    })),
  };

  return { db, inserts };
}

async function loadHandlers() {
  handlers.clear();
  await import("../src/HumanFaucet.js");
  return handlers;
}

afterEach(() => {
  handlers.clear();
  vi.resetModules();
  vi.clearAllMocks();
});

describe("HumanFaucet ponder handlers", () => {
  it("indexes successful faucet claims", async () => {
    const { db, inserts } = createDb();
    const registeredHandlers = await loadHandlers();
    const handler = registeredHandlers.get("HumanFaucet:TokensClaimed");

    expect(handler).toBeDefined();

    await handler!({
      event: {
        args: {
          amount: 10_000_000_000n,
          nullifier: 123n,
          user: "0x1111111111111111111111111111111111111111",
        },
        block: { number: 99n, timestamp: 1_772_000_000n },
        log: { logIndex: 4 },
        transaction: {
          hash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
      },
      context: { db },
    });

    expect(inserts).toEqual([
      {
        table: "humanFaucetClaim",
        values: {
          amount: 10_000_000_000n,
          blockNumber: 99n,
          claimedAt: 1_772_000_000n,
          id: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-4",
          logIndex: 4,
          nullifier: 123n,
          transactionHash:
            "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          user: "0x1111111111111111111111111111111111111111",
        },
      },
    ]);
  });

  it("indexes referral rewards separately from claims", async () => {
    const { db, inserts } = createDb();
    const registeredHandlers = await loadHandlers();
    const handler = registeredHandlers.get("HumanFaucet:ReferralRewardPaid");

    expect(handler).toBeDefined();

    await handler!({
      event: {
        args: {
          claimant: "0x2222222222222222222222222222222222222222",
          claimantBonus: 250_000_000n,
          referrer: "0x1111111111111111111111111111111111111111",
          referrerReward: 500_000_000n,
        },
        block: { number: 100n, timestamp: 1_772_000_010n },
        log: { logIndex: 3 },
        transaction: {
          hash: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        },
      },
      context: { db },
    });

    expect(inserts).toEqual([
      {
        table: "humanFaucetReferralReward",
        values: {
          blockNumber: 100n,
          claimant: "0x2222222222222222222222222222222222222222",
          claimantBonus: 250_000_000n,
          id: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb-3",
          logIndex: 3,
          paidAt: 1_772_000_010n,
          referrer: "0x1111111111111111111111111111111111111111",
          referrerReward: 500_000_000n,
          transactionHash:
            "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        },
      },
    ]);
  });
});
