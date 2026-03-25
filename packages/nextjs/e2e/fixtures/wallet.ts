import { ANVIL_ACCOUNTS } from "../helpers/anvil-accounts";
import { E2E_BASE_URL } from "../helpers/service-urls";
import { gotoWithRetry, waitForWalletConnected } from "../helpers/wait-helpers";
import { setupWallet } from "../helpers/wallet-session";
import { type Page, test as base, expect } from "@playwright/test";

type WalletFixtures = {
  /** A page with Account #2 connected through the localhost thirdweb test wallet bridge. */
  connectedPage: Page;
};

export const test = base.extend<WalletFixtures>({
  connectedPage: async ({ page }, use) => {
    await setupWallet(page, ANVIL_ACCOUNTS.account2.privateKey);
    await gotoWithRetry(page, new URL("/", E2E_BASE_URL).toString());
    await waitForWalletConnected(page);
    await use(page);
  },
});

export { expect };
export type { Page };
