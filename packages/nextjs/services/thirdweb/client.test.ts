import assert from "node:assert/strict";
import test from "node:test";
import {
  createThirdwebInAppWallet,
  getThirdwebWalletIds,
  shouldIncludeThirdwebWalletAuthOption,
} from "~~/services/thirdweb/client";

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

test("shouldIncludeThirdwebWalletAuthOption uses wallet auth when no branded injected wallet is available", () => {
  assert.equal(shouldIncludeThirdwebWalletAuthOption({ ethereum: undefined }), true);
  assert.equal(shouldIncludeThirdwebWalletAuthOption({ ethereum: { providers: [{ isFrame: true }] } }), true);
  assert.equal(
    shouldIncludeThirdwebWalletAuthOption({
      ethereum: {
        providers: [{ isMetaMask: true }],
      },
    }),
    false,
  );
});

test("createThirdwebInAppWallet can hide wallet auth to avoid duplicate compact mobile wallet rows", () => {
  const wallet = createThirdwebInAppWallet(42220, { includeWalletAuthOption: false });
  const config = wallet.getConfig() as { auth?: { options?: string[] } };

  assert.deepEqual(config.auth?.options, ["google", "apple", "email", "passkey"]);
});
