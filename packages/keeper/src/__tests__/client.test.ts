import { afterEach, describe, expect, it, vi } from "vitest";
import type { PrivateKeyAccount } from "viem/accounts";

type KeeperClientOptions = {
  keystoreAccount?: PrivateKeyAccount | null;
  privateKey?: `0x${string}` | undefined;
};

async function loadKeeperClient(options: KeeperClientOptions = {}) {
  vi.resetModules();

  const createPublicClient = vi.fn(() => ({ kind: "public" }));
  const createWalletClient = vi.fn(() => ({ kind: "wallet" }));
  const defineChain = vi.fn(chain => chain);
  const http = vi.fn(url => ({ url }));
  const privateKeyToAccount = vi.fn(privateKey => ({
    address: "0x9999999999999999999999999999999999999999",
    source: privateKey,
  }));
  const getKeystoreAccount = vi.fn(() => options.keystoreAccount ?? null);

  vi.doMock("viem", () => ({
    createPublicClient,
    createWalletClient,
    defineChain,
    http,
  }));
  vi.doMock("viem/accounts", () => ({
    privateKeyToAccount,
  }));
  vi.doMock("../config.js", () => ({
    config: {
      chainId: 11142220,
      chainName: "Celo Sepolia",
      rpcUrl: "https://rpc.example.com",
      privateKey: options.privateKey,
    },
  }));
  vi.doMock("../keystore.js", () => ({
    getKeystoreAccount,
  }));

  const clientModule = await import("../client.js");
  return {
    ...clientModule,
    mocks: {
      createWalletClient,
      getKeystoreAccount,
      privateKeyToAccount,
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("keeper client", () => {
  it("prefers the keystore account when one is available", async () => {
    const keystoreAccount = {
      address: "0x1111111111111111111111111111111111111111",
    } as PrivateKeyAccount;
    const clientModule = await loadKeeperClient({
      keystoreAccount,
      privateKey: `0x${"22".repeat(32)}`,
    });

    expect(clientModule.getAccount()).toBe(keystoreAccount);
    expect(clientModule.mocks.getKeystoreAccount).toHaveBeenCalledOnce();
    expect(clientModule.mocks.privateKeyToAccount).not.toHaveBeenCalled();
  });

  it("falls back to the configured private key", async () => {
    const privateKey = `0x${"33".repeat(32)}` as `0x${string}`;
    const clientModule = await loadKeeperClient({ privateKey });

    expect(clientModule.getAccount()).toMatchObject({
      address: "0x9999999999999999999999999999999999999999",
      source: privateKey,
    });
    expect(clientModule.mocks.privateKeyToAccount).toHaveBeenCalledWith(privateKey);
  });

  it("throws when no wallet identity is configured", async () => {
    const clientModule = await loadKeeperClient();

    expect(() => clientModule.getAccount()).toThrow(
      "No wallet configured. Set KEYSTORE_ACCOUNT+KEYSTORE_PASSWORD or KEEPER_PRIVATE_KEY",
    );
  });

  it("builds the wallet client from the resolved account", async () => {
    const keystoreAccount = {
      address: "0x4444444444444444444444444444444444444444",
    } as PrivateKeyAccount;
    const clientModule = await loadKeeperClient({ keystoreAccount });

    clientModule.getWalletClient();

    expect(clientModule.mocks.createWalletClient).toHaveBeenCalledWith(
      expect.objectContaining({
        account: keystoreAccount,
      }),
    );
  });
});
