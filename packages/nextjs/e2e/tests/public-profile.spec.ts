import { ANVIL_ACCOUNTS } from "../helpers/anvil-accounts";
import { gotoWithRetry } from "../helpers/wait-helpers";
import { expect, test } from "@playwright/test";

test.describe("Public profiles", () => {
  async function openPublicProfile(page: Parameters<typeof gotoWithRetry>[0]) {
    await gotoWithRetry(page, `/profiles/${ANVIL_ACCOUNTS.account9.address}`);
    await page.waitForLoadState("networkidle");
  }

  test("public profile page renders without a connected wallet", async ({ page }) => {
    await openPublicProfile(page);

    // PublicProfileView renders the address, performance summary, recent questions, and recent votes sections.
    await expect(page.getByText(ANVIL_ACCOUNTS.account9.address.toLowerCase())).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Win rate/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Daily Streak\s+\d+/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/\b\d+\s+resolved\b/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Voting performance")).toBeVisible({ timeout: 15_000 });
    const recentSubmissions = page.getByText("Recent questions").or(page.getByText("No questions yet."));
    await expect(recentSubmissions.first()).toBeVisible({ timeout: 15_000 });

    const recentVotes = page.getByText("Recent votes").or(page.getByText("No recent votes yet."));
    await expect(recentVotes.first()).toBeVisible({ timeout: 15_000 });
  });

  test("profile avatar opens in a larger pop-up", async ({ page }) => {
    await openPublicProfile(page);

    const openAvatar = page.getByRole("button", { name: "Open profile avatar" });
    await expect(openAvatar).toBeVisible({ timeout: 15_000 });
    await openAvatar.click();

    const dialog = page.getByRole("dialog", { name: /profile avatar/i });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Close profile avatar" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });
});
