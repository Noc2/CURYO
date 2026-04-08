import {
  getGasBalanceErrorMessage,
  isFreeTransactionExhaustedError,
  isInsufficientFundsError,
  isUnsupportedRpcMethodError,
  isWalletRpcOverloadedError,
} from "./transactionErrors";
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
    getGasBalanceErrorMessage("CELO", { canSponsorTransactions: true }),
    "Gas is sponsored for now. If it still fails, add some CELO and retry.",
  );
});

test("detects exhausted free transaction verifier errors", () => {
  const error = {
    details: "Free transactions used up. Add CELO to continue.",
  };

  assert.equal(isFreeTransactionExhaustedError(error), true);
});

test("detects wallet RPC overload errors", () => {
  const error = {
    message: "RPC endpoint returned too many errors, retrying in 0.5 minutes. Consider using a different RPC endpoint.",
  };

  assert.equal(isWalletRpcOverloadedError(error), true);
});

test("detects unsupported RPC method errors from nested wallet responses", () => {
  const error = {
    shortMessage: "An unknown RPC error occurred.",
    cause: {
      details: "this request method is not supported",
    },
  };

  assert.equal(isUnsupportedRpcMethodError(error), true);
});
