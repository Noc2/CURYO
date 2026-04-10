import assert from "node:assert/strict";
import test from "node:test";
import {
  createThirdwebInAppWallet,
  getThirdwebWalletIds,
  getThirdwebWallets,
  shouldIncludeThirdwebWalletAuthOption,
} from "~~/services/thirdweb/client";

function getInAppWalletAuthOptions(wallets: ReturnType<typeof getThirdwebWallets>) {
  const inAppWallet = wallets.find(wallet => wallet.id === "inApp");
  const config = inAppWallet?.getConfig() as { auth?: { options?: string[] } } | undefined;

  return config?.auth?.options;
}

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

test("getThirdwebWallets keeps wallet auth inside in-app wallet when no branded injected wallet exists", () => {
  const wallets = getThirdwebWallets(42220, {
    ethereum: {
      providers: [{ isFrame: true }],
    },
  });

  assert.deepEqual(
    wallets.map(wallet => wallet.id),
    ["inApp"],
  );
  assert.deepEqual(getInAppWalletAuthOptions(wallets), ["google", "apple", "email", "passkey", "wallet"]);
});

test("getThirdwebWallets omits in-app wallet auth when a branded injected wallet is listed separately", () => {
  const wallets = getThirdwebWallets(42220, {
    ethereum: {
      providers: [{ isMetaMask: true }],
    },
  });

  assert.deepEqual(
    wallets.map(wallet => wallet.id),
    ["inApp", "io.metamask"],
  );
  assert.deepEqual(getInAppWalletAuthOptions(wallets), ["google", "apple", "email", "passkey"]);
});
