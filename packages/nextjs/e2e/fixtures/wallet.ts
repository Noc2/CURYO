import { ANVIL_ACCOUNTS } from "../helpers/anvil-accounts";
import { setupWallet } from "../helpers/local-storage";
import { type Browser, type BrowserContext, type Page, test as base, expect } from "@playwright/test";

type WalletFixtures = {
  /** A page with Account #2 burner wallet pre-connected (1000 cREP + VoterID). */
  connectedPage: Page;
};

export const test = base.extend<WalletFixtures>({
  connectedPage: async ({ page }, use) => {
    await setupWallet(page, ANVIL_ACCOUNTS.account2.privateKey);
    await use(page);
  },
});

/**
 * Open a new browser context connected as the given Anvil account.
 * Caller is responsible for closing the context when done.
 */
export async function connectAs(
  browser: Browser,
  accountKey: keyof typeof ANVIL_ACCOUNTS,
): Promise<{ page: Page; context: BrowserContext }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await setupWallet(page, ANVIL_ACCOUNTS[accountKey].privateKey);
  return { page, context };
}

export { expect };
