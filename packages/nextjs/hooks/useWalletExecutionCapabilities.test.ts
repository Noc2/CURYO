import { resolveWalletExecutionChainId } from "./useWalletExecutionCapabilities";
import assert from "node:assert/strict";
import test from "node:test";

test("resolveWalletExecutionChainId prefers the wagmi chain when it is available", () => {
  assert.equal(resolveWalletExecutionChainId(42220, 11142220), 42220);
});

test("resolveWalletExecutionChainId falls back to the thirdweb chain during reconnect", () => {
  assert.equal(resolveWalletExecutionChainId(undefined, 11142220), 11142220);
});

test("resolveWalletExecutionChainId returns undefined when no wallet chain is available", () => {
  assert.equal(resolveWalletExecutionChainId(undefined, undefined), undefined);
});
