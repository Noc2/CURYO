import { getThirdwebWalletExecutionMode } from "../services/thirdweb/client";
import assert from "node:assert/strict";
import test from "node:test";

test("thirdweb in-app wallets stay in EOA mode on Celo Sepolia", () => {
  assert.deepEqual(getThirdwebWalletExecutionMode(11142220), {
    mode: "EOA",
  });
});

test("thirdweb in-app wallets stay in EOA mode on Celo mainnet", () => {
  assert.deepEqual(getThirdwebWalletExecutionMode(42220), {
    mode: "EOA",
  });
});
