import { ANVIL_ACCOUNTS } from "../helpers/anvil-accounts";
import { gotoWithRetry } from "../helpers/wait-helpers";
import { setupWallet } from "../helpers/wallet-session";
import { type Page, test as base, expect } from "@playwright/test";

type WalletFixtures = {
  /** A page with Account #2 connected through the localhost thirdweb test wallet bridge. */
  connectedPage: Page;
};

const CONNECTED_PAGE_SETUP_TIMEOUT_MS = 120_000;

export const test = base.extend<WalletFixtures>({
  connectedPage: async ({ page }, use, testInfo) => {
    if (testInfo.timeout < CONNECTED_PAGE_SETUP_TIMEOUT_MS) {
      testInfo.setTimeout(CONNECTED_PAGE_SETUP_TIMEOUT_MS);
    }

    await setupWallet(page, ANVIL_ACCOUNTS.account2.privateKey, { bootstrap: false });
    await gotoWithRetry(page, "/rate", { ensureWalletConnected: true });
    await use(page);
  },
});

export { expect };
export type { Page };
