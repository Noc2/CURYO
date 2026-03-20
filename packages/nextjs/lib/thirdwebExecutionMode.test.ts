import { getThirdwebWalletExecutionMode } from "../services/thirdweb/client";
import assert from "node:assert/strict";
import test from "node:test";

test("thirdweb in-app wallets use sponsored EIP-7702 mode on Celo Sepolia", () => {
  assert.deepEqual(getThirdwebWalletExecutionMode(11142220), {
    mode: "EIP7702",
    sponsorGas: true,
  });
});

test("thirdweb in-app wallets use sponsored EIP-7702 mode on Celo mainnet", () => {
  assert.deepEqual(getThirdwebWalletExecutionMode(42220), {
    mode: "EIP7702",
    sponsorGas: true,
  });
});

test("thirdweb in-app wallets stay in EOA mode on unsupported chains", () => {
  assert.deepEqual(getThirdwebWalletExecutionMode(31337), {
    mode: "EOA",
  });
});
