import { E2E_BASE_URL } from "../helpers/service-urls";
import { type Page, expect, test } from "@playwright/test";

async function gotoPath(page: Page, path: string): Promise<void> {
  await page.goto(new URL(path, E2E_BASE_URL).toString(), { waitUntil: "domcontentloaded" });
}

test.describe("Page smoke tests", () => {
  const legalSubpages = ["/legal/terms", "/legal/privacy", "/legal/imprint"];

  test("landing page loads", async ({ page }) => {
    await gotoPath(page, "/");
    // The page title should contain "Curyo" regardless of redirects
    await expect(page).toHaveTitle(/Curyo/i);

    // The landing page may redirect to /governance or /rate if a test wallet
    // session is already active. Either the hero section or a redirected page is acceptable.
    const heroHeading = page.getByRole("heading", { name: /AI asks,\s*Humans Earn/i }).first();
    const governancePage = page.getByRole("button", { name: /Profile|Leaderboard|Faucet/i }).first();
    const feedPage = page.getByRole("button", { name: /Vote up|Vote down/i }).first();

    const landingOrRedirect = heroHeading.or(governancePage).or(feedPage);
    await expect(landingOrRedirect.first()).toBeVisible({ timeout: 15_000 });
  });

  test("docs page renders documentation", async ({ page }) => {
    await gotoPath(page, "/docs");

    const introHeading = page.getByRole("heading", { name: /Introduction/i }).first();
    await expect(introHeading).toBeVisible({ timeout: 10_000 });

    const whatCuryoDoesHeading = page.getByRole("heading", { name: /What Curyo Does/i }).first();
    await expect(whatCuryoDoesHeading).toBeVisible({ timeout: 5_000 });

    const agentFeedback = page.getByText("AI asks, Humans Earn");
    await expect(agentFeedback).toBeVisible({ timeout: 5_000 });
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
