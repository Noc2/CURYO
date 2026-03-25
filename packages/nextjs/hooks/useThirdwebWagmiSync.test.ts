import { getWagmiConnectorIdForThirdwebWallet, shouldSkipThirdwebWagmiSync } from "./useThirdwebWagmiSync";
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

test("getWagmiConnectorIdForThirdwebWallet routes external wallets through injected wagmi", () => {
  assert.equal(
    getWagmiConnectorIdForThirdwebWallet({
      id: "io.metamask",
    } as any),
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
