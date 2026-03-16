import assert from "node:assert/strict";
import test from "node:test";
import type { ReputationAvatarPayload } from "~~/lib/avatar/avatarPayload";
import { buildOrbitalAvatarModel, renderOrbitalAvatarSvg } from "~~/lib/avatar/orbitalAvatar";

const NOW_SECONDS = 1_900_000_000;

function secondsAgo(days: number) {
  return String(NOW_SECONDS - days * 24 * 60 * 60);
}

function buildPayload(overrides?: Partial<ReputationAvatarPayload>): ReputationAvatarPayload {
  return {
    address: "0x1111111111111111111111111111111111111111",
    balance: "250000000",
    voterId: {
      tokenId: "1",
      mintedAt: "1700000000",
    },
    stats: {
      totalSettledVotes: 24,
      totalWins: 16,
      totalLosses: 8,
      currentStreak: 3,
      bestWinStreak: 6,
      winRate: 16 / 24,
    },
    streak: {
      currentDailyStreak: 5,
      bestDailyStreak: 8,
      totalActiveDays: 12,
      lastActiveDate: "2026-03-14",
      lastMilestoneDay: 7,
    },
    categories90d: [
      {
        categoryId: "1",
        categoryName: "Alpha",
        settledVotes90d: 12,
        wins90d: 9,
        losses90d: 3,
        stakeWon90d: "120000000",
        stakeLost90d: "30000000",
        totalStake90d: "150000000",
        winRate90d: 0.75,
        lastSettledAt: secondsAgo(4),
      },
    ],
    ...overrides,
  };
}

test("orb-flare avatars vary by address color and composition rotation", () => {
  const modelA = buildOrbitalAvatarModel(buildPayload({ address: "0x0000000000000000000000000000000000ff3300" }), {
    nowSeconds: NOW_SECONDS,
  });
  const modelB = buildOrbitalAvatarModel(buildPayload({ address: "0x00000000000000000000000000000000003366ff" }), {
    nowSeconds: NOW_SECONDS,
  });

  assert.notEqual(modelA.compositionRotation, modelB.compositionRotation);
  assert.notEqual(modelA.planet?.midColor, modelB.planet?.midColor);
  assert.equal(modelA.flare?.rotationDegrees, -90);
  assert.equal(modelB.flare?.rotationDegrees, -90);
});

test("orb size saturates at extreme cREP balances", () => {
  const capped = buildOrbitalAvatarModel(
    buildPayload({
      balance: "100000000000",
    }),
    { nowSeconds: NOW_SECONDS },
  );
  const extreme = buildOrbitalAvatarModel(
    buildPayload({
      balance: "1000000000000",
    }),
    { nowSeconds: NOW_SECONDS },
  );

  assert.equal(extreme.planet?.radius, capped.planet?.radius);
});

test("low cREP balances stay visibly smaller", () => {
  const lowBalance = buildOrbitalAvatarModel(
    buildPayload({
      balance: "10000000",
    }),
    { nowSeconds: NOW_SECONDS },
  );
  const mediumBalance = buildOrbitalAvatarModel(
    buildPayload({
      balance: "250000000",
    }),
    { nowSeconds: NOW_SECONDS },
  );

  assert.ok(lowBalance.planet);
  assert.ok(mediumBalance.planet);
  assert.ok(mediumBalance.planet.radius - lowBalance.planet.radius >= 10);
});

test("accuracy directly controls flare orbit coverage", () => {
  const half = buildOrbitalAvatarModel(
    buildPayload({
      stats: {
        totalSettledVotes: 48,
        totalWins: 24,
        totalLosses: 24,
        currentStreak: 1,
        bestWinStreak: 3,
        winRate: 0.5,
      },
    }),
    { nowSeconds: NOW_SECONDS },
  );
  const full = buildOrbitalAvatarModel(
    buildPayload({
      stats: {
        totalSettledVotes: 48,
        totalWins: 48,
        totalLosses: 0,
        currentStreak: 6,
        bestWinStreak: 10,
        winRate: 1,
      },
    }),
    { nowSeconds: NOW_SECONDS },
  );

  assert.ok(half.flare);
  assert.ok(full.flare);
  assert.equal(half.flare.sweepDegrees, 180);
  assert.equal(half.flare.rotationDegrees, -90);
  assert.equal(half.flare.headAngleDegrees, 90);
  assert.equal(full.flare.sweepDegrees, 360);
  assert.equal(full.flare.rotationDegrees, -90);
});

