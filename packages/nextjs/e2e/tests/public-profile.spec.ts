import { ANVIL_ACCOUNTS } from "../helpers/anvil-accounts";
import { expect, test } from "@playwright/test";

test.describe("Public profiles", () => {
  test("public profile page renders without a connected wallet", async ({ page }) => {
    await page.goto(`/profiles/${ANVIL_ACCOUNTS.account9.address}`);

    await expect(page.getByText("Public profile")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(ANVIL_ACCOUNTS.account9.address.toLowerCase())).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Voting performance")).toBeVisible({ timeout: 15_000 });

    const recentVotes = page.getByText("Recent votes").or(page.getByText("No recent votes yet."));
    await expect(recentVotes.first()).toBeVisible({ timeout: 15_000 });
  });
});
