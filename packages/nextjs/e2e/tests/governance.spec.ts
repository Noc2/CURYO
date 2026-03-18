import { expect, test } from "../fixtures/wallet";
import { ANVIL_ACCOUNTS } from "../helpers/anvil-accounts";

test.describe("Governance page", () => {
  test("page loads and shows tabs", async ({ connectedPage: page }) => {
    await page.goto("/governance", { waitUntil: "domcontentloaded" });
    // Wait for main content to render before checking tabs
    await expect(page.locator("main")).toBeVisible({ timeout: 15_000 });

    // Account #2 has cREP, so should see all tabs (not just Faucet)
    const leaderboardTab = page.getByRole("button", { name: "Leaderboard" });
    const accuracyTab = page.getByRole("button", { name: "Accuracy" });
    const governanceTab = page.getByRole("button", { name: "Governance" });

    // At least one tab should be visible (tabs render after wallet state loads)
    const anyTab = leaderboardTab.or(accuracyTab).or(governanceTab);
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

    await expect(page.getByText("cREP leaderboard")).toBeVisible({ timeout: 5_000 });

    const followingOnlyToggle = page.getByRole("button", { name: "Following Only" }).first();
    await expect(followingOnlyToggle).toBeVisible({ timeout: 5_000 });

    const profileLink = page.locator('a[href^="/profiles/0x"]').first();
    await expect(profileLink).toBeVisible({ timeout: 5_000 });
  });

  test("accuracy tab exposes ranking filters", async ({ connectedPage: page }) => {
    await page.goto("/governance");

    const accuracyTab = page.getByRole("button", { name: "Accuracy" });
    await expect(accuracyTab).toBeVisible({ timeout: 15_000 });
    await accuracyTab.click();

    await expect(page.getByText("Accuracy leaderboard")).toBeVisible({ timeout: 10_000 });
    const followingOnlyToggle = page.getByRole("button", { name: "Following Only" }).first();
    await expect(followingOnlyToggle).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("combobox", { name: "Time range" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("combobox", { name: "Filter by category" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("combobox", { name: "Sort by" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("combobox", { name: "Minimum votes" })).toBeVisible({ timeout: 10_000 });
  });

  test("manage profile opens settings", async ({ connectedPage: page }) => {
    await page.goto(`/profiles/${ANVIL_ACCOUNTS.account2.address}`);

    const manageProfileLink = page.getByRole("link", { name: "Manage profile" });
    await expect(manageProfileLink).toBeVisible({ timeout: 15_000 });
    await manageProfileLink.click();

    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByRole("heading", { name: /your profile|create profile/i })).toBeVisible({ timeout: 15_000 });
  });

  test("governance tab shows governance content", async ({ connectedPage: page }) => {
    await page.goto("/governance");

    // Click Governance tab (was previously "Vote", renamed in the tab UI)
    const governanceTabBtn = page.getByRole("button", { name: "Governance" });
    await expect(governanceTabBtn).toBeVisible({ timeout: 15_000 });
    await governanceTabBtn.click();

    // Governance tab shows treasury, proposal, platform, and related governance surfaces.
    const govContent = page.locator("main").getByText(/treasury|proposal|platform|delegate|token/i);
    await expect(govContent.first()).toBeVisible({ timeout: 15_000 });
  });
});
