import {
  type ClaimTransactionFeedbackContext,
  getClaimGasErrorMessage,
  getClaimPreflightErrorMessage,
  isClaimGasShortageError,
} from "./claimTransactionFeedback";
import assert from "node:assert/strict";
import test from "node:test";

const BASE_CONTEXT: ClaimTransactionFeedbackContext = {
  canShowFreeTransactionAllowance: true,
  canSponsorTransactions: false,
  freeTransactionRemaining: 3,
  freeTransactionVerified: true,
  hasNativeGasBalance: false,
  isAwaitingFreeTransactionAllowance: false,
  isAwaitingSelfFundedWalletReconnect: false,
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

test("getClaimGasErrorMessage does not ask funded wallets to add CELO", () => {
  assert.equal(
    getClaimGasErrorMessage({
      ...BASE_CONTEXT,
      freeTransactionRemaining: 0,
      hasNativeGasBalance: true,
    }),
    "Free transactions used up. Retry to use CELO for gas.",
  );
});

test("getClaimGasErrorMessage uses normal gas guidance when free transactions are hidden", () => {
  assert.equal(
    getClaimGasErrorMessage({
      ...BASE_CONTEXT,
      canShowFreeTransactionAllowance: false,
      freeTransactionRemaining: 0,
    }),
    "Add some CELO for gas, then retry.",
  );
});

test("getClaimPreflightErrorMessage waits for free transaction allowance before claiming", () => {
  assert.equal(
    getClaimPreflightErrorMessage({
      ...BASE_CONTEXT,
      isAwaitingFreeTransactionAllowance: true,
    }),
    "Checking wallet gas mode. Retry in a moment.",
  );
});

test("getClaimPreflightErrorMessage waits while switching to paid gas", () => {
  assert.equal(
    getClaimPreflightErrorMessage({
      ...BASE_CONTEXT,
      isAwaitingSelfFundedWalletReconnect: true,
    }),
    "Wallet switching to paid gas. Retry in a moment.",
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
      canShowFreeTransactionAllowance: true,
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
      canShowFreeTransactionAllowance: true,
      freeTransactionRemaining: 2,
      freeTransactionVerified: true,
    }),
    false,
  );
});

test("isClaimGasShortageError ignores unsupported RPC methods when free transactions are hidden", () => {
  const error = {
    details: "this request method is not supported",
  };

  assert.equal(
    isClaimGasShortageError(error, {
      canShowFreeTransactionAllowance: false,
      freeTransactionRemaining: 0,
      freeTransactionVerified: true,
    }),
    false,
  );
});
