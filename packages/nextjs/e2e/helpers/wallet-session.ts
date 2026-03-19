import type { Page } from "@playwright/test";
import { CURYO_E2E_TEST_WALLET_PRIVATE_KEY_STORAGE_KEY } from "../../services/thirdweb/testWalletStorage";

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
function seedWalletSessionScript(privateKey: string): string {
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

    localStorage.setItem("${CURYO_E2E_TEST_WALLET_PRIVATE_KEY_STORAGE_KEY}", "${privateKey}");
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
export async function setupWallet(page: Page, privateKey: string): Promise<void> {
  await page.addInitScript(seedWalletSessionScript(privateKey));
}
