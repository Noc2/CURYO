import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";

function serializeExpression(value: unknown) {
  return JSON.stringify(value, (_key, current) => (typeof current === "bigint" ? current.toString() : current));
}

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
    or: (...args: unknown[]) => ({ kind: "or", args }),
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
      domain: "category.domain",
      id: "category.id",
      name: "category.name",
      status: "category.status",
      totalVotes: "category.totalVotes",
    },
    content: {
      canonicalUrl: "content.canonicalUrl",
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
      urlHost: "content.urlHost",
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
  vi.unmock("../src/api/shared.js");
  vi.resetModules();
  vi.clearAllMocks();
});

function mockSharedModule() {
  vi.doMock("../src/api/shared.js", async () => {
    const actual = await vi.importActual<any>("../src/api/shared.js");
    return {
      ...actual,
      attachOpenRoundSummary: vi.fn(async (items: unknown[]) => items),
    };
  });
}

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

  it("returns empty results for short generic searches without querying the database", async () => {
    const { db } = mockPonderModules([]);
    mockSharedModule();
    const { registerContentRoutes } = await import("../src/api/routes/content-routes.js");

    const app = new Hono();
    registerContentRoutes(app);

    const response = await app.request("http://localhost/content?search=ai");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      items: [],
      total: 0,
      limit: 50,
      offset: 0,
      hasMore: false,
    });
    expect(db.select).not.toHaveBeenCalled();
  });

  it("uses bounded search pagination without running an exact count", async () => {
    const { db, queryBuilder } = mockPonderModules([{ id: 1n }]);
    mockSharedModule();
    const { registerContentRoutes } = await import("../src/api/routes/content-routes.js");

    const app = new Hono();
    registerContentRoutes(app);

    const response = await app.request("http://localhost/content?search=curyo&limit=5&offset=10");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(db.select).toHaveBeenCalledTimes(1);
    expect(queryBuilder.limit).toHaveBeenCalledWith(6);
    expect(body).toMatchObject({
      total: null,
      limit: 5,
      offset: 10,
      hasMore: false,
    });
  });

  it("uses full-text search conditions and relevance-first ordering", async () => {
    const { queryBuilder } = mockPonderModules([{ id: 1n }]);
    mockSharedModule();
    const { registerContentRoutes } = await import("../src/api/routes/content-routes.js");

    const app = new Hono();
    registerContentRoutes(app);

    const response = await app.request("http://localhost/content?search=radioactivity%20research&sortBy=relevance");

    expect(response.status).toBe(200);

    const whereArg = queryBuilder.where.mock.calls[0]?.[0];
    expect(serializeExpression(whereArg)).toContain("websearch_to_tsquery");

    const [firstOrderBy] = queryBuilder.orderBy.mock.calls[0] ?? [];
    expect(serializeExpression(firstOrderBy)).toContain("ts_rank_cd");
  });

  it("uses canonical url candidates for exact url searches", async () => {
    const { queryBuilder } = mockPonderModules([{ id: 1n }]);
    mockSharedModule();
    const { registerContentRoutes } = await import("../src/api/routes/content-routes.js");

    const app = new Hono();
    registerContentRoutes(app);

    const response = await app.request("http://localhost/content?search=https://Example.com:443/path?q=1#frag");

    expect(response.status).toBe(200);

    const whereArg = queryBuilder.where.mock.calls[0]?.[0];
    expect(serializeExpression(whereArg)).toContain("content.canonicalUrl");
    expect(serializeExpression(whereArg)).toContain("content.url");
    expect(serializeExpression(whereArg)).not.toContain("websearch_to_tsquery");
  });

  it("adds moderation predicates to content list queries before pagination", async () => {
    const { queryBuilder } = mockPonderModules([{ id: 1n }]);
    mockSharedModule();
    const { registerContentRoutes } = await import("../src/api/routes/content-routes.js");

    const app = new Hono();
    registerContentRoutes(app);

    const response = await app.request("http://localhost/content?status=all");

    expect(response.status).toBe(200);

    const whereArg = queryBuilder.where.mock.calls[0]?.[0];
    const serialized = serializeExpression(whereArg);

    expect(serialized).toContain("content.urlHost");
    expect(serialized).toContain("content.canonicalUrl");
    expect(serialized).toContain("content.title");
    expect(serialized).toContain("content.description");
    expect(serialized).toContain("content.tags");
  });

  it("adds moderation predicates to direct content lookups", async () => {
    const { queryBuilder } = mockPonderModules([{ id: 1n }]);
    mockSharedModule();
    const { registerContentRoutes } = await import("../src/api/routes/content-routes.js");

    const app = new Hono();
    registerContentRoutes(app);

    const response = await app.request("http://localhost/content/1");

    expect(response.status).toBe(200);

    const whereArg = queryBuilder.where.mock.calls[0]?.[0];
    const serialized = serializeExpression(whereArg);

    expect(serialized).toContain("content.id");
    expect(serialized).toContain("content.urlHost");
    expect(serialized).toContain("content.canonicalUrl");
  });

  it("filters categories with the moderation predicate", async () => {
    const { queryBuilder } = mockPonderModules([{ id: 1n }]);
    mockSharedModule();
    const { registerContentRoutes } = await import("../src/api/routes/content-routes.js");

    const app = new Hono();
    registerContentRoutes(app);

    const response = await app.request("http://localhost/categories?status=all");

    expect(response.status).toBe(200);

    const whereArg = queryBuilder.where.mock.calls[0]?.[0];
    const serialized = serializeExpression(whereArg);

    expect(serialized).toContain("category.domain");
    expect(serialized).toContain("category.name");
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

  it("rejects oversized offsets before querying the database", async () => {
    const { db } = mockPonderModules([]);
    const { registerLeaderboardRoutes } = await import("../src/api/routes/leaderboard-routes.js");

    const app = new Hono();
    registerLeaderboardRoutes(app);

    const response = await app.request("http://localhost/token-holders?offset=50001");

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid offset" });
    expect(db.select).not.toHaveBeenCalled();
  });
});

