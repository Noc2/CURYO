import { E2E_BASE_URL } from "../helpers/service-urls";
import { expect, test, type Page } from "@playwright/test";

async function gotoPath(page: Page, path: string): Promise<void> {
  await page.goto(new URL(path, E2E_BASE_URL).toString(), { waitUntil: "domcontentloaded" });
}

test.describe("Page smoke tests", () => {
  const legalSubpages = ["/legal/terms", "/legal/privacy", "/legal/imprint"];

  test("landing page loads", async ({ page }) => {
    await gotoPath(page, "/");
    // The page title should contain "Curyo" regardless of redirects
    await expect(page).toHaveTitle(/Curyo/i);

    // The landing page may redirect to /governance or /vote if a test wallet
    // session is already active. Either the hero section or a redirected page is acceptable.
    const heroHeading = page.getByRole("heading", { name: /A Better Web/i }).first();
    const governancePage = page.getByRole("button", { name: /Profile|Leaderboard|Faucet/i }).first();
    const feedPage = page.getByRole("button", { name: /Vote up|Vote down/i }).first();

    const landingOrRedirect = heroHeading.or(governancePage).or(feedPage);
    await expect(landingOrRedirect.first()).toBeVisible({ timeout: 15_000 });
  });

  test("docs page renders documentation", async ({ page }) => {
    await gotoPath(page, "/docs");

    const introHeading = page.getByRole("heading", { name: /Introduction/i }).first();
    await expect(introHeading).toBeVisible({ timeout: 10_000 });

    const keyPrinciplesHeading = page.getByRole("heading", { name: /Key Principles/i }).first();
    await expect(keyPrinciplesHeading).toBeVisible({ timeout: 5_000 });

    const skinInGame = page.getByText("Skin in the Game");
    await expect(skinInGame).toBeVisible({ timeout: 5_000 });
  });

  test("legal page shows legal cards", async ({ page }) => {
    await gotoPath(page, "/legal");

    // Main heading
    const heading = page.getByRole("heading", { name: "Legal", level: 1 });
    await expect(heading).toBeVisible({ timeout: 10_000 });

    // Three legal document cards — use heading role to avoid matching footer links
    const termsHeading = page.getByRole("heading", { name: "Terms of Service" });
    await expect(termsHeading).toBeVisible({ timeout: 5_000 });

    const privacyHeading = page.getByRole("heading", { name: "Privacy Notice" });
    await expect(privacyHeading).toBeVisible({ timeout: 5_000 });

    const imprintHeading = page.getByRole("heading", { name: "Imprint" });
    await expect(imprintHeading).toBeVisible({ timeout: 5_000 });
  });

  test("blockexplorer shows search and transactions", async ({ page }) => {
    await gotoPath(page, "/blockexplorer");

    const localOnlyGuard = page.getByRole("heading", { name: "Local Block Explorer Only" });
    const searchInput = page.getByPlaceholder("Search by hash or address");

    if (await localOnlyGuard.isVisible().catch(() => false)) {
      await expect(page.getByRole("link", { name: "Celo Explorer" })).toBeVisible({ timeout: 10_000 });
      return;
    }

    await expect(searchInput).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("table")).toBeVisible({ timeout: 10_000 });
  });

  for (const subpage of legalSubpages) {
    test(`${subpage} loads without errors`, async ({ page }) => {
      await gotoPath(page, subpage);

      const mainContent = page.locator("main");
      await expect(mainContent).toBeVisible({ timeout: 10_000 });

      const errorOverlay = page.locator("nextjs-portal");
      const hasError = await errorOverlay.isVisible({ timeout: 1_000 }).catch(() => false);
      expect(hasError).toBe(false);
    });
  }
});
