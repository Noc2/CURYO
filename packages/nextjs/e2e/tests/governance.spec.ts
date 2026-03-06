import { expect, test } from "../fixtures/wallet";

test.describe("Governance page", () => {
  test("page loads and shows tabs", async ({ connectedPage: page }) => {
    await page.goto("/governance", { waitUntil: "domcontentloaded" });
    // Wait for main content to render before checking tabs
    await expect(page.locator("main")).toBeVisible({ timeout: 15_000 });

    // Account #2 has cREP, so should see all tabs (not just Faucet)
    const leaderboardTab = page.getByRole("button", { name: "Leaderboard" });
    const profileTab = page.getByRole("button", { name: "Profile" });
    const voteTab = page.getByRole("button", { name: "Vote" });

    // At least one tab should be visible (tabs render after wallet state loads)
    const anyTab = leaderboardTab.or(profileTab).or(voteTab);
    await expect(anyTab.first()).toBeVisible({ timeout: 30_000 });
  });

  test("leaderboard tab shows table", async ({ connectedPage: page }) => {
    await page.goto("/governance");

    // Click Leaderboard tab to ensure it's active
    const leaderboardTab = page.getByRole("button", { name: "Leaderboard" });
    await expect(leaderboardTab).toBeVisible({ timeout: 15_000 });
    await leaderboardTab.click();

    // Leaderboard renders a table with Rank, User, cREP Balance columns
    const table = page.locator("table");
    await expect(table).toBeVisible({ timeout: 15_000 });

    // Should have column headers
    const rankHeader = page.getByRole("columnheader", { name: "Rank" });
    await expect(rankHeader).toBeVisible({ timeout: 5_000 });

    const followingOnlyToggle = page.getByRole("button", { name: "Following Only" }).first();
    await expect(followingOnlyToggle).toBeVisible({ timeout: 5_000 });

    const profileLink = page.locator('a[href^="/profiles/0x"]').first();
    await expect(profileLink).toBeVisible({ timeout: 5_000 });
  });

  test("accuracy tab shows following-only filter", async ({ connectedPage: page }) => {
    await page.goto("/governance");

    const accuracyTab = page.getByRole("button", { name: "Accuracy" });
    await expect(accuracyTab).toBeVisible({ timeout: 15_000 });
    await accuracyTab.click();

    const followingOnlyToggle = page.getByRole("button", { name: "Following Only" }).first();
    await expect(followingOnlyToggle).toBeVisible({ timeout: 10_000 });
  });

  test("profile tab shows form", async ({ connectedPage: page }) => {
    await page.goto("/governance");

    // Click Profile tab
    const profileTab = page.getByRole("button", { name: "Profile" });
    await expect(profileTab).toBeVisible({ timeout: 15_000 });
    await profileTab.click();

    // Profile tab should show input fields or profile content
    const profileContent = page.locator("main").getByText(/display name|delegation|referral|profile/i);
    await expect(profileContent.first()).toBeVisible({ timeout: 15_000 });
  });

  test("vote tab shows governance content", async ({ connectedPage: page }) => {
    await page.goto("/governance");

    // Click Vote tab
    const voteTabBtn = page.getByRole("button", { name: "Vote" });
    await expect(voteTabBtn).toBeVisible({ timeout: 15_000 });
    await voteTabBtn.click();

    // Vote tab shows TokenManagement, TreasuryBalance, PlatformProposals, etc.
    const voteContent = page.locator("main").getByText(/treasury|proposal|platform|delegate|token/i);
    await expect(voteContent.first()).toBeVisible({ timeout: 15_000 });
  });
});
