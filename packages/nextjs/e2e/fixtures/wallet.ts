import { ANVIL_ACCOUNTS } from "../helpers/anvil-accounts";
import { setupWallet } from "../helpers/wallet-session";
import { type Page, test as base, expect } from "@playwright/test";

type WalletFixtures = {
  /** A page with Account #2 connected through the localhost thirdweb test wallet bridge. */
  connectedPage: Page;
};

export const test = base.extend<WalletFixtures>({
  connectedPage: async ({ page }, use) => {
    await setupWallet(page, ANVIL_ACCOUNTS.account2.privateKey);
    await use(page);
  },
});

export { expect };
export type { Page };
