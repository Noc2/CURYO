import { shouldAutoRedirectFromLanding } from "./landingRedirect";
import assert from "node:assert/strict";
import test from "node:test";

test("does not auto-redirect visitors who are not connected", () => {
  assert.equal(
    shouldAutoRedirectFromLanding({
      address: undefined,
      connectorId: undefined,
      hasExplicitLandingOverride: false,
      isConnected: false,
      voterIdResolved: false,
    }),
    false,
  );
});

test("does not auto-redirect externally connected wallets", () => {
  assert.equal(
    shouldAutoRedirectFromLanding({
      address: "0x1234",
      connectorId: "metaMask",
      hasExplicitLandingOverride: false,
      isConnected: true,
      voterIdResolved: true,
    }),
    false,
  );
});

test("does auto-redirect authenticated in-app wallet sessions once voter state resolves", () => {
  assert.equal(
    shouldAutoRedirectFromLanding({
      address: "0x1234",
      connectorId: "in-app-wallet",
      hasExplicitLandingOverride: false,
      isConnected: true,
      voterIdResolved: true,
    }),
    true,
  );
});

test("respects the explicit landing override even for authenticated sessions", () => {
  assert.equal(
    shouldAutoRedirectFromLanding({
      address: "0x1234",
      connectorId: "in-app-wallet",
      hasExplicitLandingOverride: true,
      isConnected: true,
      voterIdResolved: true,
    }),
    false,
  );
});
