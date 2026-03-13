import { buildWalletDisplaySummary, reconcileWalletDisplaySummary } from "./useWalletDisplaySummary";
import assert from "node:assert/strict";
import test from "node:test";

const MICRO = 1_000_000n;

test("buildWalletDisplaySummary initializes pending stake to zero", () => {
  const snapshot = buildWalletDisplaySummary(
    {
      liquidMicro: 700n * MICRO,
      votingStakedMicro: 300n * MICRO,
      submissionStakedMicro: 0n,
      frontendStakedMicro: 0n,
    },
    { updatedAt: 123 },
  );

  assert.equal(snapshot.pendingStakedMicro, 0n);
  assert.equal(snapshot.totalStakedMicro, 300n * MICRO);
  assert.equal(snapshot.totalMicro, 1000n * MICRO);
  assert.equal(snapshot.updatedAt, 123);
});

test("reconcileWalletDisplaySummary preserves the last coherent total while stake indexing catches up", () => {
  const current = buildWalletDisplaySummary(
    {
      liquidMicro: 850n * MICRO,
      votingStakedMicro: 150n * MICRO,
      submissionStakedMicro: 0n,
      frontendStakedMicro: 0n,
    },
    { updatedAt: 1_000 },
  );

  const raw = buildWalletDisplaySummary(
    {
      liquidMicro: 700n * MICRO,
      votingStakedMicro: 150n * MICRO,
      submissionStakedMicro: 0n,
      frontendStakedMicro: 0n,
    },
    { updatedAt: 2_000 },
  );

  const reconciled = reconcileWalletDisplaySummary(current, raw, 2_500);
  assert.ok(reconciled);
  assert.equal(reconciled.liquidMicro, 700n * MICRO);
  assert.equal(reconciled.pendingStakedMicro, 150n * MICRO);
  assert.equal(reconciled.totalStakedMicro, 300n * MICRO);
  assert.equal(reconciled.totalMicro, 1000n * MICRO);
});

test("reconcileWalletDisplaySummary clears pending stake once the fresh snapshot is coherent", () => {
  const current = buildWalletDisplaySummary(
    {
      liquidMicro: 700n * MICRO,
      votingStakedMicro: 150n * MICRO,
      submissionStakedMicro: 0n,
      frontendStakedMicro: 0n,
    },
    {
      pendingStakedMicro: 150n * MICRO,
      totalMicro: 1000n * MICRO,
      updatedAt: 3_000,
    },
  );

  const raw = buildWalletDisplaySummary(
    {
      liquidMicro: 700n * MICRO,
      votingStakedMicro: 300n * MICRO,
      submissionStakedMicro: 0n,
      frontendStakedMicro: 0n,
    },
    { updatedAt: 4_000 },
  );

  const reconciled = reconcileWalletDisplaySummary(current, raw, 4_100);
  assert.ok(reconciled);
  assert.equal(reconciled.pendingStakedMicro, 0n);
  assert.equal(reconciled.totalStakedMicro, 300n * MICRO);
  assert.equal(reconciled.totalMicro, 1000n * MICRO);
});

test("reconcileWalletDisplaySummary keeps the previous coherent snapshot when liquid rises before stake releases settle", () => {
  const current = buildWalletDisplaySummary(
    {
      liquidMicro: 700n * MICRO,
      votingStakedMicro: 300n * MICRO,
      submissionStakedMicro: 0n,
      frontendStakedMicro: 0n,
    },
    { updatedAt: 5_000 },
  );

  const raw = buildWalletDisplaySummary(
    {
      liquidMicro: 1000n * MICRO,
      votingStakedMicro: 300n * MICRO,
      submissionStakedMicro: 0n,
      frontendStakedMicro: 0n,
    },
    { updatedAt: 6_000 },
  );

  const reconciled = reconcileWalletDisplaySummary(current, raw, 6_100);
  assert.equal(reconciled, current);
});