test("confidence changes flare strength without changing its arc length", () => {
  const lowConfidence = buildOrbitalAvatarModel(
    buildPayload({
      stats: {
        totalSettledVotes: 2,
        totalWins: 1,
        totalLosses: 1,
        currentStreak: 0,
        bestWinStreak: 1,
        winRate: 0.5,
      },
    }),
    { nowSeconds: NOW_SECONDS },
  );
  const highConfidence = buildOrbitalAvatarModel(
    buildPayload({
      stats: {
        totalSettledVotes: 60,
        totalWins: 30,
        totalLosses: 30,
        currentStreak: 0,
        bestWinStreak: 4,
        winRate: 0.5,
      },
    }),
    { nowSeconds: NOW_SECONDS },
  );

  assert.ok(lowConfidence.flare);
  assert.ok(highConfidence.flare);
  assert.equal(lowConfidence.flare.sweepDegrees, highConfidence.flare.sweepDegrees);
  assert.ok(highConfidence.flare.opacity > lowConfidence.flare.opacity);
  assert.equal(highConfidence.flare.width, lowConfidence.flare.width);
  assert.equal(highConfidence.flare.glowWidth, lowConfidence.flare.glowWidth);
  assert.equal(highConfidence.flare.headRadius, lowConfidence.flare.headRadius);
});

test("flare start angle stays at the top for every address", () => {
  const first = buildOrbitalAvatarModel(
    buildPayload({
      address: "0x1111111111111111111111111111111111111111",
      stats: {
        totalSettledVotes: 24,
        totalWins: 12,
        totalLosses: 12,
        currentStreak: 0,
        bestWinStreak: 2,
        winRate: 0.5,
      },
    }),
    { nowSeconds: NOW_SECONDS },
  );
  const second = buildOrbitalAvatarModel(
    buildPayload({
      address: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      stats: {
        totalSettledVotes: 24,
        totalWins: 12,
        totalLosses: 12,
        currentStreak: 0,
        bestWinStreak: 2,
        winRate: 0.5,
      },
    }),
    { nowSeconds: NOW_SECONDS },
  );

  assert.ok(first.flare);
  assert.ok(second.flare);
  assert.equal(first.flare.rotationDegrees, -90);
  assert.equal(second.flare.rotationDegrees, -90);
  assert.equal(first.flare.headAngleDegrees, 90);
  assert.equal(second.flare.headAngleDegrees, 90);
});

test("accuracy of zero removes the flare entirely", () => {
  const model = buildOrbitalAvatarModel(
    buildPayload({
      stats: {
        totalSettledVotes: 48,
        totalWins: 0,
        totalLosses: 48,
        currentStreak: 0,
        bestWinStreak: 0,
        winRate: 0,
      },
    }),
    { nowSeconds: NOW_SECONDS },
  );

  assert.equal(model.flare, null);
});

test("unclaimed wallets render an empty shell instead of an orb", () => {
  const model = buildOrbitalAvatarModel(
    buildPayload({
      voterId: null,
      stats: null,
      categories90d: [],
      balance: "0",
    }),
    { nowSeconds: NOW_SECONDS },
  );

  assert.equal(model.planet, null);
  assert.equal(model.orbit, null);
  assert.equal(model.flare, null);
  assert.ok(model.shellOrbit);
});

test("renderer returns svg markup for the orb-flare avatar", () => {
  const svg = renderOrbitalAvatarSvg(buildPayload(), { nowSeconds: NOW_SECONDS, size: 64 });

  assert.match(svg, /orbital-avatar-body-/);
  assert.match(svg, /orbital-avatar-flare-/);
  assert.match(svg, /<svg[^>]+width="64"/);
});

test("renderer emits valid fold-sheen gradient markup", () => {
  const svg = renderOrbitalAvatarSvg(buildPayload(), { nowSeconds: NOW_SECONDS, size: 64 });

  assert.match(svg, /<linearGradient id="orbital-avatar-fold-sheen-[^"]+"/);
  assert.match(svg, /<\/linearGradient>/);
  assert.doesNotMatch(svg, /<linearGradient id="orbital-avatar-fold-sheen-[^"]+"[\s\S]*<\/radialGradient>/);
});
