import assert from "node:assert/strict";
import test from "node:test";
import { buildOrbitalAvatarModel, renderOrbitalAvatarSvg } from "~~/lib/avatar/orbitalAvatar";
import type { ReputationAvatarPayload } from "~~/lib/avatar/reputationConstellation";

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
      {
        categoryId: "2",
        categoryName: "Beta",
        settledVotes90d: 10,
        wins90d: 7,
        losses90d: 3,
        stakeWon90d: "90000000",
        stakeLost90d: "30000000",
        totalStake90d: "120000000",
        winRate90d: 0.7,
        lastSettledAt: secondsAgo(7),
      },
      {
        categoryId: "3",
        categoryName: "Gamma",
        settledVotes90d: 8,
        wins90d: 5,
        losses90d: 3,
        stakeWon90d: "60000000",
        stakeLost90d: "25000000",
        totalStake90d: "85000000",
        winRate90d: 0.625,
        lastSettledAt: secondsAgo(10),
      },
      {
        categoryId: "4",
        categoryName: "Delta",
        settledVotes90d: 7,
        wins90d: 4,
        losses90d: 3,
        stakeWon90d: "55000000",
        stakeLost90d: "25000000",
        totalStake90d: "80000000",
        winRate90d: 4 / 7,
        lastSettledAt: secondsAgo(14),
      },
      {
        categoryId: "5",
        categoryName: "Epsilon",
        settledVotes90d: 6,
        wins90d: 4,
        losses90d: 2,
        stakeWon90d: "50000000",
        stakeLost90d: "12000000",
        totalStake90d: "62000000",
        winRate90d: 4 / 6,
        lastSettledAt: secondsAgo(20),
      },
      {
        categoryId: "6",
        categoryName: "Zeta",
        settledVotes90d: 5,
        wins90d: 3,
        losses90d: 2,
        stakeWon90d: "45000000",
        stakeLost90d: "15000000",
        totalStake90d: "60000000",
        winRate90d: 0.6,
        lastSettledAt: secondsAgo(25),
      },
    ],
    ...overrides,
  };
}

test("orbital avatars vary by address color and frozen progress", () => {
  const modelA = buildOrbitalAvatarModel(buildPayload({ address: "0x0000000000000000000000000000000000ff3300" }), {
    nowSeconds: NOW_SECONDS,
  });
  const modelB = buildOrbitalAvatarModel(buildPayload({ address: "0x00000000000000000000000000000000003366ff" }), {
    nowSeconds: NOW_SECONDS,
  });

  assert.notEqual(modelA.compositionRotation, modelB.compositionRotation);
  assert.notEqual(modelA.coreOrb?.colorA, modelB.coreOrb?.colorA);
});

test("orbital core size saturates at extreme cREP balances", () => {
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

  assert.equal(extreme.coreOrb?.radius, capped.coreOrb?.radius);
});

test("orbital avatars do not render background stars", () => {
  const model = buildOrbitalAvatarModel(buildPayload(), { nowSeconds: NOW_SECONDS });
  assert.equal("backgroundStars" in model, false);
});

test("orbital accuracy ring stays bounded and elliptical", () => {
  const model = buildOrbitalAvatarModel(buildPayload(), { nowSeconds: NOW_SECONDS });

  assert.ok(model.accuracyRing);
  assert.equal(typeof model.accuracyRing.radiusX, "number");
  assert.equal(typeof model.accuracyRing.radiusY, "number");
  assert.ok(model.accuracyRing.radiusX > model.accuracyRing.radiusY);
});

test("orbital accuracy ring grows noticeably for high-accuracy profiles", () => {
  const lowAccuracy = buildOrbitalAvatarModel(
    buildPayload({
      stats: {
        totalSettledVotes: 48,
        totalWins: 22,
        totalLosses: 26,
        currentStreak: 1,
        bestWinStreak: 3,
        winRate: 22 / 48,
      },
    }),
    { nowSeconds: NOW_SECONDS },
  );
  const highAccuracy = buildOrbitalAvatarModel(
    buildPayload({
      stats: {
        totalSettledVotes: 48,
        totalWins: 41,
        totalLosses: 7,
        currentStreak: 6,
        bestWinStreak: 11,
        winRate: 41 / 48,
      },
    }),
    { nowSeconds: NOW_SECONDS },
  );

  assert.ok(lowAccuracy.accuracyRing);
  assert.ok(highAccuracy.accuracyRing);
  assert.ok(highAccuracy.accuracyRing.radiusX - lowAccuracy.accuracyRing.radiusX >= 20);
  assert.ok(highAccuracy.accuracyRing.radiusY - lowAccuracy.accuracyRing.radiusY >= 12);
});

test("unclaimed wallets render an empty shell instead of a filled orb", () => {
  const model = buildOrbitalAvatarModel(
    buildPayload({
      voterId: null,
      stats: null,
      categories90d: [],
      balance: "0",
    }),
    { nowSeconds: NOW_SECONDS },
  );

  assert.equal(model.coreOrb, null);
  assert.ok(model.shellOrbit);
});

test("renderer returns svg markup for the orbital avatar", () => {
  const svg = renderOrbitalAvatarSvg(buildPayload(), { nowSeconds: NOW_SECONDS, size: 64 });

  assert.match(svg, /orbital-avatar-body-/);
  assert.match(svg, /orbital-avatar-ring-/);
  assert.match(svg, /ellipse/);
  assert.match(svg, /clipPath/);
});
