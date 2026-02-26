import { ANVIL_ACCOUNTS } from "../helpers/anvil-accounts";
import { CONTRACT_ADDRESSES } from "../helpers/contracts";
import { cancelExpiredRoundDirect, fastForwardTime } from "../helpers/keeper";
import { setupWallet } from "../helpers/local-storage";
import { getContentList, ponderGet } from "../helpers/ponder-api";
import { expect, test } from "@playwright/test";

/**
 * Round cancellation tests.
 * Triggers Ponder event: RoundCancelled.
 *
 * IMPORTANT: This test fast-forwards time by 7+ days (maxDuration).
 * All active rounds will expire. Run LAST in the suite via a separate
 * Playwright project with a dependency on the main chromium project.
 */
test.describe("Round cancellation", () => {
  test.describe.configure({ mode: "serial" });

  const ENGINE_ADDRESS = CONTRACT_ADDRESSES.RoundVotingEngine;
  let cancelledCount = 0;

  test("round cancels when maxDuration expires without quorum", async ({ browser }) => {
    test.setTimeout(180_000);

    // Step 1: Submit new content to create a fresh round (0 votes)
    const context = await browser.newContext();
    const page = await context.newPage();
    await setupWallet(page, ANVIL_ACCOUNTS.account2.privateKey);

    await page.goto("/submit");
    await expect(page.getByRole("heading", { name: "Submit Content" })).toBeVisible({ timeout: 15_000 });

    // Select YouTube platform
    const platformBtn = page.getByText("Select a platform...");
    await expect(platformBtn).toBeVisible({ timeout: 5_000 });
    await platformBtn.click();
    await page.getByText("YouTube").first().click();

    // Enter a unique URL
    const uniqueId = Date.now();
    const urlInput = page.locator("input[type='url']").first();
    await expect(urlInput).toBeVisible({ timeout: 5_000 });
    await urlInput.fill(`https://www.youtube.com/watch?v=cancel_test_${uniqueId}`);

    // Enter title
    const descInput = page.locator("textarea").first();
    await expect(descInput).toBeVisible({ timeout: 3_000 });
    await descInput.fill(`Cancellation Test ${uniqueId}`);

    // Select a subcategory
    const subcatNames = ["Education", "Entertainment", "Music", "Technology", "Science", "Gaming"];
    for (const name of subcatNames) {
      const btn = page.locator("form button", { hasText: new RegExp(`^${name}$`) });
      if (await btn.isVisible().catch(() => false)) {
        await btn.click();
        break;
      }
    }

    // Submit
    const submitBtn = page.getByRole("button", { name: /^Submit Content/i });
    await expect(submitBtn).toBeEnabled({ timeout: 5_000 });
    await submitBtn.click();

    await expect(page.getByRole("heading", { name: /Content Submitted/i })).toBeVisible({ timeout: 30_000 });

    await context.close();

    // Step 2: Fast-forward past maxDuration (7 days + buffer)
    await fastForwardTime(7 * 86400 + 60);

    // Step 3: Cancel expired rounds directly on-chain.
    // The keeper API uses Date.now() for its off-chain check, which doesn't
    // advance with evm_increaseTime (only block.timestamp does). We call the
    // contract directly — it uses block.timestamp which HAS been advanced.
    //
    // Try content IDs 1-20 (some exist on local Anvil from the seed script).
    for (let contentId = 1; contentId <= 20; contentId++) {
      // Try round IDs 1-3 (most content has only 1 round)
      for (let roundId = 1; roundId <= 3; roundId++) {
        const success = await cancelExpiredRoundDirect(
          contentId,
          roundId,
          ENGINE_ADDRESS,
          ANVIL_ACCOUNTS.account0.address,
        );
        if (success) cancelledCount++;
      }
    }

    expect(cancelledCount).toBeGreaterThanOrEqual(1);
  });

  test("cancelled rounds verified via Ponder or on-chain", async () => {
    test.skip(cancelledCount === 0, "No rounds were cancelled in previous test");
    test.setTimeout(90_000);

    // Poll Ponder for cancelled rounds. After a 7-day time skip, Ponder needs
    // time to process the new blocks. Give it up to 60s to catch up.
    let foundCancelled = false;
    const start = Date.now();

    while (Date.now() - start < 60_000) {
      try {
        const { items } = await getContentList({ status: "all", limit: 50 });
        for (const item of items.slice(0, 10)) {
          const data = await ponderGet(`/content/${item.id}`);
          const cancelledRound = data.rounds?.find((r: { state: number }) => r.state === 2);
          if (cancelledRound) {
            foundCancelled = true;
            break;
          }
        }
      } catch {
        // Ponder may not have the data yet
      }
      if (foundCancelled) break;
      await new Promise(resolve => setTimeout(resolve, 3_000));
    }

    // On-chain cancellation already verified in previous test (tx succeeded).
    // If Ponder hasn't indexed it yet, that's a Ponder lag issue, not a test failure.
    if (!foundCancelled) {
      console.log("    ⚠ Ponder has not indexed the cancelled round yet (on-chain tx verified)");
    }

    expect(foundCancelled).toBe(true);
  });
});
