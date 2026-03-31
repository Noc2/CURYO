import { ROUND_STATE } from "@curyo/contracts/protocol";
import { and, asc, desc, eq, gte, lt, notInArray, sql } from "ponder";
import { db } from "ponder:api";
import { content, profile, round, tokenHolder, vote, voterCategoryStats, voterStats } from "ponder:schema";
import { resolveAccuracyLeaderboardWindow, type AccuracyLeaderboardSortBy } from "../leaderboard-utils.js";
import type { ApiApp } from "../shared.js";
import { jsonBig } from "../shared.js";
import { safeBigInt, safeLimit, safeOffset } from "../utils.js";

type OrderableExpression = Parameters<typeof desc>[0];

function getAccuracyLeaderboardOrderByExpressions(
  sortBy: AccuracyLeaderboardSortBy,
  metrics: {
    totalSettledVotes: OrderableExpression;
    totalWins: OrderableExpression;
    totalStakeWon: OrderableExpression;
    winRate: OrderableExpression;
    voter: OrderableExpression;
  },
) {
  const orderByExpressions = [];

  switch (sortBy) {
    case "settledVotes":
      orderByExpressions.push(desc(metrics.totalSettledVotes));
      break;
    case "wins":
      orderByExpressions.push(desc(metrics.totalWins));
      break;
    case "stakeWon":
      orderByExpressions.push(desc(metrics.totalStakeWon));
      break;
    case "winRate":
    default:
      break;
  }

  orderByExpressions.push(desc(metrics.winRate));

  if (sortBy !== "wins") {
    orderByExpressions.push(desc(metrics.totalWins));
  }
  if (sortBy !== "settledVotes") {
    orderByExpressions.push(desc(metrics.totalSettledVotes));
  }
  if (sortBy !== "stakeWon") {
    orderByExpressions.push(desc(metrics.totalStakeWon));
  }

  orderByExpressions.push(asc(metrics.voter));
  return orderByExpressions;
}

