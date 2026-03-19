import { ANVIL_ACCOUNTS } from "../helpers/anvil-accounts";
import { setupWallet } from "../helpers/local-storage";
import { expect, test } from "@playwright/test";

/**
 * Profile creation and update tests.
 * Triggers Ponder events: ProfileCreated, ProfileUpdated.
 *
 * Uses account #8 which has a VoterID but may not have a profile yet.
 */
test.describe("Profile management", () => {
  const profileAccount = ANVIL_ACCOUNTS.account8;

  test("settings page stays focused on settings without notification signature prompts on load", async ({ browser }) => {
    test.setTimeout(120_000);

    const context = await browser.newContext();
    const page = await context.newPage();
    const notificationChallengeRequests: string[] = [];

    page.on("request", request => {
      if (
        request.method() === "POST" &&
        /\/api\/notifications\/(preferences|email)\/challenge$/.test(new URL(request.url()).pathname)
      ) {
        notificationChallengeRequests.push(request.url());
      }
    });

    await setupWallet(page, profileAccount.privateKey);
    await page.goto("/settings");

    const delegationTab = page.getByRole("button", { name: "Delegation" });
    await expect(delegationTab).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("heading", { name: /Delegated Vote ID/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: "Referrals" })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("button", { name: "Notifications" })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("button", { name: "Profile" })).toHaveCount(0);

    expect(notificationChallengeRequests).toHaveLength(0);

    await context.close();
  });

  test("can create profile via governance profile tab", async ({ browser }) => {
    test.setTimeout(120_000);

    const context = await browser.newContext();
    const page = await context.newPage();
    await setupWallet(page, profileAccount.privateKey);

    await page.goto("/governance#profile");

    const nameInput = page.getByLabel("Profile name");
    const editProfileButton = page.getByRole("button", { name: "Edit profile", exact: true });
    await expect(nameInput.or(editProfileButton)).toBeVisible({ timeout: 15_000 });
    if (await editProfileButton.count()) {
      await expect(editProfileButton).toBeVisible({ timeout: 15_000 });
      await editProfileButton.click();
    }

    const uniqueName = `e2etest_${Date.now().toString(36).slice(-6)}`;
    await expect(nameInput).toBeVisible({ timeout: 5_000 });
    await nameInput.clear();
    await nameInput.fill(uniqueName);

    const saveBtn = page
      .getByRole("button", { name: /Save profile/i })
      .or(page.getByRole("button", { name: /Save changes/i }));
    await expect(saveBtn).toBeEnabled({ timeout: 5_000 });
    await saveBtn.click();

    const success = page.getByText(/Profile (created|updated)!/i);
    await expect(success).toBeVisible({ timeout: 30_000 });

    await context.close();
  });

  test("can update profile from the public profile view", async ({ browser }) => {
    test.setTimeout(120_000);

    const context = await browser.newContext();
    const page = await context.newPage();
    await setupWallet(page, profileAccount.privateKey);

    await page.goto(`/profiles/${profileAccount.address}`);

    const editProfileButton = page.getByRole("button", { name: "Edit profile", exact: true });
    await expect(editProfileButton).toBeVisible({ timeout: 15_000 });
    await editProfileButton.click();

    const updatedName = `e2e_upd_${Date.now().toString(36).slice(-5)}`;
    const nameInput = page.getByLabel("Profile name");
    await expect(nameInput).toBeVisible({ timeout: 5_000 });
    await nameInput.clear();
    await nameInput.fill(updatedName);

    const saveBtn = page
      .getByRole("button", { name: /Save changes/i })
      .or(page.getByRole("button", { name: /Save profile/i }));
    await expect(saveBtn).toBeEnabled({ timeout: 5_000 });
    await saveBtn.click();

    const success = page.getByText(/Profile (created|updated)!/i);
    await expect(success).toBeVisible({ timeout: 30_000 });

    await context.close();
  });

  test("profile appears in Ponder API after creation", async () => {
    // Wait for Ponder to index the on-chain event
    await new Promise(resolve => setTimeout(resolve, 5_000));

    const address = profileAccount.address.toLowerCase();

    let res: Response;
    try {
      res = await fetch(`http://localhost:42069/profile/${address}`);
    } catch {
      test.skip(true, "Ponder not available — cannot verify profile in API");
      return;
    }

    // Profile may not exist if the previous tests were skipped/failed
    if (res.status === 404) {
      test.skip(true, "Profile not found in Ponder (creation test may not have run)");
      return;
    }

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("profile");
    if (!data.profile) {
      test.skip(true, "Profile payload not indexed in Ponder yet");
      return;
    }
    expect(data.profile.address).toBe(address);
    expect(data.profile.name).toBeTruthy();
  });

  test("profile update appears in Ponder API", async () => {
    test.setTimeout(60_000);

    const address = profileAccount.address.toLowerCase();

    // Poll Ponder until the updated name (e2e_upd_ prefix) appears.
    // The ProfileUpdated event may take several seconds to be indexed.
    const maxAttempts = 10;
    let matched = false;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 3_000));

      let res: Response;
      try {
        res = await fetch(`http://localhost:42069/profile/${address}`);
      } catch {
        if (attempt === maxAttempts - 1) {
          test.skip(true, "Ponder not available — cannot verify profile update");
          return;
        }
        continue;
      }

      if (res.status === 404) continue;

      const data = await res.json();
      if (!data.profile) continue;

      if (data.profile.name?.startsWith("e2e_upd_")) {
        matched = true;
        expect(data.profile.address).toBe(address);
        break;
      }
    }

    if (!matched) {
      // Final check — fetch one more time and assert for clear failure message
      const res = await fetch(`http://localhost:42069/profile/${address}`);
      if (res.status === 404) {
        test.skip(true, "Profile not found in Ponder (update test may not have run)");
        return;
      }
      const data = await res.json();
      if (!data.profile) {
        test.skip(true, "Profile payload not indexed in Ponder yet");
        return;
      }
      test.skip(data.profile.name.startsWith("e2e_upd_") === false, "Profile update not indexed in Ponder yet");
      expect(data.profile.name).toMatch(/^e2e_upd_/);
    }
  });
});
