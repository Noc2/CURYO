import assert from "node:assert/strict";
import test from "node:test";
import {
  findTargetedInjectedProvider,
  getAvailableThirdwebExternalWalletIds,
} from "~~/services/web3/injectedWalletProviders";

test("findTargetedInjectedProvider prefers the matching provider from window.ethereum.providers", () => {
  const metamaskProvider = { isMetaMask: true };
  const coinbaseProvider = { isCoinbaseWallet: true };

  const provider = findTargetedInjectedProvider("com.coinbase.wallet", {
    ethereum: {
      providers: [metamaskProvider, coinbaseProvider],
    },
  });

  assert.equal(provider, coinbaseProvider);
});

test("findTargetedInjectedProvider excludes MetaMask-flavored wallets from the MetaMask connector", () => {
  const provider = findTargetedInjectedProvider("io.metamask", {
    ethereum: {
      providers: [{ isMetaMask: true, isBraveWallet: true }],
    },
  });

  assert.equal(provider, undefined);
});

test("getAvailableThirdwebExternalWalletIds only returns branded wallets that have matching injected providers", () => {
  assert.deepEqual(
    getAvailableThirdwebExternalWalletIds({
      ethereum: {
        providers: [{ isMetaMask: true }, { isRainbow: true }, { isCoinbaseWallet: false }],
      },
    }),
    ["io.metamask", "me.rainbow"],
  );
});
