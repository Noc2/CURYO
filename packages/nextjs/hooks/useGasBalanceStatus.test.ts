import { shouldAwaitSelfFundedGasModeReconnect, shouldExpectThirdwebGasMode } from "./useGasBalanceStatus";
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
