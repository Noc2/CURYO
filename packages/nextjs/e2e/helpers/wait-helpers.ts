import type { Locator, Page } from "@playwright/test";
import { CURYO_E2E_TEST_WALLET_PRIVATE_KEY_STORAGE_KEY } from "../../services/thirdweb/testWalletStorage";

const RETRIABLE_GOTO_ERROR_PATTERNS = [
  /ERR_ABORTED/i,
  /ERR_CONNECTION_RESET/i,
  /ECONNRESET/i,
  /frame was detached/i,
  /Test timeout/i,
];

function isRetriableGotoError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return RETRIABLE_GOTO_ERROR_PATTERNS.some(pattern => pattern.test(message));
}

export function getVisibleAuthConnectButton(page: Page): Locator {
  return page.locator('[data-testid="auth-connect-button"]:visible');
}

export function getVisibleConnectedWallet(page: Page): Locator {
  return page.locator('[data-testid="wallet-connected"]:visible');
}

export async function waitForWalletConnected(page: Page, timeout = 20_000): Promise<void> {
  await getVisibleConnectedWallet(page).first().waitFor({ state: "visible", timeout });
}

async function hasInjectedLocalTestWallet(page: Page): Promise<boolean> {
  try {
    return await page.evaluate(
      storageKey => Boolean(window.localStorage.getItem(storageKey)),
      CURYO_E2E_TEST_WALLET_PRIVATE_KEY_STORAGE_KEY,
    );
  } catch {
    return false;
  }
}

export async function ensureInjectedWalletConnected(page: Page, timeout: number): Promise<void> {
  if (!(await hasInjectedLocalTestWallet(page))) {
    return;
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (page.isClosed()) {
      throw new Error("Page closed while waiting for injected wallet connection");
    }

    const connectedWallet = getVisibleConnectedWallet(page).first();
    if (await connectedWallet.isVisible().catch(() => false)) {
      return;
    }

    const connectButton = getVisibleAuthConnectButton(page).first();
    const signInVisible = await connectButton.isVisible().catch(() => false);
    if (!signInVisible) {
      await connectedWallet.waitFor({ state: "visible", timeout }).catch(() => undefined);
      if (await connectedWallet.isVisible().catch(() => false)) {
        return;
      }
    } else {
      await connectButton.click({ timeout: 5_000 }).catch(() => undefined);
      await connectedWallet.waitFor({ state: "visible", timeout: Math.min(timeout, 20_000) }).catch(() => undefined);
      if (await connectedWallet.isVisible().catch(() => false)) {
        return;
      }
    }

    if (attempt === 1) {
      break;
    }

    await page.reload({ waitUntil: "domcontentloaded", timeout });
  }

  await waitForWalletConnected(page, timeout);
}

export async function gotoWithRetry(
  page: Page,
  url: string,
  options: {
    attempts?: number;
    ensureWalletConnected?: boolean;
    timeout?: number;
    waitUntil?: "load" | "domcontentloaded" | "networkidle" | "commit";
  } = {},
): Promise<void> {
  const { attempts = 3, ensureWalletConnected = false, timeout = 30_000, waitUntil = "domcontentloaded" } = options;

  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await page.goto(url, { timeout, waitUntil });

      const runtimeErrorHeading = page.getByRole("heading", { name: /Application error/i });
      if (await runtimeErrorHeading.isVisible().catch(() => false)) {
        await page.reload({ timeout, waitUntil: "domcontentloaded" });
      }

      if (ensureWalletConnected || (await hasInjectedLocalTestWallet(page))) {
        await ensureInjectedWalletConnected(page, Math.min(timeout, 30_000));
      }

      return;
    } catch (error) {
      lastError = error;
      if (!isRetriableGotoError(error) || attempt === attempts - 1) {
        throw error;
      }

      if (page.isClosed()) {
        throw error;
      }

      try {
        await page.waitForTimeout(1_000 * (attempt + 1));
      } catch {
        if (page.isClosed()) {
          throw error;
        }
        throw error;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/**
 * Wait until the content feed has loaded — either content cards appear
 * or the "No content submitted yet" empty state shows.
 */
export async function waitForFeedLoaded(page: Page, timeout = 15_000): Promise<void> {
  const feedContent = () =>
    page
      .getByRole("button", { name: "Vote up" })
      .or(page.getByRole("button", { name: "Vote down" }))
      .or(page.getByText(/Voted (Up|Down)/i))
      .or(page.getByText("Your submission"))
      .or(page.getByText(/Cooldown/))
      .or(page.getByText("Round full"))
      .or(page.getByText("No content submitted yet"))
      .or(page.getByText(/No content found/i));
  const connectButton = getVisibleAuthConnectButton(page);

  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      if (await connectButton.first().isVisible().catch(() => false)) {
        await connectButton.first().waitFor({ state: "hidden", timeout: Math.min(timeout, 10_000) }).catch(() => undefined);
      }

      await feedContent().first().waitFor({ state: "visible", timeout });
      return;
    } catch (error) {
      lastError = error;

      const stillLoading = await page.getByText("Loading...").first().isVisible().catch(() => false);
      const connectPromptVisible = await connectButton.first().isVisible().catch(() => false);

      if (attempt === 1 || (!stillLoading && !connectPromptVisible)) {
        throw error;
      }

      if (page.isClosed()) {
        throw error;
      }

      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle").catch(() => undefined);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function waitForVisibleWithReload(
  page: Page,
  target: () => Locator,
  options: {
    attempts?: number;
    timeout?: number;
  } = {},
): Promise<void> {
  const { attempts = 2, timeout = 15_000 } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await target().first().waitFor({ state: "visible", timeout });
      return;
    } catch (error) {
      lastError = error;

      const connectPromptVisible = await getVisibleAuthConnectButton(page).first().isVisible().catch(() => false);
      const loadingVisible = await page.getByText("Loading...").first().isVisible().catch(() => false);

      if (attempt === attempts - 1 || (!connectPromptVisible && !loadingVisible)) {
        throw error;
      }

      if (page.isClosed()) {
        throw error;
      }

      await page.reload({ waitUntil: "domcontentloaded" });
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/**
 * Find voteable content by cycling through thumbnail grid items.
 * The default featured card may be the user's own content, so this clicks
 * through thumbnails until it finds one with a "Vote up" button.
 * Returns true if voteable content was found.
 */
export async function findVoteableContent(page: Page): Promise<boolean> {
  const voteBtn = page.getByRole("button", { name: "Vote up" });
  let canVote = await voteBtn
    .waitFor({ state: "visible", timeout: 5_000 })
    .then(() => true)
    .catch(() => false);

  if (!canVote) {
    const thumbnails = page.locator("[data-testid='content-thumbnail']");
    const thumbCount = await thumbnails.count();

    for (let i = 0; i < Math.min(thumbCount, 20); i++) {
      const thumb = thumbnails.nth(i);
      if (await thumb.isVisible().catch(() => false)) {
        await thumb.click();
        canVote = await voteBtn
          .waitFor({ state: "visible", timeout: 5_000 })
          .then(() => true)
          .catch(() => false);
        if (canVote) break;
      }
    }
  }

  return canVote;
}
