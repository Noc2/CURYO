import deployedContracts from "@curyo/contracts/deployedContracts";
import { afterEach, describe, expect, it, vi } from "vitest";

const chain11142220 = (deployedContracts as Record<number, Record<string, { address: `0x${string}` }>>)[11142220];
const chain31337 = (deployedContracts as Record<number, Record<string, { address: `0x${string}` }>>)[31337];
const ORIGINAL_ENV = { ...process.env };
const VALID_ENV = {
  RPC_URL: "https://rpc.example.com",
  CHAIN_ID: "11142220",
  VOTING_ENGINE_ADDRESS: chain11142220?.RoundVotingEngine?.address ?? "0x1111111111111111111111111111111111111111",
  CONTENT_REGISTRY_ADDRESS: chain11142220?.ContentRegistry?.address ?? "0x2222222222222222222222222222222222222222",
  KEYSTORE_ACCOUNT: "keeper",
  KEYSTORE_PASSWORD: "secret",
};
const LOCAL_VOTING_ENGINE = chain31337?.RoundVotingEngine?.address ?? "0x0000000000000000000000000000000000000000";
const LOCAL_CONTENT_REGISTRY = chain31337?.ContentRegistry?.address ?? "0x0000000000000000000000000000000000000000";

async function loadKeeperConfig(
  overrides: Record<string, string | undefined> = {},
  removals: string[] = [],
) {
  vi.resetModules();
  process.env = {
    ...ORIGINAL_ENV,
    ...VALID_ENV,
    ...overrides,
  };

  for (const key of removals) {
    process.env[key] = "";
  }

  return import("../config.js");
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("keeper config", () => {
  it("infers the chain name from the configured chain id", async () => {
    const { config } = await loadKeeperConfig();

    expect(config.chainId).toBe(11142220);
    expect(config.chainName).toBe("Celo Sepolia");
    expect(config.cleanupBatchSize).toBe(25);
    expect(config.frontendFees.enabled).toBe(false);
  });

  it("accepts a private key when no keystore account is configured", async () => {
    const privateKey = `0x${"11".repeat(32)}`;
    const { config } = await loadKeeperConfig(
      {
        KEEPER_PRIVATE_KEY: privateKey,
      },
      ["KEYSTORE_ACCOUNT", "KEYSTORE_PASSWORD"],
    );

    expect(config.privateKey).toBe(privateKey);
    expect(config.keystoreAccount).toBeUndefined();
  });

  it("requires either a keystore account or private key", async () => {
    await expect(
      loadKeeperConfig({
        KEYSTORE_ACCOUNT: "",
        KEYSTORE_PASSWORD: "",
        KEEPER_PRIVATE_KEY: "",
      }),
    ).rejects.toThrow("KEYSTORE_ACCOUNT or KEEPER_PRIVATE_KEY is required");
  });

  it("rejects localhost RPC URLs in production", async () => {
    await expect(
      loadKeeperConfig({
        NODE_ENV: "production",
        RPC_URL: "http://localhost:8545",
      }),
    ).rejects.toThrow("RPC_URL must not point to localhost in production");
  });

  it("validates cleanup batch size as a positive integer", async () => {
    await expect(
      loadKeeperConfig({
        KEEPER_CLEANUP_BATCH_SIZE: "0",
      }),
    ).rejects.toThrow("KEEPER_CLEANUP_BATCH_SIZE must be a positive integer");
  });

  it("derives local contract addresses from shared deployment artifacts", async () => {
    const { config } = await loadKeeperConfig(
      {
        CHAIN_ID: "31337",
      },
      ["VOTING_ENGINE_ADDRESS", "CONTENT_REGISTRY_ADDRESS"],
    );

    expect(config.contracts.votingEngine).toBe(LOCAL_VOTING_ENGINE);
    expect(config.contracts.contentRegistry).toBe(LOCAL_CONTENT_REGISTRY);
  });

  it("ignores stale local contract env values in favor of shared deployment artifacts", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { config } = await loadKeeperConfig({
      CHAIN_ID: "31337",
      VOTING_ENGINE_ADDRESS: "0x196dBCBb54b8ec4958c959D8949EBFE87aC2Aaaf",
      CONTENT_REGISTRY_ADDRESS: "0x82Dc47734901ee7d4f4232f398752cB9Dd5dACcC",
    });

    expect(config.contracts.votingEngine).toBe(LOCAL_VOTING_ENGINE);
    expect(config.contracts.contentRegistry).toBe(LOCAL_CONTENT_REGISTRY);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Ignoring VOTING_ENGINE_ADDRESS"));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Ignoring CONTENT_REGISTRY_ADDRESS"));
  });

  it("still requires contract env values when no shared deployment artifact exists for the chain", async () => {
    await expect(
      loadKeeperConfig(
        {
          CHAIN_ID: "999999",
        },
        ["VOTING_ENGINE_ADDRESS", "CONTENT_REGISTRY_ADDRESS"],
      ),
    ).rejects.toThrow("VOTING_ENGINE_ADDRESS is required");
  });

  it("loads hosted frontend fee sweep settings from the environment", async () => {
    const { config } = await loadKeeperConfig({
      KEEPER_FRONTEND_FEE_ENABLED: "true",
      KEEPER_FRONTEND_ADDRESS: "0x7777777777777777777777777777777777777777",
      KEEPER_FRONTEND_FEE_LOOKBACK_ROUNDS: "12",
      KEEPER_FRONTEND_FEE_WITHDRAW: "false",
    });

    expect(config.frontendFees).toEqual(
      expect.objectContaining({
        enabled: true,
        frontendAddress: "0x7777777777777777777777777777777777777777",
        lookbackRounds: 12,
        withdrawEnabled: false,
        contracts: expect.objectContaining({
          roundRewardDistributor: expect.stringMatching(/^0x[0-9a-fA-F]{40}$/),
          frontendRegistry: expect.stringMatching(/^0x[0-9a-fA-F]{40}$/),
        }),
      }),
    );
  });

  it("rejects an invalid hosted frontend address", async () => {
    await expect(
      loadKeeperConfig({
        KEEPER_FRONTEND_ADDRESS: "not-an-address",
      }),
    ).rejects.toThrow("KEEPER_FRONTEND_ADDRESS must be a valid address");
  });
});
