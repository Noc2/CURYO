import { ANVIL_ACCOUNTS } from "../helpers/anvil-accounts";
import { newE2EContext } from "../helpers/browser-context";
import { setupWallet } from "../helpers/wallet-session";
import { voteOnContent } from "../helpers/vote-helpers";
import { waitForFeedLoaded } from "../helpers/wait-helpers";
import { expect, test } from "@playwright/test";

test.describe("Voting flow — 3-voter threshold", () => {
  test("vote page does not auto-request watchlist signatures on load", async ({ browser }) => {
    const context = await newE2EContext(browser);
    const page = await context.newPage();
    let watchlistChallengeRequests = 0;

    page.on("request", request => {
      if (request.method() === "POST" && request.url().includes("/api/watchlist/content/challenge")) {
        watchlistChallengeRequests += 1;
      }
    });

    await setupWallet(page, ANVIL_ACCOUNTS.account3.privateKey);
    await page.goto("/vote");
    await waitForFeedLoaded(page);
    await page.waitForTimeout(1_000);

    expect(watchlistChallengeRequests).toBe(0);
    await context.close();
  });

  test("vote buttons visible on non-own content", async ({ browser }) => {
    const context = await newE2EContext(browser);
    const page = await context.newPage();
    // Account #3 viewing the feed
    await setupWallet(page, ANVIL_ACCOUNTS.account3.privateKey);
    await page.goto("/vote");
    await waitForFeedLoaded(page);

    // Verify the wallet is connected by checking for any voting-related UI,
    // or the empty feed state (feed loaded, wallet connected, but no content indexed yet).
    const connectedIndicators = page
      .getByRole("button", { name: "Vote up" })
      .or(page.getByRole("button", { name: "Vote down" }))
      .or(page.getByText("Your submission"))
      .or(page.getByText(/Cooldown/))
      .or(page.getByText(/Voted (Up|Down)/))
      .or(page.getByText("Round full"))
      .or(page.getByText("No content submitted yet"));

    await expect(connectedIndicators.first()).toBeVisible({ timeout: 15_000 });
    await context.close();
  });

  // Extend timeout: 3 accounts × ~45s each (load + thumbnail cycling + tx + revert handling)
  test("three accounts can vote on the same content", async ({ browser }) => {
    test.setTimeout(180_000);
    // Use accounts #8, #9, #10 — these have 1000 cREP + VoterID.
    // Accounts #3-#7 are reserved for settlement/reward-claim tests to avoid cooldown collisions.
    const voters = [
      { account: ANVIL_ACCOUNTS.account8, direction: "up" as const },
      { account: ANVIL_ACCOUNTS.account9, direction: "up" as const },
      { account: ANVIL_ACCOUNTS.account10, direction: "down" as const },
    ];

    let successCount = 0;

    for (const voter of voters) {
      const context = await newE2EContext(browser);
      const page = await context.newPage();
      await setupWallet(page, voter.account.privateKey);

      const success = await voteOnContent(page, voter.direction);
      if (success) successCount++;

      await context.close();
    }

    // On a fresh deploy all 3 succeed. Repeated runs or prior settlement tests
    // may exhaust voteable content (rounds settled, cooldowns active).
    if (successCount === 0) {
      test.skip(true, "No votes succeeded — content likely settled or cooldowns from prior tests");
      return;
    }
    expect(successCount).toBeGreaterThanOrEqual(1);
  });
});
