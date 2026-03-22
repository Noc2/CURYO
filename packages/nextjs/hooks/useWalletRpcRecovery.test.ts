import { buildAddEthereumChainParameter, canRepairWalletRpc } from "./useWalletRpcRecovery";
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
