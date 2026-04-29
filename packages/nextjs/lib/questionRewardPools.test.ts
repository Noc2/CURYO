import { getConfiguredQuestionRewardPoolEscrowAddress, parseUsdRewardPoolAmount } from "./questionRewardPools";
import assert from "node:assert/strict";
import test from "node:test";

test("parseUsdRewardPoolAmount accepts plain decimal USDC amounts", () => {
  assert.equal(parseUsdRewardPoolAmount("10"), 10_000_000n);
  assert.equal(parseUsdRewardPoolAmount("1234.56"), 1_234_560_000n);
  assert.equal(parseUsdRewardPoolAmount("0.000001"), 1n);
});

test("parseUsdRewardPoolAmount accepts comma-grouped USD amounts", () => {
  assert.equal(parseUsdRewardPoolAmount("1,000"), 1_000_000_000n);
  assert.equal(parseUsdRewardPoolAmount("1,234.56"), 1_234_560_000n);
  assert.equal(parseUsdRewardPoolAmount("12,345,678.901234"), 12_345_678_901_234n);
});

test("parseUsdRewardPoolAmount rejects ambiguous or malformed comma input", () => {
  assert.equal(parseUsdRewardPoolAmount("1,5"), null);
  assert.equal(parseUsdRewardPoolAmount("1,2,3"), null);
  assert.equal(parseUsdRewardPoolAmount("12,34.56"), null);
  assert.equal(parseUsdRewardPoolAmount("1,000.1234567"), null);
});

test("getConfiguredQuestionRewardPoolEscrowAddress rejects mismatched production overrides", () => {
  const env = process.env as Record<string, string | undefined>;
  const originalNodeEnv = env.NODE_ENV;
  const originalOverride = env.NEXT_PUBLIC_QUESTION_REWARD_POOL_ESCROW_ADDRESS;
  const deployedAddress = getConfiguredQuestionRewardPoolEscrowAddress(31337);
  assert.ok(deployedAddress);

  try {
    env.NODE_ENV = "production";
    env.NEXT_PUBLIC_QUESTION_REWARD_POOL_ESCROW_ADDRESS = deployedAddress.toLowerCase();
    assert.equal(getConfiguredQuestionRewardPoolEscrowAddress(31337)?.toLowerCase(), deployedAddress.toLowerCase());

    env.NEXT_PUBLIC_QUESTION_REWARD_POOL_ESCROW_ADDRESS = "0x000000000000000000000000000000000000bEEF";
    assert.throws(
      () => getConfiguredQuestionRewardPoolEscrowAddress(999999),
      /requires a shared QuestionRewardPoolEscrow deployment/,
    );

    env.NEXT_PUBLIC_QUESTION_REWARD_POOL_ESCROW_ADDRESS = "0x000000000000000000000000000000000000dEaD";
    assert.throws(
      () => getConfiguredQuestionRewardPoolEscrowAddress(31337),
      /must match the shared QuestionRewardPoolEscrow deployment/,
    );
  } finally {
    if (originalNodeEnv === undefined) {
      delete env.NODE_ENV;
    } else {
      env.NODE_ENV = originalNodeEnv;
    }
    if (originalOverride === undefined) {
      delete env.NEXT_PUBLIC_QUESTION_REWARD_POOL_ESCROW_ADDRESS;
    } else {
      env.NEXT_PUBLIC_QUESTION_REWARD_POOL_ESCROW_ADDRESS = originalOverride;
    }
  }
});
