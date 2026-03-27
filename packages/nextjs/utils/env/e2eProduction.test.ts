import { isLocalE2EProductionBuildEnabled } from "./e2eProduction";
import assert from "node:assert/strict";
import test from "node:test";

test("enables local production-style E2E from the server-only flag", () => {
  assert.equal(
    isLocalE2EProductionBuildEnabled({
      CURYO_E2E_PRODUCTION_BUILD: "true",
      NEXT_PUBLIC_CURYO_E2E_PRODUCTION_BUILD: undefined,
    }),
    true,
  );
});

test("enables local production-style E2E from the public client flag", () => {
  assert.equal(
    isLocalE2EProductionBuildEnabled({
      CURYO_E2E_PRODUCTION_BUILD: undefined,
      NEXT_PUBLIC_CURYO_E2E_PRODUCTION_BUILD: "true",
    }),
    true,
  );
});

test("stays disabled when neither E2E opt-in flag is set", () => {
  assert.equal(
    isLocalE2EProductionBuildEnabled({
      CURYO_E2E_PRODUCTION_BUILD: undefined,
      NEXT_PUBLIC_CURYO_E2E_PRODUCTION_BUILD: undefined,
    }),
    false,
  );
});
