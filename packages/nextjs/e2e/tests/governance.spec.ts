import { expect, test } from "../fixtures/wallet";
import { ANVIL_ACCOUNTS } from "../helpers/anvil-accounts";

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

    await expect(page.getByRole("button", { name: "cREP" })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("button", { name: "Performance" })).toBeVisible({ timeout: 5_000 });

    const followingOnlyToggle = page.getByRole("button", { name: "Following Only" }).first();
    await expect(followingOnlyToggle).toBeVisible({ timeout: 5_000 });

    const profileLink = page.locator('a[href^="/profiles/0x"]').first();
    await expect(profileLink).toBeVisible({ timeout: 5_000 });
  });

  test("performance leaderboard exposes range and category filters", async ({ connectedPage: page }) => {
    await page.goto("/governance");

    const leaderboardTab = page.getByRole("button", { name: "Leaderboard" });
    await expect(leaderboardTab).toBeVisible({ timeout: 15_000 });
    await leaderboardTab.click();

    const performanceTab = page.getByRole("button", { name: "Performance" });
    await expect(performanceTab).toBeVisible({ timeout: 10_000 });
    await performanceTab.click();

    await expect(page.getByText("Performance leaderboard")).toBeVisible({ timeout: 10_000 });
    const followingOnlyToggle = page.getByRole("button", { name: "Following Only" }).first();
    await expect(followingOnlyToggle).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("combobox", { name: "Time range" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("combobox", { name: "Filter by category" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("combobox", { name: "Sort by" })).toBeVisible({ timeout: 10_000 });
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

  test("manage profile keeps the governance profile tab open", async ({ connectedPage: page }) => {
    await page.goto(`/profiles/${ANVIL_ACCOUNTS.account2.address}`);

    const manageProfileLink = page.getByRole("link", { name: "Manage profile" });
    await expect(manageProfileLink).toBeVisible({ timeout: 15_000 });
    await manageProfileLink.click();

    await expect(page).toHaveURL(/\/governance#profile$/);
    await expect(page.getByRole("heading", { name: /your profile|create profile/i })).toBeVisible({ timeout: 15_000 });
  });

  test("governance tab shows governance content", async ({ connectedPage: page }) => {
    await page.goto("/governance");

    // Click Governance tab (was previously "Vote", renamed in the tab UI)
    const governanceTabBtn = page.getByRole("button", { name: "Governance" });
    await expect(governanceTabBtn).toBeVisible({ timeout: 15_000 });
    await governanceTabBtn.click();

    // Governance tab shows TokenManagement, TreasuryBalance, PlatformProposals, etc.
    const govContent = page.locator("main").getByText(/treasury|proposal|platform|delegate|token/i);
    await expect(govContent.first()).toBeVisible({ timeout: 15_000 });
  });
});
