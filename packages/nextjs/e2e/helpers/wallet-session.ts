import type { Page } from "@playwright/test";
import { E2E_RPC_URL } from "./service-urls";
import {
  CURYO_E2E_RPC_URL_STORAGE_KEY,
  CURYO_E2E_TEST_WALLET_PRIVATE_KEY_STORAGE_KEY,
} from "../../services/thirdweb/testWalletStorage";

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
  return `
    const walletStatePrefixes = [
      "thirdweb:",
      "thirdwebEwsWallet",
      "thirdweb_guest_session_id_",
      "walletToken-",
      "a-",
      "wagmi.",
    ];

    const clearWalletState = storage => {
      if (!storage) return;

      const keysToRemove = [];
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (!key) continue;
        if (walletStatePrefixes.some(prefix => key.startsWith(prefix))) {
          keysToRemove.push(key);
        }
      }

      for (const key of keysToRemove) {
        storage.removeItem(key);
      }
    };

    clearWalletState(localStorage);
    clearWalletState(sessionStorage);

    localStorage.setItem("${CURYO_E2E_TEST_WALLET_PRIVATE_KEY_STORAGE_KEY}", ${JSON.stringify(privateKey)});
    localStorage.setItem("${CURYO_E2E_RPC_URL_STORAGE_KEY}", ${JSON.stringify(rpcUrl)});
    localStorage.setItem("thirdweb:active-chain", JSON.stringify({ id: 31337 }));
    localStorage.setItem("curyo_terms_accepted", JSON.stringify({
      version: "3.0",
      timestamp: Date.now(),
      termsAccepted: true,
      privacyAcknowledged: true,
    }));
    localStorage.setItem("curyo_onboarding", JSON.stringify({
      firstVoteCompleted: true,
      guideShown: true,
    }));
  `;
}

function buildWalletSessionResetScript(privateKey: string, rpcUrl: string): string {
  return `
    const walletStatePrefixes = [
      "thirdweb:",
      "thirdwebEwsWallet",
      "thirdweb_guest_session_id_",
      "walletToken-",
      "a-",
      "wagmi.",
    ];

    const clearWalletState = storage => {
      if (!storage) return;

      const keysToRemove = [];
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (!key) continue;
        if (walletStatePrefixes.some(prefix => key.startsWith(prefix))) {
          keysToRemove.push(key);
        }
      }

      for (const key of keysToRemove) {
        storage.removeItem(key);
      }
    };

    clearWalletState(localStorage);
    clearWalletState(sessionStorage);

    localStorage.setItem("${CURYO_E2E_TEST_WALLET_PRIVATE_KEY_STORAGE_KEY}", ${JSON.stringify(privateKey)});
    localStorage.setItem("${CURYO_E2E_RPC_URL_STORAGE_KEY}", ${JSON.stringify(rpcUrl)});
    localStorage.setItem("thirdweb:active-chain", JSON.stringify({ id: 31337 }));
    localStorage.setItem("curyo_terms_accepted", JSON.stringify({
      version: "3.0",
      timestamp: Date.now(),
      termsAccepted: true,
      privacyAcknowledged: true,
    }));
    localStorage.setItem("curyo_onboarding", JSON.stringify({
      firstVoteCompleted: true,
      guideShown: true,
    }));
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
  await page.evaluate(script => {
    window.eval(script);
  }, buildWalletSessionResetScript(privateKey, E2E_RPC_URL));
}
