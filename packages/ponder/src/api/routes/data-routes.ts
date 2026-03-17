import { ROUND_STATE } from "@curyo/contracts/protocol";
import { and, asc, desc, eq, gte, inArray, or, sql } from "ponder";
import { db } from "ponder:api";
import {
  category,
  content,
  frontend,
  globalStats,
  profile,
  rewardClaim,
  round,
  submitterRewardClaim,
  tokenTransfer,
  vote,
  voterCategoryStats,
  voterId,
  voterStats,
  voterStreak,
} from "ponder:schema";
import type { ApiApp } from "../shared.js";
import { AVATAR_CATEGORY_WINDOW_SECONDS, jsonBig } from "../shared.js";
import { isValidAddress, safeBigInt, safeLimit, safeOffset } from "../utils.js";

const STREAK_MILESTONES = [
  { days: 7, baseBonus: 10 },
  { days: 30, baseBonus: 50 },
  { days: 90, baseBonus: 200 },
];

export function registerDataRoutes(app: ApiApp) {
  app.get("/voter-accuracy/:address", async (c) => {
    const address = c.req.param("address").toLowerCase() as `0x${string}`;
    if (!isValidAddress(address)) return c.json({ error: "Invalid address" }, 400);

    const [stats] = await db
      .select()
      .from(voterStats)
      .where(eq(voterStats.voter, address))
      .limit(1);

    const categoryRows = await db
      .select({
        id: voterCategoryStats.id,
        voter: voterCategoryStats.voter,
        categoryId: voterCategoryStats.categoryId,
        totalSettledVotes: voterCategoryStats.totalSettledVotes,
        totalWins: voterCategoryStats.totalWins,
        totalLosses: voterCategoryStats.totalLosses,
        totalStakeWon: voterCategoryStats.totalStakeWon,
        totalStakeLost: voterCategoryStats.totalStakeLost,
        categoryName: category.name,
      })
      .from(voterCategoryStats)
      .leftJoin(category, eq(voterCategoryStats.categoryId, category.id))
      .where(eq(voterCategoryStats.voter, address));

    const statsWithRate = stats
      ? {
          ...stats,
          winRate: stats.totalSettledVotes > 0 ? stats.totalWins / stats.totalSettledVotes : 0,
        }
      : null;

    const categories = categoryRows.map(row => ({
      ...row,
      winRate: row.totalSettledVotes > 0 ? row.totalWins / row.totalSettledVotes : 0,
    }));

    return jsonBig(c, { stats: statsWithRate, categories });
  });

  app.get("/avatar/:address", async (c) => {
    const address = c.req.param("address").toLowerCase() as `0x${string}`;
    if (!isValidAddress(address)) return c.json({ error: "Invalid address" }, 400);

    const [stats, streak, voterIdRecord] = await Promise.all([
      db
        .select()
        .from(voterStats)
        .where(eq(voterStats.voter, address))
        .limit(1)
        .then(rows => rows[0] ?? null),
      db
        .select()
        .from(voterStreak)
        .where(eq(voterStreak.voter, address))
        .limit(1)
        .then(rows => rows[0] ?? null),
      db
        .select({
          tokenId: voterId.tokenId,
          mintedAt: voterId.mintedAt,
        })
        .from(voterId)
        .where(and(eq(voterId.holder, address), eq(voterId.revoked, false)))
        .limit(1)
        .then(rows => rows[0] ?? null),
    ]);

    const categoryCutoff = BigInt(Math.max(0, Math.floor(Date.now() / 1000) - AVATAR_CATEGORY_WINDOW_SECONDS));
    const categoryRows = await db
      .select({
        categoryId: content.categoryId,
        categoryName: category.name,
        settledVotes90d: sql<number>`count(*)`,
        wins90d: sql<number>`sum(case when ${vote.isUp} = ${round.upWins} then 1 else 0 end)`,
        losses90d: sql<number>`sum(case when ${vote.isUp} = ${round.upWins} then 0 else 1 end)`,
        stakeWon90d: sql<bigint>`coalesce(sum(case when ${vote.isUp} = ${round.upWins} then ${vote.stake} else 0 end), 0)`,
        stakeLost90d: sql<bigint>`coalesce(sum(case when ${vote.isUp} = ${round.upWins} then 0 else ${vote.stake} end), 0)`,
        lastSettledAt: sql<bigint>`max(${round.settledAt})`,
      })
      .from(vote)
      .innerJoin(
        round,
        and(eq(vote.contentId, round.contentId), eq(vote.roundId, round.roundId)),
      )
      .innerJoin(content, eq(vote.contentId, content.id))
      .leftJoin(category, eq(content.categoryId, category.id))
      .where(
        and(
          eq(vote.voter, address),
          eq(vote.revealed, true),
          eq(round.state, ROUND_STATE.Settled),
          gte(round.settledAt, categoryCutoff),
        ),
      )
      .groupBy(content.categoryId, category.name);

    const statsWithRate = stats
      ? {
          ...stats,
          winRate: stats.totalSettledVotes > 0 ? stats.totalWins / stats.totalSettledVotes : 0,
        }
      : null;

    const categories90d = categoryRows
      .map((row) => {
        const stakeWon = typeof row.stakeWon90d === "bigint" ? row.stakeWon90d : BigInt(row.stakeWon90d ?? 0);
        const stakeLost = typeof row.stakeLost90d === "bigint" ? row.stakeLost90d : BigInt(row.stakeLost90d ?? 0);
        const settledVotes = Number(row.settledVotes90d);
        const wins = Number(row.wins90d);
        const losses = Number(row.losses90d);
        return {
          categoryId: row.categoryId,
          categoryName: row.categoryName,
          settledVotes90d: settledVotes,
          wins90d: wins,
          losses90d: losses,
          stakeWon90d: stakeWon,
          stakeLost90d: stakeLost,
          totalStake90d: stakeWon + stakeLost,
          winRate90d: settledVotes > 0 ? wins / settledVotes : 0,
          lastSettledAt: row.lastSettledAt,
        };
      })
      .sort((a, b) => {
        if (b.settledVotes90d !== a.settledVotes90d) return b.settledVotes90d - a.settledVotes90d;
        if (a.categoryId < b.categoryId) return -1;
        if (a.categoryId > b.categoryId) return 1;
        return 0;
      });

    return jsonBig(c, {
      address,
      voterId: voterIdRecord,
      stats: statsWithRate,
      streak: streak ?? {
        currentDailyStreak: 0,
        bestDailyStreak: 0,
        totalActiveDays: 0,
        lastActiveDate: null,
        lastMilestoneDay: 0,
      },
      categories90d,
    });
  });

  app.get("/voter-stats-batch", async (c) => {
    const votersParam = c.req.query("voters");
    if (!votersParam) {
      return c.json({ error: "voters parameter required" }, 400);
    }

    const voters = votersParam
      .split(",")
      .slice(0, 50)
      .map((address) => address.trim().toLowerCase() as `0x${string}`)
      .filter((address) => isValidAddress(address));

    if (voters.length === 0) {
      return jsonBig(c, {});
    }

    const items = await db
      .select()
      .from(voterStats)
      .where(inArray(voterStats.voter, voters));

    const statsMap: Record<string, any> = {};
    for (const item of items) {
      statsMap[item.voter.toLowerCase()] = {
        ...item,
        winRate: item.totalSettledVotes > 0 ? item.totalWins / item.totalSettledVotes : 0,
      };
    }

    return jsonBig(c, statsMap);
  });

  app.get("/votes", async (c) => {
    const voterRaw = c.req.query("voter");
    const contentId = c.req.query("contentId");
    const roundId = c.req.query("roundId");
    const stateFilter = c.req.query("state");
    const limit = safeLimit(c.req.query("limit"), 50, 200);
    const offset = safeOffset(c.req.query("offset"));

    const conditions = [];
    if (voterRaw) {
      if (!isValidAddress(voterRaw)) return c.json({ error: "Invalid voter address" }, 400);
      conditions.push(eq(vote.voter, voterRaw.toLowerCase() as `0x${string}`));
    }
    if (contentId) {
      const parsed = safeBigInt(contentId);
      if (parsed === null) return c.json({ error: "Invalid contentId" }, 400);
      conditions.push(eq(vote.contentId, parsed));
    }
    if (roundId) {
      const parsed = safeBigInt(roundId);
      if (parsed === null) return c.json({ error: "Invalid roundId" }, 400);
      conditions.push(eq(vote.roundId, parsed));
    }
    if (stateFilter !== undefined) {
      const parsed = parseInt(stateFilter);
      if (isNaN(parsed)) return c.json({ error: "Invalid state filter" }, 400);
      conditions.push(eq(round.state, parsed));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const items = await db
      .select({
        id: vote.id,
        contentId: vote.contentId,
        roundId: vote.roundId,
        voter: vote.voter,
        isUp: vote.isUp,
        stake: vote.stake,
        epochIndex: vote.epochIndex,
        revealed: vote.revealed,
        committedAt: vote.committedAt,
        revealedAt: vote.revealedAt,
        roundStartTime: round.startTime,
        roundState: round.state,
        roundUpWins: round.upWins,
      })
      .from(vote)
      .leftJoin(
        round,
        and(eq(vote.contentId, round.contentId), eq(vote.roundId, round.roundId)),
      )
      .where(where)
      .orderBy(desc(vote.committedAt))
      .limit(limit)
      .offset(offset);

    const [countResult] = await db
      .select({
        settledTotal: sql<number>`sum(case when ${round.state} = ${ROUND_STATE.Settled} then 1 else 0 end)`,
        total: sql<number>`count(*)`,
      })
      .from(vote)
      .leftJoin(
        round,
        and(eq(vote.contentId, round.contentId), eq(vote.roundId, round.roundId)),
      )
      .where(where);

    return jsonBig(c, {
      items,
      total: countResult?.total ?? 0,
      settledTotal: countResult?.settledTotal ?? 0,
      limit,
      offset,
    });
  });

  app.get("/rewards", async (c) => {
    const voter = c.req.query("voter");
    const limit = safeLimit(c.req.query("limit"), 50, 200);

    if (!voter) {
      return c.json({ error: "voter parameter required" }, 400);
    }
    if (!isValidAddress(voter)) {
      return c.json({ error: "Invalid voter address" }, 400);
    }

    const items = await db
      .select()
      .from(rewardClaim)
      .where(eq(rewardClaim.voter, voter.toLowerCase() as `0x${string}`))
      .orderBy(desc(rewardClaim.claimedAt))
      .limit(limit);

    return jsonBig(c, { items });
  });

  app.get("/submitter-rewards", async (c) => {
    const submitter = c.req.query("submitter");
    const limit = safeLimit(c.req.query("limit"), 50, 200);

    if (!submitter) {
      return c.json({ error: "submitter parameter required" }, 400);
    }
    if (!isValidAddress(submitter)) {
      return c.json({ error: "Invalid submitter address" }, 400);
    }

    const items = await db
      .select()
      .from(submitterRewardClaim)
      .where(eq(submitterRewardClaim.submitter, submitter.toLowerCase() as `0x${string}`))
      .orderBy(desc(submitterRewardClaim.claimedAt))
      .limit(limit);

    return jsonBig(c, { items });
  });

  app.get("/balance-history", async (c) => {
    const address = c.req.query("address");
    if (!address) {
      return c.json({ error: "address parameter required" }, 400);
    }
    if (!isValidAddress(address)) {
      return c.json({ error: "Invalid address" }, 400);
    }

    const normalizedAddress = address.toLowerCase() as `0x${string}`;
    const limit = safeLimit(c.req.query("limit"), 500, 1000);

    const transfers = await db
      .select()
      .from(tokenTransfer)
      .where(or(eq(tokenTransfer.from, normalizedAddress), eq(tokenTransfer.to, normalizedAddress)))
      .orderBy(asc(tokenTransfer.blockNumber))
      .limit(limit);

    return jsonBig(c, { transfers, address: normalizedAddress });
  });

  app.get("/stats", async (c) => {
    const [stats] = await db
      .select()
      .from(globalStats)
      .where(eq(globalStats.id, "global"))
      .limit(1);

    return jsonBig(
      c,
      stats ?? {
        totalContent: 0,
        totalVotes: 0,
        totalRoundsSettled: 0,
        totalRewardsClaimed: "0",
        totalProfiles: 0,
        totalVoterIds: 0,
      },
    );
  });

  app.get("/frontends", async (c) => {
    const statusFilter = c.req.query("status") ?? "all";

    let where;
    if (statusFilter === "approved") {
      where = eq(frontend.approved, true);
    } else if (statusFilter === "slashed") {
      where = eq(frontend.slashed, true);
    } else if (statusFilter === "pending") {
      where = and(eq(frontend.approved, false), eq(frontend.slashed, false));
    }

    const items = await db
      .select()
      .from(frontend)
      .where(where)
      .limit(safeLimit(c.req.query("limit"), 100, 500))
      .offset(safeOffset(c.req.query("offset")));

    return jsonBig(c, { items });
  });

  app.get("/frontend/:address", async (c) => {
    const address = c.req.param("address").toLowerCase() as `0x${string}`;
    if (!isValidAddress(address)) return c.json({ error: "Invalid address" }, 400);

    const [item] = await db
      .select()
      .from(frontend)
      .where(eq(frontend.address, address))
      .limit(1);

    if (!item) {
      return c.json({ error: "Frontend not found" }, 404);
    }

    return jsonBig(c, { frontend: item });
  });

  app.get("/voter-ids", async (c) => {
    const holder = c.req.query("holder");
    const limit = safeLimit(c.req.query("limit"), 50, 200);

    let where;
    if (holder) {
      if (!isValidAddress(holder)) return c.json({ error: "Invalid holder address" }, 400);
      where = eq(voterId.holder, holder.toLowerCase() as `0x${string}`);
    }

    const items = await db.select().from(voterId).where(where).limit(limit);

    return jsonBig(c, { items });
  });

  app.get("/voter-streak", async (c) => {
    const voter = c.req.query("voter");
    if (!voter) {
      return c.json({ error: "voter parameter required" }, 400);
    }
    if (!isValidAddress(voter)) {
      return c.json({ error: "Invalid voter address" }, 400);
    }

    const voterAddr = voter.toLowerCase() as `0x${string}`;

    const [streak] = await db
      .select()
      .from(voterStreak)
      .where(eq(voterStreak.voter, voterAddr))
      .limit(1);

    if (!streak) {
      return jsonBig(c, {
        currentDailyStreak: 0,
        bestDailyStreak: 0,
        totalActiveDays: 0,
        lastActiveDate: null,
        lastMilestoneDay: 0,
        milestones: STREAK_MILESTONES,
        nextMilestone: STREAK_MILESTONES[0].days,
        nextMilestoneBaseBonus: STREAK_MILESTONES[0].baseBonus,
      });
    }

    const nextMilestone = STREAK_MILESTONES.find(milestone => milestone.days > streak.currentDailyStreak);

    return jsonBig(c, {
      currentDailyStreak: streak.currentDailyStreak,
      bestDailyStreak: streak.bestDailyStreak,
      totalActiveDays: streak.totalActiveDays,
      lastActiveDate: streak.lastActiveDate,
      lastMilestoneDay: streak.lastMilestoneDay,
      milestones: STREAK_MILESTONES,
      nextMilestone: nextMilestone?.days ?? null,
      nextMilestoneBaseBonus: nextMilestone?.baseBonus ?? null,
    });
  });
}
