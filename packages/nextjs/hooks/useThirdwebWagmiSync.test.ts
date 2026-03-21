import { shouldSkipThirdwebWagmiSync } from "./useThirdwebWagmiSync";
import assert from "node:assert/strict";
import test from "node:test";

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
