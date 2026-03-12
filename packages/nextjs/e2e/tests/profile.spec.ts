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

  test("settings page shows an account overview without notification signature prompts on load", async ({ browser }) => {
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

    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Account Overview")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(profileAccount.address)).toBeVisible({ timeout: 5_000 });

    const delegationShortcut = page.getByRole("button", { name: "Open delegation settings" });
    await expect(delegationShortcut).toBeVisible({ timeout: 5_000 });
    await delegationShortcut.click();

    await expect(page).toHaveURL(/\/settings\?tab=delegation$/);
    await expect(page.getByRole("heading", { name: /Delegated Vote ID/i })).toBeVisible({ timeout: 10_000 });

    expect(notificationChallengeRequests).toHaveLength(0);

    await context.close();
  });

  test("can create profile via settings page", async ({ browser }) => {
    test.setTimeout(120_000);

    const context = await browser.newContext();
    const page = await context.newPage();
    await setupWallet(page, profileAccount.privateKey);

    await page.goto("/settings");

    // Wait for the profile form to load
    const profileHeading = page
      .getByRole("heading", { name: /Create Profile/i })
      .or(page.getByRole("heading", { name: /Your Profile/i }));
    await expect(profileHeading).toBeVisible({ timeout: 15_000 });

    // Fill in profile name
    const uniqueName = `e2etest_${Date.now().toString(36).slice(-6)}`;
    const nameInput = page.getByPlaceholder("Enter your name");
    await expect(nameInput).toBeVisible({ timeout: 5_000 });
    await nameInput.clear();
    await nameInput.fill(uniqueName);

    // Click Create Profile / Update Profile button
    const saveBtn = page
      .getByRole("button", { name: /Create Profile/i })
      .or(page.getByRole("button", { name: /Update Profile/i }));
    await expect(saveBtn).toBeEnabled({ timeout: 5_000 });
    await saveBtn.click();

    // Wait for success notification
    const success = page.getByText(/Profile (created|updated)/i);
    await expect(success).toBeVisible({ timeout: 30_000 });

    await context.close();
  });

  test("can update existing profile", async ({ browser }) => {
    test.setTimeout(120_000);

    const context = await browser.newContext();
    const page = await context.newPage();
    await setupWallet(page, profileAccount.privateKey);

    await page.goto("/settings");

    // Wait for form to load
    const profileHeading = page
      .getByRole("heading", { name: /Create Profile/i })
      .or(page.getByRole("heading", { name: /Your Profile/i }));
    await expect(profileHeading).toBeVisible({ timeout: 15_000 });

    // Update name with a different value
    const updatedName = `e2e_upd_${Date.now().toString(36).slice(-5)}`;
    const nameInput = page.getByPlaceholder("Enter your name");
    await expect(nameInput).toBeVisible({ timeout: 5_000 });
    await nameInput.clear();
    await nameInput.fill(updatedName);

    const saveBtn = page
      .getByRole("button", { name: /Update Profile/i })
      .or(page.getByRole("button", { name: /Create Profile/i }));
    await expect(saveBtn).toBeEnabled({ timeout: 5_000 });
    await saveBtn.click();

    const success = page.getByText(/Profile (created|updated)/i);
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
      if (data.profile?.name?.startsWith("e2e_upd_")) {
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
      expect(data.profile.name).toMatch(/^e2e_upd_/);
    }
  });
});
