import assert from "node:assert/strict";
import test from "node:test";

import { deriveAnchoredTlockRuntimeNowMs, resolveTlockTargetBufferSeconds } from "./tlockRuntime";

test("resolveTlockTargetBufferSeconds keeps short epochs inside the current reveal window", () => {
  assert.equal(resolveTlockTargetBufferSeconds(30, 30), 15);
});

test("resolveTlockTargetBufferSeconds caps long epochs at the drand period", () => {
  assert.equal(resolveTlockTargetBufferSeconds(1200, 30), 30);
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
    1_291_000,
  );
});
