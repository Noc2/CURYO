import { expect, test } from "../fixtures/wallet";
import { ANVIL_ACCOUNTS } from "../helpers/anvil-accounts";
import { readTokenBalance } from "../helpers/admin-helpers";
import { CONTRACT_ADDRESSES } from "../helpers/contracts";
import { gotoWithRetry } from "../helpers/wait-helpers";
import { setupWallet } from "../helpers/wallet-session";

test.describe("Settings page", () => {
  test("delegation tab can transfer HREP to another address", async ({ connectedPage: page }) => {
    test.setTimeout(60_000);

    const sender = ANVIL_ACCOUNTS.account2.address;
    const recipient = ANVIL_ACCOUNTS.account11.address;
    const transferAmount = "1.25";
    const transferAmountMicro = 1_250_000n;
    const tokenAddress = CONTRACT_ADDRESSES.HumanReputation;

    const senderBalanceBefore = await readTokenBalance(sender, tokenAddress);
    const recipientBalanceBefore = await readTokenBalance(recipient, tokenAddress);

    await gotoWithRetry(page, "/settings#delegation");

    await expect(page.getByRole("heading", { name: "Delegated Vote ID" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Transfer HREP" })).toBeVisible({ timeout: 15_000 });

    await page.getByLabel("Transfer recipient").fill(recipient);
    await page.getByLabel("Transfer amount").fill(transferAmount);

    const sendButton = page.getByRole("button", { name: "Send HREP", exact: true });
    await expect(sendButton).toBeEnabled();
    await sendButton.click();

    await expect(page.getByText(`Sent ${transferAmount} HREP`)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByLabel("Transfer amount")).toHaveValue("");

    const senderBalanceAfter = await readTokenBalance(sender, tokenAddress);
    const recipientBalanceAfter = await readTokenBalance(recipient, tokenAddress);

    expect(senderBalanceAfter).toBe(senderBalanceBefore - transferAmountMicro);
    expect(recipientBalanceAfter).toBe(recipientBalanceBefore + transferAmountMicro);
  });

  test("delegation tab explains missing Voter ID instead of rendering empty", async ({ page }) => {
    await setupWallet(page, ANVIL_ACCOUNTS.account1.privateKey);
    await gotoWithRetry(page, "/settings#delegation", { ensureWalletConnected: true });

    await expect(page).toHaveURL(/\/settings#delegation$/);
    await expect(page.getByRole("button", { name: "Delegation", exact: true })).toHaveClass(/pill-active/);
    await expect(page.getByRole("heading", { name: "Voter ID required for delegation" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("link", { name: "Open HREP faucet" })).toHaveAttribute("href", "/governance#faucet");
  });

  test("frontend tab shows the registration surface", async ({ connectedPage: page }) => {
    await gotoWithRetry(page, "/settings#frontend");

    await expect(page).toHaveURL(/\/settings#frontend$/);
    await expect(page.getByRole("button", { name: "Frontend", exact: true })).toHaveClass(/pill-active/);
    await expect(page.getByRole("heading", { name: "Frontend Registration" })).toBeVisible({ timeout: 15_000 });
  });

  test("wallet tab shows the CELO gas top-up surface", async ({ connectedPage: page }) => {
    await gotoWithRetry(page, "/settings#wallet");

    await expect(page).toHaveURL(/\/settings#wallet$/);
    await expect(page.getByRole("button", { name: "Wallet", exact: true })).toHaveClass(/pill-active/);
    await expect(page.getByRole("heading", { name: "Gas and wallet funding" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Top up network fees" })).toBeVisible();
    await expect(page.getByText("CELO top-up is available on Celo mainnet deployments.")).toBeVisible();
  });
});
