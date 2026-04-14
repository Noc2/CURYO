import {
  getThirdwebWagmiSyncOptions,
  getWagmiConnectorIdForThirdwebWallet,
  shouldSkipThirdwebWagmiSync,
} from "./useThirdwebWagmiSync";
import assert from "node:assert/strict";
import test from "node:test";

test("getWagmiConnectorIdForThirdwebWallet keeps in-app wallets on the in-app connector", () => {
  assert.equal(
    getWagmiConnectorIdForThirdwebWallet({
      id: "inApp",
    } as any),
    "in-app-wallet",
  );
});

test("getWagmiConnectorIdForThirdwebWallet keeps dedicated connector ids for matching injected wallets", () => {
  assert.equal(
    getWagmiConnectorIdForThirdwebWallet(
      {
        id: "io.metamask",
      } as any,
      {
        window: {
          ethereum: {
            providers: [{ isMetaMask: true }],
          },
        },
      },
    ),
    "io.metamask",
  );
  assert.equal(
    getWagmiConnectorIdForThirdwebWallet(
      {
        id: "com.coinbase.wallet",
      } as any,
      {
        window: {
          ethereum: {
            providers: [{ isCoinbaseWallet: true }],
          },
        },
      },
    ),
    "com.coinbase.wallet",
  );
  assert.equal(
    getWagmiConnectorIdForThirdwebWallet(
      {
        id: "me.rainbow",
      } as any,
      {
        window: {
          ethereum: {
            providers: [{ isRainbow: true }],
          },
        },
      },
    ),
    "me.rainbow",
  );
});

test("getWagmiConnectorIdForThirdwebWallet skips dedicated external connectors when the injected provider is unavailable", () => {
  assert.equal(
    getWagmiConnectorIdForThirdwebWallet(
      {
        id: "io.metamask",
      } as any,
      {
        window: {
          ethereum: {
            providers: [{ isCoinbaseWallet: true }],
          },
        },
      },
    ),
    null,
  );
});

test("getWagmiConnectorIdForThirdwebWallet falls back to the generic injected connector for unknown external wallets", () => {
  assert.equal(
    getWagmiConnectorIdForThirdwebWallet(
      {
        id: "walletConnect",
      } as any,
      {
        window: undefined,
      },
    ),
    "injected",
  );
});

test("shouldSkipThirdwebWagmiSync returns true when the requested thirdweb wallet is already connected", () => {
  assert.equal(
    shouldSkipThirdwebWagmiSync({
      connectorId: "in-app-wallet",
      currentAddress: "0xabcDEF0000000000000000000000000000000000",
      currentChainId: 11142220,
      currentConnectorId: "in-app-wallet",
      requestedAddress: "0xabcdef0000000000000000000000000000000000",
      requestedChainId: 11142220,
    }),
    true,
  );
});

test("shouldSkipThirdwebWagmiSync returns false for forced reconnects on the same wallet", () => {
  assert.equal(
    shouldSkipThirdwebWagmiSync({
      connectorId: "in-app-wallet",
      currentAddress: "0xabcDEF0000000000000000000000000000000000",
      currentChainId: 42220,
      currentConnectorId: "in-app-wallet",
      forceReconnect: true,
      requestedAddress: "0xabcdef0000000000000000000000000000000000",
      requestedChainId: 42220,
    }),
    false,
  );
});

test("shouldSkipThirdwebWagmiSync returns false when the requested chain differs", () => {
  assert.equal(
    shouldSkipThirdwebWagmiSync({
      connectorId: "in-app-wallet",
      currentAddress: "0xabcdef0000000000000000000000000000000000",
      currentChainId: 42220,
      currentConnectorId: "in-app-wallet",
      requestedAddress: "0xabcdef0000000000000000000000000000000000",
      requestedChainId: 11142220,
    }),
    false,
  );
});

test("getThirdwebWagmiSyncOptions treats auto-connect as a wagmi reconnect", () => {
  assert.deepEqual(
    getThirdwebWagmiSyncOptions({ id: "io.metamask" } as any, {
      source: "autoConnect",
    }),
    { reconnect: true },
  );
  assert.deepEqual(
    getThirdwebWagmiSyncOptions({ id: "inApp" } as any, {
      source: "autoConnect",
    }),
    { reconnect: true },
  );
});

test("getThirdwebWagmiSyncOptions keeps manual in-app wallet sync on the direct adapter path", () => {
  assert.equal(
    getThirdwebWagmiSyncOptions({ id: "inApp" } as any, {
      source: "manualConnect",
    }),
    undefined,
  );
});

test("getThirdwebWagmiSyncOptions treats manual targeted external wallet sync as a wagmi reconnect", () => {
  assert.deepEqual(
    getThirdwebWagmiSyncOptions({ id: "io.metamask" } as any, {
      source: "manualConnect",
    }),
    { reconnect: true },
  );
});

test("getThirdwebWagmiSyncOptions keeps manual unknown external wallet sync on the direct connect path", () => {
  assert.equal(
    getThirdwebWagmiSyncOptions({ id: "walletConnect" } as any, {
      source: "manualConnect",
    }),
    undefined,
  );
});
