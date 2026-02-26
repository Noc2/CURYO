import { expect, test } from "../fixtures/wallet";

test.describe("Governance page", () => {
  test("page loads and shows tabs", async ({ connectedPage: page }) => {
    await page.goto("/governance");

    // Account #2 has cREP, so should see all tabs (not just Faucet)
    const leaderboardTab = page.getByRole("button", { name: "Leaderboard" });
    const profileTab = page.getByRole("button", { name: "Profile" });
    const voteTab = page.getByRole("button", { name: "Vote" });

    // At least one tab should be visible
    const anyTab = leaderboardTab.or(profileTab).or(voteTab);
    await expect(anyTab.first()).toBeVisible({ timeout: 15_000 });
  });

  test("leaderboard tab shows table", async ({ connectedPage: page }) => {
    await page.goto("/governance");

    // Click Leaderboard tab to ensure it's active
    const leaderboardTab = page.getByRole("button", { name: "Leaderboard" });
    await expect(leaderboardTab).toBeVisible({ timeout: 15_000 });
    await leaderboardTab.click();
    await page.waitForTimeout(2_000);

    // Leaderboard renders a table with Rank, User, cREP Balance columns
    const table = page.locator("table");
    await expect(table).toBeVisible({ timeout: 10_000 });

    // Should have column headers
    const rankHeader = page.getByRole("columnheader", { name: "Rank" });
    await expect(rankHeader).toBeVisible({ timeout: 5_000 });
  });

  test("profile tab shows form", async ({ connectedPage: page }) => {
    await page.goto("/governance");

    // Click Profile tab
    const profileTab = page.getByRole("button", { name: "Profile" });
    await expect(profileTab).toBeVisible({ timeout: 15_000 });
    await profileTab.click();
    await page.waitForTimeout(3_000);

    // Profile tab should show input fields or profile content
    const profileContent = page.locator("main").getByText(/display name|delegation|referral|profile/i);
    await expect(profileContent.first()).toBeVisible({ timeout: 10_000 });
  });

  test("vote tab shows governance content", async ({ connectedPage: page }) => {
    await page.goto("/governance");

    // Click Vote tab
    const voteTabBtn = page.getByRole("button", { name: "Vote" });
    await expect(voteTabBtn).toBeVisible({ timeout: 15_000 });
    await voteTabBtn.click();
    await page.waitForTimeout(3_000);

    // Vote tab shows TokenManagement, TreasuryBalance, PlatformProposals, etc.
    const voteContent = page.locator("main").getByText(/treasury|proposal|platform|delegate|token/i);
    await expect(voteContent.first()).toBeVisible({ timeout: 10_000 });
  });
});
