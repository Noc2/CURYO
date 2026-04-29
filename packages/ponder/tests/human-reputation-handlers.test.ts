import { getSharedDeploymentAddress } from "@curyo/contracts/deployments";
import { afterEach, describe, expect, it, vi } from "vitest";

type RegisteredHandler = (args: {
  event: {
    args: Record<string, unknown>;
    block: { number: bigint; timestamp: bigint };
    transaction: { hash: `0x${string}` };
    log: { logIndex: number };
  };
  context: Record<string, unknown>;
}) => Promise<void>;

const handlers = new Map<string, RegisteredHandler>();
const ORIGINAL_ENV = { ...process.env };

vi.mock("ponder:registry", () => ({
  ponder: {
    on: vi.fn((name: string, handler: RegisteredHandler) => {
      handlers.set(name, handler);
    }),
  },
}));

vi.mock("ponder:schema", () => ({
  tokenHolder: "tokenHolder",
  tokenTransfer: "tokenTransfer",
}));

function createDb() {
  const insertCalls: Array<{ table: string; values: Record<string, unknown> }> = [];

  return {
    db: {
      insert: vi.fn((table: string) => ({
        values: vi.fn((values: Record<string, unknown>) => {
          insertCalls.push({ table, values });
          return {
            onConflictDoNothing: vi.fn(async () => undefined),
          };
        }),
      })),
    },
    insertCalls,
  };
}

async function loadHandlers(overrides: Record<string, string | undefined> = {}) {
  handlers.clear();
  vi.resetModules();
  process.env = {
    ...ORIGINAL_ENV,
    ...overrides,
  };

  await import("../src/HumanReputation.js");
  return handlers;
}

async function runTransfer(to: `0x${string}`) {
  const { db, insertCalls } = createDb();
  const handler = handlers.get("HumanReputation:Transfer");

  expect(handler).toBeDefined();

  await handler!({
    event: {
      args: {
        from: "0x0000000000000000000000000000000000000001",
        to,
        value: 1n,
      },
      block: {
        number: 42n,
        timestamp: 999n,
      },
      transaction: {
        hash: "0xabc",
      },
      log: {
        logIndex: 1,
      },
    },
    context: { db },
  });

  return insertCalls;
}

afterEach(() => {
  handlers.clear();
  process.env = { ...ORIGINAL_ENV };
  vi.resetModules();
  vi.clearAllMocks();
});

describe("HumanReputation ponder handlers", () => {
  it("excludes shared deployment artifact addresses instead of stale PONDER address env values", async () => {
    const artifactAddress = getSharedDeploymentAddress(31337, "HumanReputation");
    const staleEnvAddress = "0x1111111111111111111111111111111111111111";
    const deployerAddress = "0x2222222222222222222222222222222222222222";

    expect(artifactAddress).toBeDefined();

    await loadHandlers({
      PONDER_NETWORK: "hardhat",
      PONDER_HREP_ADDRESS: staleEnvAddress,
      PONDER_DEPLOYER_ADDRESS: deployerAddress,
    });

    const artifactInsertCalls = await runTransfer(artifactAddress!);
    expect(artifactInsertCalls.filter(call => call.table === "tokenHolder")).toHaveLength(0);

    const deployerInsertCalls = await runTransfer(deployerAddress);
    expect(deployerInsertCalls.filter(call => call.table === "tokenHolder")).toHaveLength(0);

    const staleEnvInsertCalls = await runTransfer(staleEnvAddress);
    expect(staleEnvInsertCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "tokenHolder",
          values: expect.objectContaining({
            address: staleEnvAddress,
          }),
        }),
      ]),
    );
  });
});
