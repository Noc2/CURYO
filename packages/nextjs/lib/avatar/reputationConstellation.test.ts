import assert from "node:assert/strict";
import test from "node:test";
import {
  type ReputationAvatarPayload,
  buildReputationConstellationModel,
  renderReputationConstellationSvg,
} from "~~/lib/avatar/reputationConstellation";

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

test("constellation model keeps the triad connected to category stars and caps categories at five", () => {
  const model = buildReputationConstellationModel(buildPayload(), { nowSeconds: NOW_SECONDS });

  assert.equal(model.coreNodes.length, 3);
  assert.equal(model.categoryNodes.length, 5);

  for (const node of model.categoryNodes) {
    const anchorEdge = model.edges.find(edge => edge.from === node.id && edge.to === node.anchorId);
    assert.ok(anchorEdge, `missing anchor edge for ${node.id}`);
    assert.ok(
      model.coreNodes.some(coreNode => coreNode.id === node.anchorId),
      `missing core anchor for ${node.id}`,
    );
  }
});

test("wallets without a claimed voter id render without the center triad", () => {
  const model = buildReputationConstellationModel(
    buildPayload({
      voterId: null,
      categories90d: [],
      stats: null,
      balance: "0",
    }),
    { nowSeconds: NOW_SECONDS },
  );

  assert.equal(model.coreNodes.length, 0);
  assert.equal(model.categoryNodes.length, 0);
  assert.equal(model.edges.length, 0);
});

test("constellation model fades out stale categories after ninety days", () => {
  const model = buildReputationConstellationModel(
    buildPayload({
      categories90d: [
        {
          categoryId: "9",
          categoryName: "Dormant",
          settledVotes90d: 14,
          wins90d: 11,
          losses90d: 3,
          stakeWon90d: "180000000",
          stakeLost90d: "20000000",
          totalStake90d: "200000000",
          winRate90d: 11 / 14,
          lastSettledAt: secondsAgo(95),
        },
      ],
    }),
    { nowSeconds: NOW_SECONDS },
  );

  assert.equal(model.categoryNodes.length, 0);
  assert.equal(model.edges.length, 3);
});

test("core radii grow with stronger balance, accuracy, and participation", () => {
  const lowSignalModel = buildReputationConstellationModel(
    buildPayload({
      balance: "0",
      stats: {
        totalSettledVotes: 0,
        totalWins: 0,
        totalLosses: 0,
        currentStreak: 0,
        bestWinStreak: 0,
        winRate: 0,
      },
      categories90d: [],
    }),
    { nowSeconds: NOW_SECONDS },
  );

  const highSignalModel = buildReputationConstellationModel(
    buildPayload({
      balance: "150000000000",
      stats: {
        totalSettledVotes: 200,
        totalWins: 150,
        totalLosses: 50,
        currentStreak: 12,
        bestWinStreak: 18,
        winRate: 0.75,
      },
      categories90d: [],
    }),
    { nowSeconds: NOW_SECONDS },
  );

  assert.ok(highSignalModel.coreNodes[0].radius > lowSignalModel.coreNodes[0].radius);
  assert.ok(highSignalModel.coreNodes[1].radius > lowSignalModel.coreNodes[1].radius);
  assert.ok(highSignalModel.coreNodes[2].radius > lowSignalModel.coreNodes[2].radius);
});

test("claimed wallets with the same scores still render distinct deterministic avatars", () => {
  const payloadA = buildPayload({
    address: "0x1111111111111111111111111111111111111111",
    categories90d: [],
  });
  const payloadB = buildPayload({
    address: "0x2222222222222222222222222222222222222222",
    categories90d: [],
  });

  const svgA = renderReputationConstellationSvg(payloadA, { nowSeconds: NOW_SECONDS, size: 64 });
  const svgB = renderReputationConstellationSvg(payloadB, { nowSeconds: NOW_SECONDS, size: 64 });

  assert.notEqual(svgA, svgB);
  const modelA = buildReputationConstellationModel(payloadA, { nowSeconds: NOW_SECONDS });
  const modelB = buildReputationConstellationModel(payloadB, { nowSeconds: NOW_SECONDS });
  assert.notEqual(
    `${modelA.backgroundStart}/${modelA.backgroundMid}/${modelA.backgroundEnd}`,
    `${modelB.backgroundStart}/${modelB.backgroundMid}/${modelB.backgroundEnd}`,
  );
  assert.match(svgA, /linearGradient id="avatar-bg-/);
  assert.match(svgB, /linearGradient id="avatar-bg-/);
});

test("address backgrounds span visibly different dark color families", () => {
  const addresses = [
    "0x1111111111111111111111111111111111111111",
    "0x2222222222222222222222222222222222222222",
    "0x3333333333333333333333333333333333333333",
    "0x4444444444444444444444444444444444444444",
    "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
    "0x1234567890abcdef1234567890abcdef12345678",
  ];

  const starts = new Set(
    addresses.map(
      address =>
        buildReputationConstellationModel(buildPayload({ address, categories90d: [] }), { nowSeconds: NOW_SECONDS })
          .backgroundStart,
    ),
  );

  assert.ok(starts.size >= 5);
});

test("renderer returns svg markup for a deterministic payload", () => {
  const svg = renderReputationConstellationSvg(buildPayload(), {
    nowSeconds: NOW_SECONDS,
    size: 64,
  });

  assert.match(svg, /^<svg[\s\S]*<\/svg>$/);
  assert.match(svg, /circle/);
  assert.doesNotMatch(svg, /<line /);
  assert.match(svg, /radialGradient/);
  assert.match(svg, /avatar-node-core-/);
  assert.match(svg, /avatar-node-glow-/);
});
