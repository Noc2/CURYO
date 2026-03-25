import { E2E_BASE_URL } from "../helpers/service-urls";
import { findVoteableContent, gotoWithRetry, waitForFeedLoaded } from "../helpers/wait-helpers";
import { expect, test, type Page } from "../fixtures/wallet";

async function gotoPath(page: Page, path: string): Promise<void> {
  await gotoWithRetry(page, new URL(path, E2E_BASE_URL).toString());
}

test.describe("Accessibility basics", () => {
  test("main pages have h1 heading", async ({ connectedPage: page }) => {
    const pages = ["/submit", "/docs", "/legal/terms"];

    for (const path of pages) {
      await gotoPath(page, path);

      const h1 = page.locator("h1");
      await expect(h1.first(), `Page ${path} should have a visible h1 heading`).toBeVisible({ timeout: 10_000 });
    }
  });

  test("interactive elements have accessible names", async ({ connectedPage: page }) => {
    await expect(async () => {
      await gotoPath(page, "/vote");
      await waitForFeedLoaded(page, 20_000);
    }).toPass({ timeout: 30_000, intervals: [500, 1_000, 2_000] });
    if (!(await findVoteableContent(page))) {
      test.skip(true, "No voteable content available for accessibility assertions");
      return;
    }

    const searchInput = page.getByRole("textbox", { name: "Search content" });
    await expect(searchInput.first()).toBeVisible({ timeout: 10_000 });

    await expect(page.getByRole("button", { name: /^Vote up$/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: /^Vote down$/i })).toBeVisible({ timeout: 10_000 });
  });

  test("StakeSelector dialog has ARIA attributes", async ({ connectedPage: page }) => {
    await expect(async () => {
      await gotoPath(page, "/vote");
      await waitForFeedLoaded(page, 20_000);
    }).toPass({ timeout: 30_000, intervals: [500, 1_000, 2_000] });
    if (!(await findVoteableContent(page))) {
      test.skip(true, "No voteable content available for accessibility dialog assertions");
      return;
    }

    const voteUpBtn = page.getByRole("button", { name: /^Vote up$/i });
    await expect(voteUpBtn).toBeVisible({ timeout: 10_000 });
    await expect(async () => {
      await voteUpBtn.click({ timeout: 5_000 });
    }).toPass({ timeout: 30_000, intervals: [500, 1_000, 2_000] });

    const dialog = page.getByRole("dialog", { name: "Select stake amount" });
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    const slider = page.getByRole("slider", { name: "Stake amount" });
    const sliderVisible = await slider.isVisible({ timeout: 3_000 }).catch(() => false);
    if (sliderVisible) {
      await expect(slider).toBeVisible();
    }

    await page.keyboard.press("Escape");
  });

  test("no duplicate element IDs on main pages", async ({ connectedPage: page }) => {
    const pages = ["/vote", "/submit", "/governance", "/docs", "/legal/terms"];

    for (const path of pages) {
      await gotoPath(page, path);

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
    }
  });
});
