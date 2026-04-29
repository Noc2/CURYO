import { expect, test } from "../fixtures/wallet";
import { expectNoBlockingAccessibilityViolations } from "../helpers/a11y";
import { expectNoNextErrorOverlay } from "../helpers/layout";

const PUBLIC_PAGES = [
  { path: "/", heading: /AI Asks,\s*Humans Earn|Rate|Vote/i },
  { path: "/docs", heading: /^Introduction$/i },
  { path: "/legal", heading: /^Legal$/i },
  { path: "/legal/terms", heading: /Terms of Service/i },
];

test.describe("Axe accessibility regressions", () => {
  for (const { path, heading } of PUBLIC_PAGES) {
    test(`${path} has no blocking axe violations`, async ({ page }) => {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expectNoNextErrorOverlay(page);

      const main = page.locator("main");
      await expect(main).toBeVisible({ timeout: 15_000 });
      await expect(main.getByRole("heading", { name: heading }).or(main.getByText(heading)).first()).toBeVisible({
        timeout: 15_000,
      });

      await expectNoBlockingAccessibilityViolations(page, path);
    });
  }

  test("/ask connected form has no blocking axe violations", async ({ connectedPage: page }) => {
    await page.goto("/ask", { waitUntil: "domcontentloaded" });
    await expectNoNextErrorOverlay(page);

    const main = page.locator("main");
    await expect(main).toBeVisible({ timeout: 15_000 });
    await expect(main.getByPlaceholder(/paste/i).or(main.getByRole("textbox").first()).first()).toBeVisible({
      timeout: 15_000,
    });

    await expectNoBlockingAccessibilityViolations(page, "/ask");
  });
});
