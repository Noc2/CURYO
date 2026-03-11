import { expect, test } from "../fixtures/wallet";
import { ANVIL_ACCOUNTS } from "../helpers/anvil-accounts";

test.describe("Public profile follow button", () => {
  test("connected user can toggle follow state from the public profile page", async ({ connectedPage: page }) => {
    await page.goto(`/profiles/${ANVIL_ACCOUNTS.account8.address}`);

    const button = page.getByRole("button", { name: /follow|following/i });
    await expect(button).toBeVisible({ timeout: 15_000 });

    const before = (await button.textContent())?.toLowerCase() ?? "";
    await button.click();

    if (before.includes("following")) {
      await expect(page.getByRole("button", { name: /follow/i })).toBeVisible({ timeout: 20_000 });
    } else {
      await expect(page.getByRole("button", { name: /following/i })).toBeVisible({ timeout: 20_000 });
    }
  });
});
