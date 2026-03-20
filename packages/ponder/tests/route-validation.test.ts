import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";

function createQueryBuilder<T>(result: T) {
  const builder = {
    from: vi.fn(() => builder),
    innerJoin: vi.fn(() => builder),
    leftJoin: vi.fn(() => builder),
    where: vi.fn(() => builder),
    groupBy: vi.fn(() => builder),
    having: vi.fn(() => builder),
    orderBy: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    offset: vi.fn(() => builder),
    then: (resolve: (value: T) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };

  return builder;
}

function mockPonderModules<T>(result: T) {
  const queryBuilder = createQueryBuilder(result);
  const db = {
    select: vi.fn(() => queryBuilder),
  };

  vi.doMock("ponder:api", () => ({ db }));
  vi.doMock("ponder", () => ({
    and: (...args: unknown[]) => ({ kind: "and", args }),
    asc: (expr: unknown) => ({ kind: "asc", expr }),
    desc: (expr: unknown) => ({ kind: "desc", expr }),
    eq: (...args: unknown[]) => ({ kind: "eq", args }),
    gte: (...args: unknown[]) => ({ kind: "gte", args }),
    inArray: (...args: unknown[]) => ({ kind: "inArray", args }),
    lt: (...args: unknown[]) => ({ kind: "lt", args }),
    notInArray: (...args: unknown[]) => ({ kind: "notInArray", args }),
    replaceBigInts: (data: unknown, replacer: (value: bigint) => unknown) =>
      JSON.parse(
        JSON.stringify(data, (_key, value) => (typeof value === "bigint" ? replacer(value) : value)),
      ),
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
      kind: "sql",
      strings: [...strings],
      values,
    }),
  }));
  vi.doMock("ponder:schema", () => ({
    category: {
      id: "category.id",
      name: "category.name",
      status: "category.status",
      totalVotes: "category.totalVotes",
    },
    content: {
      id: "content.id",
      categoryId: "content.categoryId",
      createdAt: "content.createdAt",
      description: "content.description",
      rating: "content.rating",
      status: "content.status",
      submitter: "content.submitter",
      tags: "content.tags",
      title: "content.title",
      totalVotes: "content.totalVotes",
      url: "content.url",
    },
    profile: {
      address: "profile.address",
      name: "profile.name",
      totalContent: "profile.totalContent",
      totalRewardsClaimed: "profile.totalRewardsClaimed",
      totalVotes: "profile.totalVotes",
    },
    ratingChange: {
      timestamp: "ratingChange.timestamp",
    },
    rewardClaim: {
      claimedAt: "rewardClaim.claimedAt",
    },
    round: {
      contentId: "round.contentId",
      downPool: "round.downPool",
      revealedCount: "round.revealedCount",
      roundId: "round.roundId",
      settledAt: "round.settledAt",
      startTime: "round.startTime",
      state: "round.state",
      totalStake: "round.totalStake",
      upPool: "round.upPool",
      upWins: "round.upWins",
      voteCount: "round.voteCount",
    },
    tokenHolder: {
      address: "tokenHolder.address",
      firstSeenAt: "tokenHolder.firstSeenAt",
    },
    vote: {
      committedAt: "vote.committedAt",
      contentId: "vote.contentId",
      isUp: "vote.isUp",
      revealed: "vote.revealed",
      roundId: "vote.roundId",
      stake: "vote.stake",
      voter: "vote.voter",
    },
    voterCategoryStats: {
      categoryId: "voterCategoryStats.categoryId",
      totalLosses: "voterCategoryStats.totalLosses",
      totalSettledVotes: "voterCategoryStats.totalSettledVotes",
      totalStakeLost: "voterCategoryStats.totalStakeLost",
      totalStakeWon: "voterCategoryStats.totalStakeWon",
      totalWins: "voterCategoryStats.totalWins",
      voter: "voterCategoryStats.voter",
    },
    voterStats: {
      bestWinStreak: "voterStats.bestWinStreak",
      currentStreak: "voterStats.currentStreak",
      totalLosses: "voterStats.totalLosses",
      totalSettledVotes: "voterStats.totalSettledVotes",
      totalStakeLost: "voterStats.totalStakeLost",
      totalStakeWon: "voterStats.totalStakeWon",
      totalWins: "voterStats.totalWins",
      voter: "voterStats.voter",
    },
  }));

  return { db, queryBuilder };
}

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe("registerContentRoutes", () => {
  it("rejects invalid content status filters before querying the database", async () => {
    const { db } = mockPonderModules([]);
    const { registerContentRoutes } = await import("../src/api/routes/content-routes.js");

    const app = new Hono();
    registerContentRoutes(app);

    const response = await app.request("http://localhost/content?status=foo");

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid status filter" });
    expect(db.select).not.toHaveBeenCalled();
  });
});

describe("registerLeaderboardRoutes", () => {
  it("pages bounded-window accuracy leaderboards at the database layer", async () => {
    const { queryBuilder } = mockPonderModules([]);
    const { registerLeaderboardRoutes } = await import("../src/api/routes/leaderboard-routes.js");

    const app = new Hono();
    registerLeaderboardRoutes(app);

    const response = await app.request("http://localhost/accuracy-leaderboard?window=7d&limit=50&offset=25");

    expect(response.status).toBe(200);
    expect(queryBuilder.orderBy).toHaveBeenCalled();
    expect(queryBuilder.limit).toHaveBeenCalledWith(50);
    expect(queryBuilder.offset).toHaveBeenCalledWith(25);
    expect(queryBuilder.limit).not.toHaveBeenCalledWith(1000);
  });
});
