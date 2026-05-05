import type { Page } from "@playwright/test";
import { E2E_RPC_URL } from "./service-urls";
import {
  CURYO_E2E_RPC_URL_STORAGE_KEY,
  CURYO_E2E_TEST_WALLET_PRIVATE_KEY_STORAGE_KEY,
} from "../../services/thirdweb/testWalletStorage";
import { WALLET_STATE_EXACT_KEYS, WALLET_STATE_PREFIXES } from "../../services/thirdweb/walletStateCleanup";

type WalletSessionStorageEntry = readonly [string, string];

function getWalletSessionStorageEntries(privateKey: string, rpcUrl: string): WalletSessionStorageEntry[] {
  return [
    [CURYO_E2E_TEST_WALLET_PRIVATE_KEY_STORAGE_KEY, privateKey],
    [CURYO_E2E_RPC_URL_STORAGE_KEY, rpcUrl],
    ["thirdweb:active-chain", JSON.stringify({ id: 31337 })],
    [
      "curyo_terms_accepted",
      JSON.stringify({
        version: "3.0",
        timestamp: Date.now(),
        termsAccepted: true,
        privacyAcknowledged: true,
      }),
    ],
    [
      "curyo_onboarding",
      JSON.stringify({
        firstVoteCompleted: true,
        guideShown: true,
      }),
    ],
  ];
}

/**
 * Build a script that pre-seeds localStorage for the localhost thirdweb test wallet flow.
 *
 * How it works:
 * 1. Clears stale thirdweb/wagmi wallet session data from earlier runs.
 * 2. Stores the target Anvil private key for the localhost-only thirdweb test bridge.
 * 3. Accepts terms + onboarding so the tests can focus on app behavior.
 *
 * Must run BEFORE any page navigation (via page.addInitScript).
 */
function seedWalletSessionScript(privateKey: string, rpcUrl: string): string {
  const storageEntries = getWalletSessionStorageEntries(privateKey, rpcUrl);

  return `
    const walletStateExactKeys = ${JSON.stringify(WALLET_STATE_EXACT_KEYS)};
    const walletStatePrefixes = ${JSON.stringify(WALLET_STATE_PREFIXES)};
    const walletSessionStorageEntries = ${JSON.stringify(storageEntries)};

    const clearWalletState = storage => {
      if (!storage) return;

      const keysToRemove = [];
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (!key) continue;
        if (walletStateExactKeys.includes(key) || walletStatePrefixes.some(prefix => key.startsWith(prefix))) {
          keysToRemove.push(key);
        }
      }

      for (const key of keysToRemove) {
        storage.removeItem(key);
      }
    };

    clearWalletState(localStorage);
    clearWalletState(sessionStorage);

    for (const [key, value] of walletSessionStorageEntries) {
      localStorage.setItem(key, value);
    }
  `;
}

/** Inject wallet session state into a page before navigation. */
export async function setupWallet(
  page: Page,
  privateKey: string,
  options: { bootstrap?: boolean } = {},
): Promise<void> {
  const { bootstrap = true } = options;
  await page.addInitScript(seedWalletSessionScript(privateKey, E2E_RPC_URL));

  if (bootstrap && page.url() === "about:blank") {
    await page.goto("/", { waitUntil: "domcontentloaded" });
  }
}

/** Replace the injected local wallet session after a page has already loaded. */
export async function swapWalletSession(page: Page, privateKey: string): Promise<void> {
  await page.evaluate(
    ({ exactKeys, prefixes, storageEntries }) => {
      const exactKeySet = new Set<string>(exactKeys);
      const clearWalletState = (storage: Storage | null) => {
        if (!storage) return;

        const keysToRemove: string[] = [];
        for (let index = 0; index < storage.length; index += 1) {
          const key = storage.key(index);
          if (!key) continue;
          if (exactKeySet.has(key) || prefixes.some(prefix => key.startsWith(prefix))) {
            keysToRemove.push(key);
          }
        }

        for (const key of keysToRemove) {
          storage.removeItem(key);
        }
      };

      clearWalletState(localStorage);
      clearWalletState(sessionStorage);

      for (const [key, value] of storageEntries) {
        localStorage.setItem(key, value);
      }
    },
    {
      exactKeys: [...WALLET_STATE_EXACT_KEYS],
      prefixes: [...WALLET_STATE_PREFIXES],
      storageEntries: getWalletSessionStorageEntries(privateKey, E2E_RPC_URL),
    },
  );
}
