import { ANVIL_ACCOUNTS } from "../helpers/anvil-accounts";
import { expect, test } from "@playwright/test";

test.describe("Public profiles", () => {
  test("public profile page renders without a connected wallet", async ({ page }) => {
    await page.goto(`/profiles/${ANVIL_ACCOUNTS.account9.address}`);

    // PublicProfileView renders the address, curator summary, recent submissions, and recent votes sections.
    await expect(page.getByText(ANVIL_ACCOUNTS.account9.address.toLowerCase())).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Curator snapshot")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Voting performance")).toBeVisible({ timeout: 15_000 });
    const recentSubmissions = page.getByText("Recent submissions").or(page.getByText("No submissions yet."));
    await expect(recentSubmissions.first()).toBeVisible({ timeout: 15_000 });

    const recentVotes = page.getByText("Recent votes").or(page.getByText("No recent votes yet."));
    await expect(recentVotes.first()).toBeVisible({ timeout: 15_000 });
  });

  test("profile image opens in a larger pop-up", async ({ page }) => {
    await page.goto(`/profiles/${ANVIL_ACCOUNTS.account9.address}`);

    const openAvatar = page.getByRole("button", { name: "Open profile image" });
    await expect(openAvatar).toBeVisible({ timeout: 15_000 });
    await openAvatar.click();

    const dialog = page.getByRole("dialog", { name: /profile image/i });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Close profile image" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });
});
