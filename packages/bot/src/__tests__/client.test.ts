import { afterEach, describe, expect, it, vi } from "vitest";
import type { BotIdentityConfig } from "../config.js";
import type { PrivateKeyAccount } from "viem/accounts";

type BotClientOptions = {
  keystoreAccount?: PrivateKeyAccount | null;
};

async function loadBotClient(options: BotClientOptions = {}) {
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
      rpcUrl: "https://rpc.example.com",
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

describe("bot client", () => {
  it("prefers a decrypted keystore account over the private key", async () => {
    const keystoreAccount = {
      address: "0x1111111111111111111111111111111111111111",
    } as PrivateKeyAccount;
    const identity: BotIdentityConfig = {
      keystoreAccount: "rate",
      keystorePassword: "secret",
      privateKey: `0x${"22".repeat(32)}`,
    };
    const clientModule = await loadBotClient({ keystoreAccount });

    expect(clientModule.getAccount(identity)).toBe(keystoreAccount);
    expect(clientModule.mocks.getKeystoreAccount).toHaveBeenCalledWith("rate", "secret");
    expect(clientModule.mocks.privateKeyToAccount).not.toHaveBeenCalled();
  });

  it("falls back to the provided private key", async () => {
    const privateKey = `0x${"33".repeat(32)}` as `0x${string}`;
    const identity: BotIdentityConfig = { privateKey };
    const clientModule = await loadBotClient();

    expect(clientModule.getAccount(identity)).toMatchObject({
      address: "0x9999999999999999999999999999999999999999",
      source: privateKey,
    });
    expect(clientModule.mocks.privateKeyToAccount).toHaveBeenCalledWith(privateKey);
  });

  it("throws when no wallet identity is configured", async () => {
    const clientModule = await loadBotClient();

    expect(() => clientModule.getAccount({})).toThrow(
      "No wallet configured. Set keystore account+password or private key in .env",
    );
  });

  it("builds a wallet client from the resolved account", async () => {
    const keystoreAccount = {
      address: "0x4444444444444444444444444444444444444444",
    } as PrivateKeyAccount;
    const identity: BotIdentityConfig = {
      keystoreAccount: "submit",
      keystorePassword: "secret",
    };
    const clientModule = await loadBotClient({ keystoreAccount });

    clientModule.getWalletClient(identity);

    expect(clientModule.mocks.createWalletClient).toHaveBeenCalledWith(
      expect.objectContaining({
        account: keystoreAccount,
      }),
    );
  });
});
