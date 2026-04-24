import { expect, type Page } from "@playwright/test";

const SEEDED_CATEGORY_NAMES = ["Media", "General", "Products", "Software"];
const SEEDED_SUBCATEGORY_NAMES = ["Images", "YouTube", "Education", "Entertainment", "Photography", "Culture"];

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function selectAskCategory(page: Page, categoryNames = SEEDED_CATEGORY_NAMES): Promise<boolean> {
  const form = page.locator("form").first();
  const categoryTrigger = form.getByText("Select a category...");
  const noCategories = form.getByText("No categories available");

  await expect(categoryTrigger.or(noCategories)).toBeVisible({ timeout: 10_000 });

  if (!(await categoryTrigger.isVisible().catch(() => false))) {
    return false;
  }

  await categoryTrigger.click();

  for (const categoryName of categoryNames) {
    const option = form
      .getByRole("button", { name: new RegExp(`^${escapeRegExp(categoryName)}$`, "i") })
      .first();
    if (await option.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await option.click();
      return true;
    }
  }

  return false;
}

export async function selectAskSubcategory(page: Page, subcategoryNames = SEEDED_SUBCATEGORY_NAMES): Promise<boolean> {
  const form = page.locator("form").first();
  const subcategoryList = form
    .locator("label", { hasText: /^Select Categories/ })
    .locator("xpath=following-sibling::div[1]");

  await expect(subcategoryList).toBeVisible({ timeout: 5_000 });

  for (const subcategoryName of subcategoryNames) {
    const button = subcategoryList
      .getByRole("button", { name: new RegExp(`^${escapeRegExp(subcategoryName)}$`, "i") })
      .first();
    if (await button.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await button.click();
      await expect(button).toHaveClass(/pill-active/, { timeout: 2_000 });
      return true;
    }
  }

  return false;
}

export async function continueToBountyStep(page: Page): Promise<void> {
  const continueButton = page.getByRole("button", { name: /^Continue to bounty$/i });
  await expect(continueButton).toBeVisible({ timeout: 5_000 });
  await expect(continueButton).toBeEnabled();
  await continueButton.click();
}

export async function selectBountyRewardAsset(page: Page, asset: "hrep" | "usdc"): Promise<void> {
  const buttonLabel = asset === "hrep" ? "HREP" : "USDC";
  const assetButton = page.getByRole("button", { name: new RegExp(`^${escapeRegExp(buttonLabel)}$`, "i") });

  await expect(assetButton).toBeVisible({ timeout: 5_000 });
  await assetButton.click();
  await expect(assetButton).toHaveAttribute("aria-pressed", "true");
}
