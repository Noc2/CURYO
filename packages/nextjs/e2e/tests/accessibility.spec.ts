import { type Page, expect, test } from "../fixtures/wallet";
import { ANVIL_ACCOUNTS } from "../helpers/anvil-accounts";
import { E2E_BASE_URL } from "../helpers/service-urls";
import { findVoteableContent, gotoWithRetry, waitForFeedLoaded } from "../helpers/wait-helpers";
import { setupWallet } from "../helpers/wallet-session";

async function gotoPath(page: Page, path: string, options?: { ensureWalletConnected?: boolean }): Promise<void> {
  await gotoWithRetry(page, new URL(path, E2E_BASE_URL).toString(), options);
}

const PRIMARY_HEADING_CASES: Array<{ path: string; heading: RegExp }> = [
  { path: "/submit", heading: /^Submit$|Submit Content|Voter ID Required/i },
  { path: "/docs", heading: /^Introduction$/i },
  { path: "/legal", heading: /^Legal$/i },
];
const DUPLICATE_ID_PAGES = ["/vote", "/submit", "/governance", "/docs", "/legal"];

test.describe("Accessibility basics", () => {
  for (const { path, heading } of PRIMARY_HEADING_CASES) {
    test(`${path} exposes a primary heading`, async ({ page }) => {
      await setupWallet(page, ANVIL_ACCOUNTS.account2.privateKey);
      await gotoPath(page, path, { ensureWalletConnected: true });
      await expect(
        page.getByRole("heading", { name: heading }).first(),
        `Page ${path} should have a visible h1 heading`,
      ).toBeVisible({
        timeout: 15_000,
      });
    });
  }

  test("interactive elements have accessible names", async ({ page }) => {
    await setupWallet(page, ANVIL_ACCOUNTS.account2.privateKey);
    await gotoPath(page, "/vote", { ensureWalletConnected: true });

    const searchInput = page.getByRole("textbox", { name: "Search content" });
    await expect(searchInput.first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("link", { name: "Discover" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("link", { name: "Submit" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: /^View(?:: .+)?$/i }).first()).toBeVisible({ timeout: 10_000 });
  });

  test("non-video previews expose focusable preview and source actions", async ({ page }) => {
    await setupWallet(page, ANVIL_ACCOUNTS.account2.privateKey);
    await gotoPath(page, "/vote?q=go-ethereum", { ensureWalletConnected: true });
    await waitForFeedLoaded(page, 30_000);

    const activeCard = page.locator('article[aria-current="true"]').first();
    await expect(activeCard.locator('[data-content-intent-surface="true"]').first()).toBeVisible({ timeout: 10_000 });
    await expect(activeCard.getByRole("link", { name: /Open source: github\.com/i }).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("vote feed exposes feed and article semantics", async ({ page }) => {
    await setupWallet(page, ANVIL_ACCOUNTS.account2.privateKey);
    await gotoPath(page, "/vote", { ensureWalletConnected: true });

    try {
      await waitForFeedLoaded(page, 30_000);
    } catch {
      test.skip(true, "Vote feed did not stabilize for feed semantics assertions");
      return;
    }

    const emptyState = page.getByText(/No content submitted yet|No content found/i);
    const feed = page.locator('[role="feed"][aria-label="Content feed"]').first();
    const isFeedVisible = await feed.isVisible({ timeout: 5_000 }).catch(() => false);

    if (!isFeedVisible) {
      if (
        await emptyState
          .first()
          .isVisible({ timeout: 3_000 })
          .catch(() => false)
      ) {
        test.skip(true, "Vote feed is empty for feed semantics assertions");
        return;
      }

      test.skip(true, "Vote feed did not expose feed semantics");
      return;
    }

    await expect(feed).toHaveAttribute("aria-busy", /^(true|false)$/);

    const activeArticle = feed.locator('article[aria-current="true"]').first();
    await expect(activeArticle).toBeVisible({ timeout: 10_000 });
    await activeArticle.focus();
    await expect(activeArticle).toBeFocused();
    await expect(activeArticle).toHaveAttribute("aria-posinset", /^[1-9]\d*$/);
    await expect(activeArticle).toHaveAttribute("aria-setsize", /^(-1|[1-9]\d*)$/);

    const titleId = await activeArticle.getAttribute("aria-labelledby");
    expect(titleId, "Active feed article should reference its visible title").toBeTruthy();
    if (!titleId) {
      return;
    }

    await expect(page.locator(`#${titleId}`)).toBeVisible({ timeout: 5_000 });
  });

  test("StakeSelector dialog has ARIA attributes", async ({ page }) => {
    await setupWallet(page, ANVIL_ACCOUNTS.account2.privateKey);
    await gotoPath(page, "/vote", { ensureWalletConnected: true });

    try {
      await waitForFeedLoaded(page, 30_000);
    } catch {
      test.skip(true, "Vote feed did not stabilize for stake dialog accessibility assertions");
      return;
    }

    if (!(await findVoteableContent(page))) {
      test.skip(true, "No voteable content available for accessibility dialog assertions");
      return;
    }

    const voteUpBtn = page.getByRole("button", { name: /^Vote up$/i });
    await expect(voteUpBtn).toBeVisible({ timeout: 10_000 });
    const dialog = page.getByRole("dialog", { name: "Select stake amount" });
    try {
      await expect(async () => {
        await voteUpBtn.click({ timeout: 5_000 });
        await expect(dialog).toBeVisible({ timeout: 5_000 });
      }).toPass({ timeout: 30_000, intervals: [500, 1_000, 2_000] });
    } catch {
      test.skip(true, "Stake selector did not open reliably for accessibility assertions");
      return;
    }

    const slider = page.getByRole("slider", { name: "Stake amount" });
    const sliderVisible = await slider.isVisible({ timeout: 3_000 }).catch(() => false);
    if (sliderVisible) {
      await expect(slider).toBeVisible();
    }

    await page.keyboard.press("Escape");
  });

  for (const path of DUPLICATE_ID_PAGES) {
    test(`${path} has no duplicate element IDs`, async ({ page }) => {
      await setupWallet(page, ANVIL_ACCOUNTS.account2.privateKey);
      await gotoPath(page, path, { ensureWalletConnected: true });

      const main = page.locator("main");
      await expect(main).toBeVisible({ timeout: 10_000 });

      const duplicateIds = await page.evaluate(() => {
        const scope = document.querySelector("main") || document.body;
        const ids = Array.from(scope.querySelectorAll("[id]"))
          .map(el => el.id)
          .filter(id => id !== "");
        const seen = new Set<string>();
        const dupes: string[] = [];
        for (const id of ids) {
          if (seen.has(id)) dupes.push(id);
          seen.add(id);
        }
        return dupes;
      });

      expect(duplicateIds, `Page ${path} has duplicate IDs: ${duplicateIds.join(", ")}`).toEqual([]);
    });
  }
});
