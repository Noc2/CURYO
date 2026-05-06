import {
  addAndSwitchEthereumChain,
  buildAddEthereumChainParameter,
  canRepairWalletRpc,
  isUnknownWalletChainError,
} from "./useWalletRpcRecovery";
import assert from "node:assert/strict";
import test from "node:test";

test("canRepairWalletRpc only enables MetaMask wallets with a configured chain RPC", () => {
  assert.equal(
    canRepairWalletRpc({
      chain: {
        id: 42220,
        name: "Celo",
        nativeCurrency: {
          decimals: 18,
          name: "CELO",
          symbol: "CELO",
        },
        rpcUrls: {
          default: {
            http: ["https://forno.celo.org"],
          },
        },
      } as any,
      walletId: "io.metamask",
    }),
    true,
  );

  assert.equal(
    canRepairWalletRpc({
      chain: {
        id: 42220,
        name: "Celo",
        nativeCurrency: {
          decimals: 18,
          name: "CELO",
          symbol: "CELO",
        },
        rpcUrls: {
          default: {
            http: ["https://forno.celo.org"],
          },
        },
      } as any,
      walletId: "com.coinbase.wallet",
    }),
    false,
  );
});

test("buildAddEthereumChainParameter keeps preferred RPC and explorer URLs", () => {
  assert.deepEqual(
    buildAddEthereumChainParameter({
      blockExplorers: {
        default: {
          name: "Blockscout",
          url: "https://celoscan.io",
        },
      },
      id: 42220,
      name: "Celo",
      nativeCurrency: {
        decimals: 18,
        name: "CELO",
        symbol: "CELO",
      },
      rpcUrls: {
        default: {
          http: ["https://forno.celo.org"],
        },
      },
    } as any),
    {
      blockExplorerUrls: ["https://celoscan.io"],
      chainId: "0xa4ec",
      chainName: "Celo",
      nativeCurrency: {
        decimals: 18,
        name: "CELO",
        symbol: "CELO",
      },
      rpcUrls: ["https://forno.celo.org"],
    },
  );
});

test("isUnknownWalletChainError recognizes MetaMask unknown-chain shapes", () => {
  assert.equal(isUnknownWalletChainError({ code: 4902 }), true);
  assert.equal(isUnknownWalletChainError({ code: "4902" }), true);
  assert.equal(
    isUnknownWalletChainError({
      code: -32603,
      message:
        'MetaMask - RPC Error: Unrecognized chain ID "0xa4ec". Try adding the chain using wallet_addEthereumChain first.',
    }),
    true,
  );
  assert.equal(
    isUnknownWalletChainError({
      data: {
        originalError: {
          code: 4902,
        },
      },
    }),
    true,
  );
  assert.equal(
    isUnknownWalletChainError({
      cause: {
        details: 'Unrecognized chain ID "0xa4ec".',
      },
    }),
    true,
  );
  assert.equal(
    isUnknownWalletChainError({
      shortMessage: "Try adding the chain using wallet_addEthereumChain first.",
    }),
    true,
  );
  assert.equal(isUnknownWalletChainError({ code: 4001, message: "User rejected the request." }), false);
});

test("addAndSwitchEthereumChain adds the configured chain before switching", async () => {
  const requests: Array<{ method: string; params?: unknown[] }> = [];
  const provider = {
    request: async (request: { method: string; params?: unknown[] }) => {
      requests.push(request);
      return null;
    },
  };

  await addAndSwitchEthereumChain(provider, {
    blockExplorers: {
      default: {
        name: "Blockscout",
        url: "https://celoscan.io",
      },
    },
    id: 42220,
    name: "Celo",
    nativeCurrency: {
      decimals: 18,
      name: "CELO",
      symbol: "CELO",
    },
    rpcUrls: {
      default: {
        http: ["https://forno.celo.org"],
      },
    },
  } as any);

  assert.deepEqual(requests, [
    {
      method: "wallet_addEthereumChain",
      params: [
        {
          blockExplorerUrls: ["https://celoscan.io"],
          chainId: "0xa4ec",
          chainName: "Celo",
          nativeCurrency: {
            decimals: 18,
            name: "CELO",
            symbol: "CELO",
          },
          rpcUrls: ["https://forno.celo.org"],
        },
      ],
    },
    {
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0xa4ec" }],
    },
  ]);
});
