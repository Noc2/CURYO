import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_E2E_RPC_URL, resolveE2ERpcUrl } from "./service-urls";

test("resolveE2ERpcUrl defaults to the browser-safe local Anvil origin", () => {
  assert.equal(DEFAULT_E2E_RPC_URL, "http://127.0.0.1:8545");
  assert.equal(resolveE2ERpcUrl(undefined), DEFAULT_E2E_RPC_URL);
  assert.equal(resolveE2ERpcUrl(null), DEFAULT_E2E_RPC_URL);
});

test("resolveE2ERpcUrl preserves explicit overrides", () => {
  assert.equal(resolveE2ERpcUrl(" http://localhost:9545 "), "http://localhost:9545");
});
