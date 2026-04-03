import { afterEach, describe, expect, it, vi } from "vitest";
import type { BotIdentityConfig } from "../config.js";
import type { PrivateKeyAccount } from "viem/accounts";

type BotClientOptions = {
  keystoreAccount?: PrivateKeyAccount | null;
  contractCode?: Record<string, string | undefined>;
  rpcChainId?: number;
};

async function loadBotClient(options: BotClientOptions = {}) {
  vi.resetModules();

  const mockedPublicClient = {
    kind: "public",
    getChainId: vi.fn().mockResolvedValue(options.rpcChainId ?? 11142220),
    getCode: vi.fn(async ({ address }: { address: string }) => {
      return options.contractCode?.[address.toLowerCase()] ?? "0x1234";
    }),
  };
  const createPublicClient = vi.fn(() => mockedPublicClient);
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
      contracts: {
        categoryRegistry: "0x5555555555555555555555555555555555555555",
        contentRegistry: "0x2222222222222222222222222222222222222222",
        crepToken: "0x1111111111111111111111111111111111111111",
        voterIdNFT: "0x4444444444444444444444444444444444444444",
        votingEngine: "0x3333333333333333333333333333333333333333",
      },
    },
    getRequiredContractKeys: (role: "submit" | "rate") =>
      role === "submit"
        ? (["crepToken", "contentRegistry", "voterIdNFT"] as const)
        : (["crepToken", "votingEngine", "voterIdNFT"] as const),
  }));
  vi.doMock("../keystore.js", () => ({
    getKeystoreAccount,
  }));

  const clientModule = await import("../client.js");
  return {
    ...clientModule,
    mocks: {
      createWalletClient,
      mockedPublicClient,
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

  it("validates the configured RPC chain and deployed contracts", async () => {
    const clientModule = await loadBotClient();

    await expect(clientModule.validateBotConnectivity("submit")).resolves.toBeUndefined();
    expect(clientModule.mocks.mockedPublicClient.getChainId).toHaveBeenCalledOnce();
    expect(clientModule.mocks.mockedPublicClient.getCode).toHaveBeenCalledTimes(3);
  });

  it("rejects an RPC endpoint on the wrong chain", async () => {
    const clientModule = await loadBotClient({ rpcChainId: 42220 });

    await expect(clientModule.validateBotConnectivity("submit")).rejects.toThrow(
      "RPC_URL reports chain ID 42220, but CHAIN_ID is 11142220.",
    );
  });

  it("rejects configured contracts that have no bytecode", async () => {
    const clientModule = await loadBotClient({
      contractCode: {
        ["0x3333333333333333333333333333333333333333"]: "0x",
      },
    });

    await expect(clientModule.validateBotConnectivity("rate")).rejects.toThrow(
      "RoundVotingEngine has no bytecode at 0x3333333333333333333333333333333333333333.",
    );
  });

  it("skips vote-only contract checks during submit connectivity validation", async () => {
    const clientModule = await loadBotClient({
      contractCode: {
        ["0x3333333333333333333333333333333333333333"]: "0x",
      },
    });

    await expect(clientModule.validateBotConnectivity("submit")).resolves.toBeUndefined();
  });
});