export function registerLeaderboardRoutes(app: ApiApp) {
  app.get("/leaderboard", async (c) => {
    const type = c.req.query("type") ?? "voters";
    const limit = safeLimit(c.req.query("limit"), 20, 100);

    let orderBy;
    switch (type) {
      case "creators":
        orderBy = desc(profile.totalContent);
        break;
      case "earners":
        orderBy = desc(profile.totalRewardsClaimed);
        break;
      case "voters":
      default:
        orderBy = desc(profile.totalVotes);
        break;
    }

    const profileItems = await db
      .select()
      .from(profile)
      .orderBy(orderBy)
      .limit(limit);

    const remaining = limit - profileItems.length;
    const profileAddresses = profileItems.map(item => item.address);
    let holderOnly: typeof profileItems = [];

    if (remaining > 0) {
      const holders = profileAddresses.length > 0
        ? await db.select().from(tokenHolder)
            .where(notInArray(tokenHolder.address, profileAddresses))
            .limit(remaining)
        : await db.select().from(tokenHolder).limit(remaining);

      holderOnly = holders.map(holder => ({
        address: holder.address,
        name: "",
        strategy: "",
        createdAt: holder.firstSeenAt,
        updatedAt: holder.firstSeenAt,
        totalVotes: 0,
        totalContent: 0,
        totalRewardsClaimed: 0n,
      }));
    }

    const items = [...profileItems, ...holderOnly];
    return jsonBig(c, { items, type });
  });

  app.get("/token-holders", async (c) => {
    const limit = safeLimit(c.req.query("limit"), 200, 500);
    const offset = safeOffset(c.req.query("offset"));
    if (Number.isNaN(offset)) return c.json({ error: "Invalid offset" }, 400);

    const items = await db
      .select()
      .from(tokenHolder)
      .orderBy(asc(tokenHolder.firstSeenAt), asc(tokenHolder.address))
      .limit(limit)
      .offset(offset);

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(tokenHolder);

    return jsonBig(c, {
      items,
      total: countResult?.count ?? 0,
      limit,
      offset,
    });
  });

  app.get("/accuracy-leaderboard", async (c) => {
    const categoryIdParam = c.req.query("categoryId");
    const sortByRaw = c.req.query("sortBy") ?? "winRate";
    const sortBy = (
      sortByRaw === "winRate"
      || sortByRaw === "wins"
      || sortByRaw === "stakeWon"
      || sortByRaw === "settledVotes"
    )
      ? sortByRaw
      : null;
    if (sortBy === null) return c.json({ error: "Invalid sortBy" }, 400);

    const windowBounds = resolveAccuracyLeaderboardWindow(c.req.query("window"));
    if (windowBounds === null) return c.json({ error: "Invalid window" }, 400);

    const minVotesParam = c.req.query("minVotes") ?? "3";
    const limit = safeLimit(c.req.query("limit"), 20, 100);
    const offset = safeOffset(c.req.query("offset"));
    if (Number.isNaN(offset)) return c.json({ error: "Invalid offset" }, 400);

    const minVotes = parseInt(minVotesParam);
    if (isNaN(minVotes) || minVotes < 1) return c.json({ error: "Invalid minVotes" }, 400);

    const categoryId = categoryIdParam ? safeBigInt(categoryIdParam) : null;
    if (categoryIdParam && categoryId === null) return c.json({ error: "Invalid categoryId" }, 400);

    const categoryWinRateExpr = sql<number>`CAST(${voterCategoryStats.totalWins} AS FLOAT) / ${voterCategoryStats.totalSettledVotes}`;
    const categoryOrderByExprs = getAccuracyLeaderboardOrderByExpressions(sortBy, {
      totalSettledVotes: voterCategoryStats.totalSettledVotes,
      totalWins: voterCategoryStats.totalWins,
      totalStakeWon: voterCategoryStats.totalStakeWon,
      winRate: categoryWinRateExpr,
      voter: voterCategoryStats.voter,
    });
    const overallWinRateExpr = sql<number>`CAST(${voterStats.totalWins} AS FLOAT) / ${voterStats.totalSettledVotes}`;
    const overallOrderByExprs = getAccuracyLeaderboardOrderByExpressions(sortBy, {
      totalSettledVotes: voterStats.totalSettledVotes,
      totalWins: voterStats.totalWins,
      totalStakeWon: voterStats.totalStakeWon,
      winRate: overallWinRateExpr,
      voter: voterStats.voter,
    });

    if (windowBounds.window !== "all" && windowBounds.startsAt !== null && windowBounds.endsAt !== null) {
      const aggregateTotalSettledVotes = sql<number>`count(*)`;
      const aggregateTotalWins = sql<number>`sum(case when ${vote.isUp} = ${round.upWins} then 1 else 0 end)`;
      const aggregateTotalLosses = sql<number>`sum(case when ${vote.isUp} = ${round.upWins} then 0 else 1 end)`;
      const aggregateTotalStakeWon =
        sql<bigint>`coalesce(sum(case when ${vote.isUp} = ${round.upWins} then ${vote.stake} else 0 end), 0)`;
      const aggregateTotalStakeLost =
        sql<bigint>`coalesce(sum(case when ${vote.isUp} = ${round.upWins} then 0 else ${vote.stake} end), 0)`;
      const aggregateWinRate = sql<number>`CAST(${aggregateTotalWins} AS FLOAT) / ${aggregateTotalSettledVotes}`;
      const aggregateSelection = {
        voter: vote.voter,
        totalSettledVotes: aggregateTotalSettledVotes,
        totalWins: aggregateTotalWins,
        totalLosses: aggregateTotalLosses,
        totalStakeWon: aggregateTotalStakeWon,
        totalStakeLost: aggregateTotalStakeLost,
        winRate: aggregateWinRate,
        profileName: profile.name,
      };
      const windowedOrderByExprs = getAccuracyLeaderboardOrderByExpressions(sortBy, {
        totalSettledVotes: aggregateTotalSettledVotes,
        totalWins: aggregateTotalWins,
        totalStakeWon: aggregateTotalStakeWon,
        winRate: aggregateWinRate,
        voter: vote.voter,
      });

      const baseConditions = [
        eq(vote.revealed, true),
        eq(round.state, ROUND_STATE.Settled),
        gte(round.settledAt, windowBounds.startsAt),
        lt(round.settledAt, windowBounds.endsAt),
      ];

      const rows = categoryId !== null
        ? await db
            .select(aggregateSelection)
            .from(vote)
            .innerJoin(
              round,
              and(eq(vote.contentId, round.contentId), eq(vote.roundId, round.roundId)),
            )
            .innerJoin(content, eq(vote.contentId, content.id))
            .leftJoin(profile, eq(vote.voter, profile.address))
            .where(and(...baseConditions, eq(content.categoryId, categoryId)))
            .groupBy(vote.voter, profile.name)
            .having(sql`count(*) >= ${minVotes}`)
            .orderBy(...windowedOrderByExprs)
            .limit(limit)
            .offset(offset)
        : await db
            .select(aggregateSelection)
            .from(vote)
            .innerJoin(
              round,
              and(eq(vote.contentId, round.contentId), eq(vote.roundId, round.roundId)),
            )
            .leftJoin(profile, eq(vote.voter, profile.address))
            .where(and(...baseConditions))
            .groupBy(vote.voter, profile.name)
            .having(sql`count(*) >= ${minVotes}`)
            .orderBy(...windowedOrderByExprs)
            .limit(limit)
            .offset(offset);

      const items = rows.map((row) => ({
        voter: row.voter,
        totalSettledVotes: Number(row.totalSettledVotes),
        totalWins: Number(row.totalWins),
        totalLosses: Number(row.totalLosses),
        totalStakeWon: typeof row.totalStakeWon === "bigint" ? row.totalStakeWon : BigInt(row.totalStakeWon ?? 0),
        totalStakeLost: typeof row.totalStakeLost === "bigint" ? row.totalStakeLost : BigInt(row.totalStakeLost ?? 0),
        profileName: row.profileName,
        winRate: Number(row.winRate),
      }));

      return jsonBig(c, {
        items,
        categoryId: categoryIdParam,
        window: windowBounds.window,
        startsAt: windowBounds.startsAt,
        endsAt: windowBounds.endsAt,
      });
    }

    if (categoryId !== null) {
      const items = await db
        .select({
          voter: voterCategoryStats.voter,
          totalSettledVotes: voterCategoryStats.totalSettledVotes,
          totalWins: voterCategoryStats.totalWins,
          totalLosses: voterCategoryStats.totalLosses,
          totalStakeWon: voterCategoryStats.totalStakeWon,
          totalStakeLost: voterCategoryStats.totalStakeLost,
          profileName: profile.name,
        })
        .from(voterCategoryStats)
        .leftJoin(profile, eq(voterCategoryStats.voter, profile.address))
        .where(
          and(
            eq(voterCategoryStats.categoryId, categoryId),
            gte(voterCategoryStats.totalSettledVotes, minVotes),
          ),
        )
        .orderBy(...categoryOrderByExprs)
        .limit(limit)
        .offset(offset);

      const result = items.map(item => ({
        ...item,
        winRate: item.totalSettledVotes > 0 ? item.totalWins / item.totalSettledVotes : 0,
      }));

      return jsonBig(c, {
        items: result,
        categoryId: categoryIdParam,
        window: windowBounds.window,
        startsAt: null,
        endsAt: null,
      });
    }

    const items = await db
      .select({
        voter: voterStats.voter,
        totalSettledVotes: voterStats.totalSettledVotes,
        totalWins: voterStats.totalWins,
        totalLosses: voterStats.totalLosses,
        totalStakeWon: voterStats.totalStakeWon,
        totalStakeLost: voterStats.totalStakeLost,
        currentStreak: voterStats.currentStreak,
        bestWinStreak: voterStats.bestWinStreak,
        profileName: profile.name,
      })
      .from(voterStats)
      .leftJoin(profile, eq(voterStats.voter, profile.address))
      .where(gte(voterStats.totalSettledVotes, minVotes))
      .orderBy(...overallOrderByExprs)
      .limit(limit)
      .offset(offset);

    const result = items.map(item => ({
      ...item,
      winRate: item.totalSettledVotes > 0 ? item.totalWins / item.totalSettledVotes : 0,
    }));

    return jsonBig(c, {
      items: result,
      window: windowBounds.window,
      startsAt: null,
      endsAt: null,
    });
  });
}
