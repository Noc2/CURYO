import { shouldRefreshAfterFaucetClaim } from "./faucetQueryInvalidation";
import assert from "node:assert/strict";
import test from "node:test";

const ADDRESS = "0x63cada40e8acf7a1d47229af5be35b78b16035fa";
const OTHER_ADDRESS = "0x1111111111111111111111111111111111111111";

test("shouldRefreshAfterFaucetClaim refreshes the signed free-transaction summary for the current wallet", () => {
  assert.equal(shouldRefreshAfterFaucetClaim(["free-transactions", ADDRESS, 42220], ADDRESS), true);
  assert.equal(shouldRefreshAfterFaucetClaim(["free-transactions", OTHER_ADDRESS, 42220], ADDRESS), false);
});

test("shouldRefreshAfterFaucetClaim refreshes claim-related contract reads for the current wallet only", () => {
  for (const functionName of ["balanceOf", "hasClaimed", "hasVoterId", "getTokenId"]) {
    assert.equal(
      shouldRefreshAfterFaucetClaim(["readContract", { functionName, args: [ADDRESS] }], ADDRESS),
      true,
      `${functionName} should refresh for the claiming wallet`,
    );
    assert.equal(
      shouldRefreshAfterFaucetClaim(["readContract", { functionName, args: [OTHER_ADDRESS] }], ADDRESS),
      false,
      `${functionName} should not refresh for a different wallet`,
    );
  }
});

test("shouldRefreshAfterFaucetClaim leaves unrelated signed-session queries alone", () => {
  assert.equal(shouldRefreshAfterFaucetClaim(["followedProfiles", ADDRESS], ADDRESS), false);
  assert.equal(shouldRefreshAfterFaucetClaim(["watchedContent", ADDRESS], ADDRESS), false);
  assert.equal(shouldRefreshAfterFaucetClaim(["notificationPreferences", ADDRESS], ADDRESS), false);
});
