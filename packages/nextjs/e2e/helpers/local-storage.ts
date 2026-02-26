import type { Page } from "@playwright/test";

/**
 * Build a script that pre-seeds localStorage for burner wallet auto-connect.
 *
 * How it works:
 * 1. burnerWallet.pk — burner-connector reads this to derive the wallet address.
 * 2. wagmi.recentConnectorId — wagmi's reconnect() tries this connector first.
 *    Must be wrapped in double-quotes to match wagmi's serialize() format.
 * 3. curyo_terms_accepted — bypasses the terms acceptance modal.
 *
 * Must run BEFORE any page navigation (via page.addInitScript).
 */
function seedWalletScript(privateKey: string): string {
  return `
    localStorage.setItem("burnerWallet.pk", "${privateKey}");
    localStorage.setItem("wagmi.recentConnectorId", '"burnerWallet"');
    localStorage.setItem("curyo_terms_accepted", JSON.stringify({
      version: "3.0",
      timestamp: Date.now(),
      termsAccepted: true,
      privacyAcknowledged: true,
    }));
  `;
}

/** Inject wallet state into a page before navigation. */
export async function setupWallet(page: Page, privateKey: string): Promise<void> {
  await page.addInitScript(seedWalletScript(privateKey));
}
