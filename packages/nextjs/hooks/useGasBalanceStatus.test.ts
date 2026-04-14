import {
  shouldAwaitSelfFundedGasModeReconnect,
  shouldExpectThirdwebGasMode,
  shouldShowFreeTransactionAllowance,
} from "./useGasBalanceStatus";
import assert from "node:assert/strict";
import test from "node:test";

test("expects thirdweb gas mode from active in-app wallet before wagmi connector settles", () => {
  assert.equal(
    shouldExpectThirdwebGasMode({
      chainId: 42220,
      connectorId: undefined,
      includeExternalSendCalls: true,
      isThirdwebInApp: true,
    }),
    true,
  );
});

test("does not expect thirdweb gas mode without external send-call support", () => {
  assert.equal(
    shouldExpectThirdwebGasMode({
      chainId: 42220,
      connectorId: undefined,
      includeExternalSendCalls: false,
      isThirdwebInApp: true,
    }),
    false,
  );
});

test("does not expect thirdweb gas mode from stale in-app wallet after external connector settles", () => {
  assert.equal(
    shouldExpectThirdwebGasMode({
      chainId: 42220,
      connectorId: "injected",
      includeExternalSendCalls: true,
      isThirdwebInApp: true,
    }),
    false,
  );
});

test("shows free transaction allowance for the in-app wallet connector", () => {
  assert.equal(
    shouldShowFreeTransactionAllowance({
      chainId: 42220,
      connectorId: "in-app-wallet",
      isThirdwebInApp: false,
    }),
    true,
  );
});

test("shows free transaction allowance before the in-app connector settles", () => {
  assert.equal(
    shouldShowFreeTransactionAllowance({
      chainId: 42220,
      connectorId: undefined,
      isThirdwebInApp: true,
    }),
    true,
  );
});

test("hides free transaction allowance after an external connector settles", () => {
  assert.equal(
    shouldShowFreeTransactionAllowance({
      chainId: 42220,
      connectorId: "io.metamask",
      isThirdwebInApp: true,
    }),
    false,
  );
});

test("hides free transaction allowance on unsupported chains", () => {
  assert.equal(
    shouldShowFreeTransactionAllowance({
      chainId: 31337,
      connectorId: "in-app-wallet",
      isThirdwebInApp: true,
    }),
    false,
  );
});

test("awaits self-funded reconnect for exhausted free transactions before wagmi connector settles", () => {
  assert.equal(
    shouldAwaitSelfFundedGasModeReconnect({
      canUseFreeTransactions: false,
      chainId: 42220,
      connectorId: undefined,
      executionMode: "sponsored_7702",
      freeTransactionAllowanceResolved: true,
      includeExternalSendCalls: true,
      isThirdwebInApp: true,
    }),
    true,
  );
});

test("does not await self-funded reconnect after external connector settles", () => {
  assert.equal(
    shouldAwaitSelfFundedGasModeReconnect({
      canUseFreeTransactions: false,
      chainId: 42220,
      connectorId: "injected",
      executionMode: "sponsored_7702",
      freeTransactionAllowanceResolved: true,
      includeExternalSendCalls: true,
      isThirdwebInApp: true,
    }),
    false,
  );
});

test("stops awaiting self-funded reconnect after wallet switches to paid gas", () => {
  assert.equal(
    shouldAwaitSelfFundedGasModeReconnect({
      canUseFreeTransactions: false,
      chainId: 42220,
      connectorId: undefined,
      executionMode: "self_funded_7702",
      freeTransactionAllowanceResolved: true,
      includeExternalSendCalls: true,
      isThirdwebInApp: true,
    }),
    false,
  );
});
