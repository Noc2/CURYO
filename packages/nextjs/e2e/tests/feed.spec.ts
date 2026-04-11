import { expect, test } from "../fixtures/wallet";
import { gotoWithRetry, waitForFeedLoaded } from "../helpers/wait-helpers";

test.describe("Content feed", () => {
  test("displays content items at /vote", async ({ connectedPage: page }) => {
    await gotoWithRetry(page, "/vote", { ensureWalletConnected: true, timeout: 45_000 });
    await waitForFeedLoaded(page, 30_000);

    // The feed should show vote UI or an empty state — one of these must be visible
    const anyState = page
      .getByRole("button", { name: "Vote up" })
      .or(page.getByText(/Voted(?: hidden| Up| Down)?/i))
      .or(page.getByText("Your submission"))
      .or(page.getByText("Round full"))
      .or(page.getByText(/Cooldown/))
      .or(page.getByText("No content submitted yet"));
    await expect(anyState.first()).toBeVisible({ timeout: 15_000 });
  });

  test("category filter pills are visible", async ({ connectedPage: page }) => {
    await gotoWithRetry(page, "/vote", { ensureWalletConnected: true, timeout: 45_000 });
    await waitForFeedLoaded(page, 30_000);

    // "All" category pill should always be present — use .first() because the
    // CategoryFilter renders a hidden measurement row with duplicate buttons
    const allPill = page.getByRole("button", { name: /^All$/i }).first();
    await expect(allPill).toBeVisible({ timeout: 10_000 });
  });

  test("connected users see the feed scope filter pill", async ({ connectedPage: page }) => {
    await gotoWithRetry(page, "/vote", { ensureWalletConnected: true, timeout: 45_000 });
    await waitForFeedLoaded(page, 30_000);

    const filterPill = page.getByRole("button", { name: /^View$/i }).first();
    await expect(filterPill).toBeVisible({ timeout: 10_000 });
  });

  test("clicking a non-video preview keeps users on the vote page and nudges the vote controls", async ({
    connectedPage: page,
  }) => {
    await gotoWithRetry(page, "/vote?q=go-ethereum", { ensureWalletConnected: true, timeout: 45_000 });
    await waitForFeedLoaded(page, 30_000);

    await expect(page.getByRole("heading", { name: /go-ethereum/i }).first()).toBeVisible({ timeout: 10_000 });

    const activeSurface = page.locator('[aria-current="true"] [data-testid="vote-content-surface"]').first();
    await expect(activeSurface).toBeVisible({ timeout: 10_000 });

    const popupPromise = page.context().waitForEvent("page", { timeout: 1_000 }).catch(() => null);
    await activeSurface.click();

    const popup = await popupPromise;
    expect(popup).toBeNull();
    await expect(page).toHaveURL(/\/vote\?.*q=go-ethereum.*content=/, { timeout: 10_000 });
    await expect(page.locator('[data-vote-attention="true"]').first()).toBeVisible({ timeout: 5_000 });
  });

  test("explicit source links still open externally", async ({ connectedPage: page }) => {
    await gotoWithRetry(page, "/vote?q=go-ethereum", { ensureWalletConnected: true, timeout: 45_000 });
    await waitForFeedLoaded(page, 30_000);

    const activeCard = page.locator('article[aria-current="true"]').first();
    await activeCard.getByRole("button", { name: "Expand details" }).click();

    const sourceLink = activeCard.getByTestId("content-source-link").first();
    await expect(sourceLink).toBeVisible({ timeout: 10_000 });

    const popupPromise = page.context().waitForEvent("page");
    await sourceLink.click();

    const popup = await popupPromise;
    await popup.waitForLoadState("domcontentloaded");
    await expect(popup).toHaveURL(/github\.com\/ethereum\/go-ethereum/i);
  });
});
