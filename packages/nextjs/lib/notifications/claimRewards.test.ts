import {
  type PendingClaimRewardNotification,
  pickClaimRewardNotification,
  shouldNotifyAboutClaimableRewards,
} from "./claimRewards";
import assert from "node:assert/strict";
import test from "node:test";

test("pickClaimRewardNotification waits until a pending round is claimable and past its delay", () => {
  const pending: PendingClaimRewardNotification[] = [
    { key: "10-1", readyAtMs: 15_000 },
    { key: "11-1", readyAtMs: 20_000 },
  ];

  assert.equal(
    pickClaimRewardNotification({
      nowMs: 14_999,
      pending,
      claimableKeys: new Set(["10-1", "11-1"]),
      lastNotifiedAtMs: null,
    }),
    null,
  );

  assert.deepEqual(
    pickClaimRewardNotification({
      nowMs: 15_000,
      pending,
      claimableKeys: new Set(["10-1", "11-1"]),
      lastNotifiedAtMs: null,
    }),
    pending[0],
  );
});

test("pickClaimRewardNotification skips alerts during the cooldown window", () => {
  const pending: PendingClaimRewardNotification[] = [{ key: "10-1", readyAtMs: 15_000 }];

  assert.equal(
    pickClaimRewardNotification({
      nowMs: 20_000,
      pending,
      claimableKeys: new Set(["10-1"]),
      lastNotifiedAtMs: 5_000,
      cooldownMs: 30_000,
    }),
    null,
  );
});

test("shouldNotifyAboutClaimableRewards only fires when claimable total increases outside the cooldown", () => {
  assert.equal(
    shouldNotifyAboutClaimableRewards({
      nowMs: 50_000,
      previousTotal: 10n,
      nextTotal: 10n,
      lastNotifiedAtMs: null,
    }),
    false,
  );

  assert.equal(
    shouldNotifyAboutClaimableRewards({
      nowMs: 50_000,
      previousTotal: 10n,
      nextTotal: 15n,
      lastNotifiedAtMs: 30_000,
      cooldownMs: 30_000,
    }),
    false,
  );

  assert.equal(
    shouldNotifyAboutClaimableRewards({
      nowMs: 70_000,
      previousTotal: 10n,
      nextTotal: 15n,
      lastNotifiedAtMs: 30_000,
      cooldownMs: 30_000,
    }),
    true,
  );
});
