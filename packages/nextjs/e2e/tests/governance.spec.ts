import { expect, test } from "../fixtures/wallet";
import { ANVIL_ACCOUNTS } from "../helpers/anvil-accounts";
import { newE2EContext } from "../helpers/browser-context";
import { setupWallet } from "../helpers/wallet-session";

test.describe("Governance page", () => {
  test("page loads and shows tabs", async ({ connectedPage: page }) => {
    await page.goto("/governance", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/governance(?:#.*)?$/);
    // Wait for main content to render before checking tabs
    await expect(page.locator("main")).toBeVisible({ timeout: 15_000 });

    // Account #2 has cREP, so should see all tabs (not just Faucet)
    const profileTab = page.getByRole("button", { name: "Profile", exact: true });
    const leaderboardTab = page.getByRole("button", { name: "Leaderboard" });
    const governanceTab = page.getByRole("button", { name: "Governance" });

    // At least one tab should be visible (tabs render after wallet state loads)
    const anyTab = profileTab.or(leaderboardTab).or(governanceTab);
    await expect(anyTab.first()).toBeVisible({ timeout: 30_000 });
    await expect(profileTab).toHaveClass(/pill-active/, { timeout: 10_000 });
  });

  test("leaderboard tab shows ranking filters", async ({ connectedPage: page }) => {
    await page.goto("/governance");

    const leaderboardTab = page.getByRole("button", { name: "Leaderboard" });
    await expect(leaderboardTab).toBeVisible({ timeout: 15_000 });
    await leaderboardTab.click();

    await expect(page.getByText("Leaderboard")).toBeVisible({ timeout: 10_000 });
    const followingOnlyToggle = page.getByRole("button", { name: "Following Only" }).first();
    await expect(followingOnlyToggle).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("combobox", { name: "Time range" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("combobox", { name: "Filter by category" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("combobox", { name: "Sort by" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("combobox", { name: "Minimum votes" })).toBeVisible({ timeout: 10_000 });
  });

  test("profile tab stays read-only until edit is clicked", async ({ browser }) => {
    const context = await newE2EContext(browser);
    const page = await context.newPage();

    await setupWallet(page, ANVIL_ACCOUNTS.account10.privateKey);
    await page.goto("/governance#profile");

    const editProfileButton = page.getByRole("button", { name: "Edit profile", exact: true });
    await expect(editProfileButton).toBeVisible({ timeout: 15_000 });
    await expect(page.getByLabel("Profile name")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Cancel", exact: true })).toHaveCount(0);

    await editProfileButton.click();
    await expect(page.getByLabel("Profile name")).toBeVisible({ timeout: 10_000 });

    await context.close();
  });

  test("own public profile is editable directly", async ({ connectedPage: page }) => {
    await page.goto(`/profiles/${ANVIL_ACCOUNTS.account2.address}`);

    const profileEditorEntry = page
      .getByRole("button", { name: "Edit profile", exact: true })
      .or(page.getByLabel("Profile name"))
      .or(page.getByRole("link", { name: "Get Voter ID", exact: true }));
    await expect(profileEditorEntry.first()).toBeVisible({ timeout: 15_000 });

    const editProfileButton = page.getByRole("button", { name: "Edit profile", exact: true });
    if (await editProfileButton.isVisible()) {
      await editProfileButton.click();
      await expect(page.getByLabel("Profile name")).toBeVisible({ timeout: 10_000 });
    }
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