describe("registerDiscoveryRoutes", () => {
  it("adds moderation predicates to discover signals queries", async () => {
    const { queryBuilder } = mockPonderModules([]);
    const { registerDiscoveryRoutes } = await import("../src/api/routes/discovery-routes.js");

    const app = new Hono();
    registerDiscoveryRoutes(app);

    const response = await app.request(
      "http://localhost/discover-signals/0x0000000000000000000000000000000000000001?watched=1,2&followed=0x0000000000000000000000000000000000000002",
    );

    expect(response.status).toBe(200);

    const serializedWhereCalls = queryBuilder.where.mock.calls.map(([value]) => serializeExpression(value));
    expect(serializedWhereCalls.length).toBeGreaterThanOrEqual(4);
    expect(serializedWhereCalls.every(value => value.includes("content.title"))).toBe(true);
    expect(serializedWhereCalls.every(value => value.includes("content.description"))).toBe(true);
    expect(serializedWhereCalls.every(value => value.includes("content.urlHost"))).toBe(true);
    expect(serializedWhereCalls.every(value => value.includes("content.canonicalUrl"))).toBe(true);
    expect(serializedWhereCalls.every(value => value.includes("content.tags"))).toBe(true);
  });

  it("adds moderation predicates to notification event queries", async () => {
    const { queryBuilder } = mockPonderModules([]);
    const { registerDiscoveryRoutes } = await import("../src/api/routes/discovery-routes.js");

    const app = new Hono();
    registerDiscoveryRoutes(app);

    const response = await app.request(
      "http://localhost/notification-events/0x0000000000000000000000000000000000000001?watched=1,2&followed=0x0000000000000000000000000000000000000002",
    );

    expect(response.status).toBe(200);

    const serializedWhereCalls = queryBuilder.where.mock.calls.map(([value]) => serializeExpression(value));
    expect(serializedWhereCalls.length).toBeGreaterThanOrEqual(6);
    expect(serializedWhereCalls.every(value => value.includes("content.title"))).toBe(true);
    expect(serializedWhereCalls.every(value => value.includes("content.description"))).toBe(true);
    expect(serializedWhereCalls.every(value => value.includes("content.urlHost"))).toBe(true);
    expect(serializedWhereCalls.every(value => value.includes("content.canonicalUrl"))).toBe(true);
    expect(serializedWhereCalls.every(value => value.includes("content.tags"))).toBe(true);
  });

  it("adds moderation predicates to featured content queries", async () => {
    const { queryBuilder } = mockPonderModules([]);
    const { registerDiscoveryRoutes } = await import("../src/api/routes/discovery-routes.js");

    const app = new Hono();
    registerDiscoveryRoutes(app);

    const response = await app.request("http://localhost/featured-today?limit=6");

    expect(response.status).toBe(200);

    const serializedWhereCalls = queryBuilder.where.mock.calls.map(([value]) => serializeExpression(value));
    expect(serializedWhereCalls.length).toBe(2);
    expect(serializedWhereCalls.every(value => value.includes("content.title"))).toBe(true);
    expect(serializedWhereCalls.every(value => value.includes("content.description"))).toBe(true);
    expect(serializedWhereCalls.every(value => value.includes("content.urlHost"))).toBe(true);
    expect(serializedWhereCalls.every(value => value.includes("content.canonicalUrl"))).toBe(true);
    expect(serializedWhereCalls.every(value => value.includes("content.tags"))).toBe(true);
  });
});
