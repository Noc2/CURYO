import assert from "node:assert/strict";
import test from "node:test";
import { getThirdwebWalletIds } from "~~/services/thirdweb/client";

test("getThirdwebWalletIds only exposes branded external wallets when matching injected providers exist", () => {
  assert.deepEqual(
    getThirdwebWalletIds({
      ethereum: {
        providers: [{ isMetaMask: true }, { isCoinbaseWallet: true }],
      },
    }),
    ["inApp", "io.metamask", "com.coinbase.wallet"],
  );
});

test("getThirdwebWalletIds keeps the modal on the in-app wallet when no branded injected providers are present", () => {
  assert.deepEqual(getThirdwebWalletIds({ ethereum: undefined }), ["inApp"]);
});
