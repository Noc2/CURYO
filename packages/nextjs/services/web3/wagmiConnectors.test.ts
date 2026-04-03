import assert from "node:assert/strict";
import test from "node:test";
import {
  findInjectedProvider,
  isCoinbaseInjectedProvider,
  isDedicatedMetaMaskProvider,
  isRainbowInjectedProvider,
} from "~~/services/web3/wagmiConnectorTargets";

test("findInjectedProvider prefers a matching provider from ethereum.providers", () => {
  const metaMaskProvider = { isMetaMask: true };
  const coinbaseProvider = { isCoinbaseWallet: true };

  const selected = findInjectedProvider(
    {
      ethereum: {
        isMetaMask: true,
        providers: [coinbaseProvider, metaMaskProvider],
      },
    },
    isDedicatedMetaMaskProvider,
  );

  assert.equal(selected, metaMaskProvider);
});

test("isDedicatedMetaMaskProvider rejects wallets that spoof the MetaMask flag", () => {
  assert.equal(isDedicatedMetaMaskProvider({ isMetaMask: true }), true);
  assert.equal(isDedicatedMetaMaskProvider({ isMetaMask: true, isRabby: true }), false);
  assert.equal(isDedicatedMetaMaskProvider({ isMetaMask: true, isPhantom: true }), false);
});

test("findInjectedProvider falls back to the top-level ethereum provider when no nested provider matches", () => {
  const coinbaseProvider = { isCoinbaseWallet: true };
  const rainbowProvider = { isRainbow: true };

  assert.equal(
    findInjectedProvider(
      {
        ethereum: {
          ...coinbaseProvider,
          providers: [rainbowProvider],
        },
      },
      isCoinbaseInjectedProvider,
    ),
    coinbaseProvider,
  );
});

test("wallet-specific predicates stay aligned with dedicated connector routing", () => {
  assert.equal(isCoinbaseInjectedProvider({ isCoinbaseWallet: true }), true);
  assert.equal(isCoinbaseInjectedProvider({ isMetaMask: true }), false);
  assert.equal(isRainbowInjectedProvider({ isRainbow: true }), true);
  assert.equal(isRainbowInjectedProvider({ isCoinbaseWallet: true }), false);
});
