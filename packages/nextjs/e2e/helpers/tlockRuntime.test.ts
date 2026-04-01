import {
  deriveAnchoredTlockRuntimeNowMs,
  deriveDrandRoundRevealableAtSeconds,
  deriveKeeperDecryptWaitMs,
  deriveKeeperDecryptableAtSeconds,
  resolveTlockTargetBufferSeconds,
} from "./tlockRuntime";
import assert from "node:assert/strict";
import test from "node:test";

test("resolveTlockTargetBufferSeconds keeps short epochs inside the current reveal window", () => {
  assert.equal(resolveTlockTargetBufferSeconds(30, 30), 15);
});

test("resolveTlockTargetBufferSeconds caps long epochs at the drand period", () => {
  assert.equal(resolveTlockTargetBufferSeconds(1200, 30), 30);
});

test("resolveTlockTargetBufferSeconds keeps a safety floor when drand rounds are very short", () => {
  assert.equal(resolveTlockTargetBufferSeconds(1200, 3), 15);
});

test("deriveAnchoredTlockRuntimeNowMs targets a buffered point inside the next reveal window", () => {
  assert.equal(
    deriveAnchoredTlockRuntimeNowMs({
      latestBlockTimestampSeconds: 1_000,
      roundEpochDurationSeconds: 300,
      tlockEpochDurationSeconds: 30,
      drandPeriodSeconds: 30,
    }),
    1_285_000,
  );
});

test("deriveAnchoredTlockRuntimeNowMs falls back to a minimal buffer when drand period is unavailable", () => {
  assert.equal(
    deriveAnchoredTlockRuntimeNowMs({
      latestBlockTimestampSeconds: 1_000,
      roundEpochDurationSeconds: 300,
      tlockEpochDurationSeconds: 10,
      drandPeriodSeconds: 0,
    }),
    1_305_000,
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
