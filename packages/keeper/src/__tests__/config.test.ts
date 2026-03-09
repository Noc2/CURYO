import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };
const VALID_ENV = {
  RPC_URL: "https://rpc.example.com",
  CHAIN_ID: "11142220",
  VOTING_ENGINE_ADDRESS: "0x1111111111111111111111111111111111111111",
  CONTENT_REGISTRY_ADDRESS: "0x2222222222222222222222222222222222222222",
  KEYSTORE_ACCOUNT: "keeper",
  KEYSTORE_PASSWORD: "secret",
};

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
    delete process.env[key];
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
});
