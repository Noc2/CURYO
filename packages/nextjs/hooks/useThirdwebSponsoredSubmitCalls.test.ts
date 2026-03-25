import {
  isThirdwebSponsorshipDeniedError,
  shouldExpectSponsoredSubmitCalls,
  shouldPreferSponsoredSubmitCalls,
} from "./useThirdwebSponsoredSubmitCalls";
import assert from "node:assert/strict";
import test from "node:test";

test("prefers sponsored submit calls for thirdweb connector wallets with free transactions on supported chains", () => {
  assert.equal(
    shouldPreferSponsoredSubmitCalls({
      canUseFreeTransactions: true,
      chainId: 42220,
      connectorId: "in-app-wallet",
    }),
    true,
  );
});

test("expects sponsored submit calls for supported thirdweb connector wallets before allowance resolves", () => {
  assert.equal(
    shouldExpectSponsoredSubmitCalls({
      chainId: 42220,
      connectorId: "in-app-wallet",
    }),
    true,
  );
});

test("does not prefer sponsored submit calls without free transaction allowance", () => {
  assert.equal(
    shouldPreferSponsoredSubmitCalls({
      canUseFreeTransactions: false,
      chainId: 42220,
      connectorId: "in-app-wallet",
    }),
    false,
  );
});

test("does not prefer sponsored submit calls for unsupported connectors", () => {
  assert.equal(
    shouldPreferSponsoredSubmitCalls({
      canUseFreeTransactions: true,
      chainId: 42220,
      connectorId: "walletConnect",
    }),
    false,
  );
});

test("detects thirdweb sponsorship denials", () => {
  assert.equal(
    isThirdwebSponsorshipDeniedError(
      new Error('Error executing 7702 transaction: {"reason":"Transaction not sponsored."}'),
    ),
    true,
  );
});

test("ignores unrelated thirdweb submit failures", () => {
  assert.equal(isThirdwebSponsorshipDeniedError(new Error("User rejected the request.")), false);
});
