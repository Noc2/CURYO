import { expect, test } from "../fixtures/wallet";
import { ANVIL_ACCOUNTS } from "../helpers/anvil-accounts";
import { readTokenBalance } from "../helpers/admin-helpers";
import { CONTRACT_ADDRESSES } from "../helpers/contracts";

test.describe("Settings page", () => {
  test("delegation tab can transfer cREP to another address", async ({ connectedPage: page }) => {
    test.setTimeout(60_000);

    const sender = ANVIL_ACCOUNTS.account2.address;
    const recipient = ANVIL_ACCOUNTS.account11.address;
    const transferAmount = "1.25";
    const transferAmountMicro = 1_250_000n;
    const tokenAddress = CONTRACT_ADDRESSES.CuryoReputation;

    const senderBalanceBefore = await readTokenBalance(sender, tokenAddress);
    const recipientBalanceBefore = await readTokenBalance(recipient, tokenAddress);

    await page.goto("/settings?tab=delegation", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { name: "Delegated Vote ID" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Transfer cREP" })).toBeVisible({ timeout: 15_000 });

    await page.getByLabel("Transfer recipient").fill(recipient);
    await page.getByLabel("Transfer amount").fill(transferAmount);

    const sendButton = page.getByRole("button", { name: "Send cREP" });
    await expect(sendButton).toBeEnabled();
    await sendButton.click();

    await expect(page.getByText(`Sent ${transferAmount} cREP`)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByLabel("Transfer amount")).toHaveValue("");

    const senderBalanceAfter = await readTokenBalance(sender, tokenAddress);
    const recipientBalanceAfter = await readTokenBalance(recipient, tokenAddress);

    expect(senderBalanceAfter).toBe(senderBalanceBefore - transferAmountMicro);
    expect(recipientBalanceAfter).toBe(recipientBalanceBefore + transferAmountMicro);
  });
});
