import assert from "node:assert/strict";
import test from "node:test";
import type { ReputationAvatarPayload } from "~~/lib/avatar/avatarPayload";
import { buildSignalDiscAvatarModel, renderSignalDiscAvatarSvg } from "~~/lib/avatar/signalDiscAvatar";

const NOW_SECONDS = 1_900_000_000;

function secondsAgo(days: number) {
  return String(NOW_SECONDS - days * 24 * 60 * 60);
}

function buildPayload(overrides?: Partial<ReputationAvatarPayload>): ReputationAvatarPayload {
  return {
    address: "0x1111111111111111111111111111111111111111",
    balance: "250000000",
    avatarAccentHex: null,
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

test("signal-disc avatars vary the center color by address", () => {
  const modelA = buildSignalDiscAvatarModel(buildPayload({ address: "0x0000000000000000000000000000000000ff3300" }), {
    nowSeconds: NOW_SECONDS,
  });
  const modelB = buildSignalDiscAvatarModel(buildPayload({ address: "0x00000000000000000000000000000000003366ff" }), {
    nowSeconds: NOW_SECONDS,
  });

  assert.notEqual(modelA.core.color, modelB.core.color);
  assert.equal(modelA.progress?.startDegrees, -48);
  assert.equal(modelB.progress?.startDegrees, -48);
});

test("avatar accent override changes the center color", () => {
  const base = buildSignalDiscAvatarModel(buildPayload(), {
    nowSeconds: NOW_SECONDS,
  });
  const custom = buildSignalDiscAvatarModel(
    buildPayload({
      avatarAccentHex: "#00ccff",
    }),
    {
      nowSeconds: NOW_SECONDS,
    },
  );

  assert.notEqual(base.core.color, custom.core.color);
  assert.equal(custom.core.color, "#00ccff");
});

test("same avatar accent keeps the same center color across addresses", () => {
  const modelA = buildSignalDiscAvatarModel(
    buildPayload({
      address: "0x0000000000000000000000000000000000111111",
      avatarAccentHex: "#cc490f",
    }),
    {
      nowSeconds: NOW_SECONDS,
    },
  );
  const modelB = buildSignalDiscAvatarModel(
    buildPayload({
      address: "0x0000000000000000000000000000000000222222",
      avatarAccentHex: "#cc490f",
    }),
    {
      nowSeconds: NOW_SECONDS,
    },
  );

  assert.equal(modelA.core.color, modelB.core.color);
});

test("signal-disc geometry stays fixed across HREP balances", () => {
  const lowBalance = buildSignalDiscAvatarModel(
    buildPayload({
      balance: "10000000",
    }),
    { nowSeconds: NOW_SECONDS },
  );
  const highBalance = buildSignalDiscAvatarModel(
    buildPayload({
      balance: "1000000000000",
    }),
    { nowSeconds: NOW_SECONDS },
  );

  assert.equal(lowBalance.core.radius, highBalance.core.radius);
  assert.equal(lowBalance.progress?.radius, highBalance.progress?.radius);
  assert.equal(lowBalance.badgeRadius, highBalance.badgeRadius);
});

test("signal disc stays inside the square crop", () => {
  const model = buildSignalDiscAvatarModel(
    buildPayload({
      balance: "1000000000000",
      stats: {
        totalSettledVotes: 80,
        totalWins: 80,
        totalLosses: 0,
        currentStreak: 10,
        bestWinStreak: 10,
        winRate: 1,
      },
    }),
    { nowSeconds: NOW_SECONDS },
  );

  assert.ok(model.progress);
  assert.ok(model.badgeRadius < 256);
  assert.ok(model.progress.radius + model.progress.width / 2 < 256);
  assert.ok(model.core.radius < model.progress.radius - model.progress.width / 2);
});

test("accuracy directly controls white line coverage", () => {
  const half = buildSignalDiscAvatarModel(
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
  const full = buildSignalDiscAvatarModel(
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

  assert.ok(half.progress);
  assert.ok(full.progress);
  assert.equal(half.progress.sweepDegrees, 180);
  assert.equal(half.progress.startDegrees, -48);
  assert.equal(full.progress.sweepDegrees, 360);
  assert.equal(full.progress.startDegrees, -48);
});

test("confidence changes white line strength without changing arc length", () => {
  const lowConfidence = buildSignalDiscAvatarModel(
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
  const highConfidence = buildSignalDiscAvatarModel(
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

  assert.ok(lowConfidence.progress);
  assert.ok(highConfidence.progress);
  assert.equal(lowConfidence.progress.sweepDegrees, highConfidence.progress.sweepDegrees);
  assert.ok(highConfidence.progress.opacity > lowConfidence.progress.opacity);
  assert.equal(highConfidence.progress.width, lowConfidence.progress.width);
});

test("white line start angle stays logo-aligned for every address", () => {
  const first = buildSignalDiscAvatarModel(
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
  const second = buildSignalDiscAvatarModel(
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

  assert.ok(first.progress);
  assert.ok(second.progress);
  assert.equal(first.progress.startDegrees, -48);
  assert.equal(second.progress.startDegrees, -48);
});

test("renderer draws partial accuracy as a smooth white path", () => {
  const svg = renderSignalDiscAvatarSvg(buildPayload(), {
    size: 96,
    nowSeconds: NOW_SECONDS,
  });

  assert.match(svg, /<path class="signal-disc-avatar-progress" d="M [^"]+A [^"]+"/);
  assert.match(svg, /stroke="#FFFFFF"/);
  assert.doesNotMatch(svg, /orbital-avatar/);
  assert.doesNotMatch(svg, /flare/);
  assert.doesNotMatch(svg, /fold/);
});

test("renderer draws 100% accuracy as a full white circle", () => {
  const svg = renderSignalDiscAvatarSvg(
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
    { nowSeconds: NOW_SECONDS, size: 96 },
  );

  assert.match(svg, /<circle class="signal-disc-avatar-progress"[^>]+stroke="#FFFFFF"/);
  assert.doesNotMatch(svg, /<path class="signal-disc-avatar-progress"/);
});

test("accuracy of zero removes the white line entirely", () => {
  const model = buildSignalDiscAvatarModel(
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

  assert.equal(model.progress, null);
});

test("unclaimed wallets still render an address-colored center without accuracy", () => {
  const model = buildSignalDiscAvatarModel(
    buildPayload({
      voterId: null,
      stats: null,
      categories90d: [],
      balance: "0",
    }),
    { nowSeconds: NOW_SECONDS },
  );

  assert.ok(model.core.color);
  assert.equal(model.progress, null);
});

test("renderer returns svg markup for the no-accuracy fallback", () => {
  const svg = renderSignalDiscAvatarSvg(
    buildPayload({
      voterId: null,
      stats: null,
      categories90d: [],
      balance: "0",
    }),
    { nowSeconds: NOW_SECONDS, size: 64 },
  );

  assert.match(svg, /signal-disc-avatar-core/);
  assert.doesNotMatch(svg, /signal-disc-avatar-badge/);
  assert.doesNotMatch(svg, /fill="#05070B"/);
  assert.doesNotMatch(svg, /signal-disc-avatar-rail/);
  assert.doesNotMatch(svg, /signal-disc-avatar-progress/);
});

test("renderer returns svg markup for the signal-disc avatar", () => {
  const svg = renderSignalDiscAvatarSvg(buildPayload(), { nowSeconds: NOW_SECONDS, size: 64 });

  assert.doesNotMatch(svg, /signal-disc-avatar-badge/);
  assert.doesNotMatch(svg, /fill="#05070B"/);
  assert.match(svg, /signal-disc-avatar-core/);
  assert.match(svg, /signal-disc-avatar-progress/);
  assert.match(svg, /<svg[^>]+width="64"/);
});
