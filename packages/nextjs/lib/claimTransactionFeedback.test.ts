import {
  type ClaimTransactionFeedbackContext,
  getClaimGasErrorMessage,
  getClaimPreflightErrorMessage,
  isClaimGasShortageError,
} from "./claimTransactionFeedback";
import assert from "node:assert/strict";
import test from "node:test";

const BASE_CONTEXT: ClaimTransactionFeedbackContext = {
  canSponsorTransactions: false,
  freeTransactionRemaining: 3,
  freeTransactionVerified: true,
  isAwaitingSponsoredWalletReconnect: false,
  isMissingGasBalance: false,
  nativeTokenSymbol: "CELO",
};

test("getClaimGasErrorMessage explains when free transactions are exhausted", () => {
  assert.equal(
    getClaimGasErrorMessage({
      ...BASE_CONTEXT,
      freeTransactionRemaining: 0,
    }),
    "Free transactions used up. Add some CELO for gas, then retry.",
  );
});

test("getClaimPreflightErrorMessage surfaces wallet reconnect state first", () => {
  assert.equal(
    getClaimPreflightErrorMessage({
      ...BASE_CONTEXT,
      isAwaitingSponsoredWalletReconnect: true,
      isMissingGasBalance: true,
    }),
    "Wallet reconnecting. Retry in a moment.",
  );
});

test("getClaimPreflightErrorMessage returns the gas guidance when gas is missing", () => {
  assert.equal(
    getClaimPreflightErrorMessage({
      ...BASE_CONTEXT,
      isMissingGasBalance: true,
    }),
    "Add some CELO for gas, then retry.",
  );
});

test("isClaimGasShortageError treats unsupported RPC methods as gas shortage after free transactions are exhausted", () => {
  const error = {
    details: "this request method is not supported",
    shortMessage: "An unknown RPC error occurred.",
  };

  assert.equal(
    isClaimGasShortageError(error, {
      freeTransactionRemaining: 0,
      freeTransactionVerified: true,
    }),
    true,
  );
});

test("isClaimGasShortageError ignores unsupported RPC methods while free transactions remain", () => {
  const error = {
    details: "this request method is not supported",
  };

  assert.equal(
    isClaimGasShortageError(error, {
      freeTransactionRemaining: 2,
      freeTransactionVerified: true,
    }),
    false,
  );
});
