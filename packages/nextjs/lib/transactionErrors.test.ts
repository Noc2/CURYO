import { getGasBalanceErrorMessage, isInsufficientFundsError } from "./transactionErrors";
import assert from "node:assert/strict";
import test from "node:test";

test("detects insufficient funds from nested viem errors", () => {
  const error = new Error("outer");
  (error as Error & { cause?: unknown }).cause = {
    details: "error_forwarding_sequencer: insufficient funds for gas * price + value: balance 0",
  };

  assert.equal(isInsufficientFundsError(error), true);
});

test("ignores unrelated transaction failures", () => {
  const error = {
    shortMessage: "User rejected the request.",
  };

  assert.equal(isInsufficientFundsError(error), false);
});

test("formats a short gas guidance message", () => {
  assert.equal(getGasBalanceErrorMessage("CELO"), "Add some CELO for gas, then retry.");
});

test("formats sponsored-wallet gas guidance", () => {
  assert.equal(
    getGasBalanceErrorMessage("CELO", { supportsSponsoredCalls: true }),
    "Gas is usually sponsored for this wallet. If it still fails, add some CELO and retry.",
  );
});
