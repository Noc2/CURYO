import {
  deriveAnchoredTlockRuntimeNowMs,
  deriveDrandRoundRevealableAtSeconds,
  deriveKeeperDecryptWaitMs,
  deriveKeeperDecryptableAtSeconds,
} from "./tlockRuntime";
import assert from "node:assert/strict";
import test from "node:test";

test("deriveAnchoredTlockRuntimeNowMs targets the round epoch boundary", () => {
  assert.equal(
    deriveAnchoredTlockRuntimeNowMs({
      latestBlockTimestampSeconds: 1_000,
      roundEpochDurationSeconds: 300,
      tlockEpochDurationSeconds: 30,
      drandPeriodSeconds: 30,
    }),
    1_270_000,
  );
});

test("deriveAnchoredTlockRuntimeNowMs does not depend on drand period once the epoch boundary is fixed", () => {
  assert.equal(
    deriveAnchoredTlockRuntimeNowMs({
      latestBlockTimestampSeconds: 1_000,
      roundEpochDurationSeconds: 300,
      tlockEpochDurationSeconds: 10,
      drandPeriodSeconds: 0,
    }),
    1_290_000,
  );
});

test("deriveDrandRoundRevealableAtSeconds converts drand round ids back into wall-clock seconds", () => {
  assert.equal(
    deriveDrandRoundRevealableAtSeconds({
      targetRound: 27_394_009n,
      drandGenesisTimeSeconds: 1_692_803_367n,
      drandPeriodSeconds: 3n,
    }),
    1_774_985_391n,
  );
});

test("deriveKeeperDecryptableAtSeconds waits for whichever guardrail is later", () => {
  assert.equal(
    deriveKeeperDecryptableAtSeconds({
      revealableAfterSeconds: 1_774_985_389n,
      targetRound: 27_394_009n,
      drandGenesisTimeSeconds: 1_692_803_367n,
      drandPeriodSeconds: 3n,
    }),
    1_774_985_391n,
  );
});

test("deriveKeeperDecryptWaitMs includes wall-clock drift plus keeper polling slack", () => {
  assert.equal(
    deriveKeeperDecryptWaitMs({
      wallClockNowSeconds: 1_774_985_169,
      revealableAfterSeconds: 1_774_985_389n,
      targetRound: 27_394_009n,
      drandGenesisTimeSeconds: 1_692_803_367n,
      drandPeriodSeconds: 3n,
      keeperIntervalMs: 30_000,
      extraBufferMs: 10_000,
    }),
    262_000,
  );
});
