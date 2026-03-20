import { ROUND_STATE } from "@curyo/contracts/protocol";
import { and, asc, desc, eq, inArray, sql } from "ponder";
import { db } from "ponder:api";
import { category, content, profile, ratingChange, rewardClaim, round, vote } from "ponder:schema";
import type { ApiApp } from "../shared.js";
import { attachOpenRoundSummary, jsonBig, parseBigIntList } from "../shared.js";
import { getUrlLookupCandidates, isValidAddress, safeBigInt, safeLimit, safeOffset } from "../utils.js";

export function registerContentRoutes(app: ApiApp) {
  app.get("/content", async (c) => {
    const categoryId = c.req.query("categoryId");
    const contentIds = parseBigIntList(c.req.query("contentIds"), 500);
    const search = c.req.query("search")?.trim().toLowerCase();
    const status = c.req.query("status") ?? "0";
    const submitter = c.req.query("submitter");
    const sortBy = c.req.query("sortBy") ?? "newest";
    const limit = safeLimit(c.req.query("limit"), 50, 200);
    const offset = safeOffset(c.req.query("offset"));

    const conditions = [];
    if (status !== "all") {
      const parsed = parseInt(status);
      if (isNaN(parsed)) return c.json({ error: "Invalid status filter" }, 400);
      conditions.push(eq(content.status, parsed));
    }
    if (categoryId) {
      const parsed = safeBigInt(categoryId);
      if (parsed === null) return c.json({ error: "Invalid categoryId" }, 400);
      conditions.push(eq(content.categoryId, parsed));
    }
    if (contentIds.length > 0) {
      conditions.push(inArray(content.id, contentIds));
    }
    if (submitter) {
      if (!isValidAddress(submitter)) return c.json({ error: "Invalid submitter address" }, 400);
      conditions.push(eq(content.submitter, submitter.toLowerCase() as `0x${string}`));
    }
    if (search) {
      const pattern = `%${search}%`;
      conditions.push(
        sql<boolean>`(
          lower(${content.title}) like ${pattern}
          or lower(${content.description}) like ${pattern}
          or lower(${content.url}) like ${pattern}
          or lower(${content.tags}) like ${pattern}
        )`,
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    let orderBy;
    switch (sortBy) {
      case "oldest":
        orderBy = asc(content.createdAt);
        break;
      case "highest_rated":
        orderBy = desc(content.rating);
        break;
      case "lowest_rated":
        orderBy = asc(content.rating);
        break;
      case "most_votes":
        orderBy = desc(content.totalVotes);
        break;
      case "newest":
      default:
        orderBy = desc(content.createdAt);
        break;
    }

    const items = await db
      .select()
      .from(content)
      .where(where)
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset);

    const itemsWithOpenRound = await attachOpenRoundSummary(items);

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(content)
      .where(where);

    return jsonBig(c, {
      items: itemsWithOpenRound,
      total: countResult?.count ?? 0,
      limit,
      offset,
    });
  });

  app.get("/content/by-url", async (c) => {
    const url = c.req.query("url");
    if (!url) {
      return c.json({ error: "url parameter required" }, 400);
    }

    const candidates = getUrlLookupCandidates(url);
    if (!candidates) {
      return c.json({ error: "Invalid URL" }, 400);
    }

    const matches = await db
      .select()
      .from(content)
      .where(inArray(content.url, candidates))
      .orderBy(desc(content.createdAt))
      .limit(5);

    const item = matches[0];
    if (!item) {
      return c.json({ error: "Content not found" }, 404);
    }

    const [contentWithOpenRound] = await attachOpenRoundSummary([item]);

    const rounds = await db
      .select()
      .from(round)
      .where(eq(round.contentId, item.id))
      .orderBy(desc(round.roundId))
      .limit(20);

    const ratings = await db
      .select()
      .from(ratingChange)
      .where(eq(ratingChange.contentId, item.id))
      .orderBy(desc(ratingChange.timestamp))
      .limit(50);

    return jsonBig(c, {
      content: contentWithOpenRound,
      rounds,
      ratings,
      matchCount: matches.length,
    });
  });

  app.get("/content/:id", async (c) => {
    const id = safeBigInt(c.req.param("id"));
    if (id === null) return c.json({ error: "Invalid content id" }, 400);

    const [item] = await db
      .select()
      .from(content)
      .where(eq(content.id, id))
      .limit(1);

    if (!item) {
      return c.json({ error: "Content not found" }, 404);
    }

    const [contentWithOpenRound] = await attachOpenRoundSummary([item]);

    const rounds = await db
      .select()
      .from(round)
      .where(eq(round.contentId, id))
      .orderBy(desc(round.roundId))
      .limit(20);

    const ratings = await db
      .select()
      .from(ratingChange)
      .where(eq(ratingChange.contentId, id))
      .orderBy(desc(ratingChange.timestamp))
      .limit(50);

    return jsonBig(c, { content: contentWithOpenRound, rounds, ratings });
  });

  app.get("/rounds", async (c) => {
    const contentId = c.req.query("contentId");
    const stateFilter = c.req.query("state");
    const limit = safeLimit(c.req.query("limit"), 50, 200);
    const offset = safeOffset(c.req.query("offset"));

    const conditions = [];
    if (contentId) {
      const parsed = safeBigInt(contentId);
      if (parsed === null) return c.json({ error: "Invalid contentId" }, 400);
      conditions.push(eq(round.contentId, parsed));
    }
    if (stateFilter !== undefined) {
      const parsed = parseInt(stateFilter);
      if (isNaN(parsed)) return c.json({ error: "Invalid state filter" }, 400);
      conditions.push(eq(round.state, parsed));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const settledOnly = stateFilter !== undefined && parseInt(stateFilter) === ROUND_STATE.Settled;

    const items = await db
      .select({
        id: round.id,
        contentId: round.contentId,
        roundId: round.roundId,
        state: round.state,
        voteCount: round.voteCount,
        revealedCount: round.revealedCount,
        totalStake: round.totalStake,
        upPool: round.upPool,
        downPool: round.downPool,
        upCount: round.upCount,
        downCount: round.downCount,
        upWins: round.upWins,
        losingPool: round.losingPool,
        startTime: round.startTime,
        settledAt: round.settledAt,
        title: content.title,
        description: content.description,
        url: content.url,
        submitter: content.submitter,
        categoryId: content.categoryId,
      })
      .from(round)
      .leftJoin(content, eq(round.contentId, content.id))
      .where(where)
      .orderBy(
        settledOnly ? desc(round.settledAt) : desc(round.startTime),
        desc(round.contentId),
        desc(round.roundId),
      )
      .limit(limit)
      .offset(offset);

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(round)
      .where(where);

    return jsonBig(c, {
      items,
      total: countResult?.count ?? 0,
      limit,
      offset,
    });
  });

  app.get("/submission-stakes", async (c) => {
    const submitter = c.req.query("submitter");
    if (!submitter) {
      return c.json({ error: "submitter parameter required" }, 400);
    }
    if (!isValidAddress(submitter)) {
      return c.json({ error: "Invalid submitter address" }, 400);
    }

    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(content)
      .where(
        and(
          eq(content.submitter, submitter.toLowerCase() as `0x${string}`),
          eq(content.submitterStakeReturned, false),
        ),
      );

    return jsonBig(c, {
      activeCount: result?.count ?? 0,
      submitter: submitter.toLowerCase(),
    });
  });

  app.get("/voting-stakes", async (c) => {
    const voter = c.req.query("voter");
    if (!voter) {
      return c.json({ error: "voter parameter required" }, 400);
    }
    if (!isValidAddress(voter)) {
      return c.json({ error: "Invalid voter address" }, 400);
    }

    const voterAddr = voter.toLowerCase() as `0x${string}`;

    const [activeResult] = await db
      .select({
        total: sql<string>`coalesce(sum(${vote.stake}), 0)`,
        count: sql<number>`count(*)`,
      })
      .from(vote)
      .innerJoin(
        round,
        and(eq(vote.contentId, round.contentId), eq(vote.roundId, round.roundId)),
      )
      .where(
        and(eq(vote.voter, voterAddr), eq(round.state, ROUND_STATE.Open)),
      );

    return jsonBig(c, {
      activeStake: activeResult?.total ?? "0",
      activeCount: activeResult?.count ?? 0,
      voter: voterAddr,
    });
  });

  app.get("/categories", async (c) => {
    const statusFilter = c.req.query("status") ?? "1";

    let where;
    if (statusFilter !== "all") {
      const parsed = parseInt(statusFilter);
      if (isNaN(parsed)) return c.json({ error: "Invalid status filter" }, 400);
      where = eq(category.status, parsed);
    }

    const items = await db
      .select()
      .from(category)
      .where(where)
      .orderBy(asc(category.name))
      .limit(safeLimit(c.req.query("limit"), 100, 500))
      .offset(safeOffset(c.req.query("offset")));

    return jsonBig(c, { items });
  });

  app.get("/category-popularity", async (c) => {
    const items = await db
      .select({
        id: category.id,
        totalVotes: category.totalVotes,
      })
      .from(category)
      .where(eq(category.status, 1));

    const popularity: Record<string, number> = {};
    for (const item of items) {
      popularity[item.id.toString()] = item.totalVotes;
    }

    return jsonBig(c, popularity);
  });

  app.get("/profiles", async (c) => {
    const addressesParam = c.req.query("addresses");
    if (!addressesParam) {
      return c.json({ error: "addresses parameter required" }, 400);
    }

    const addresses = addressesParam
      .split(",")
      .slice(0, 50)
      .map((address) => address.trim().toLowerCase() as `0x${string}`)
      .filter((address) => isValidAddress(address));

    const items = await db
      .select()
      .from(profile)
      .where(inArray(profile.address, addresses));

    const profileMap: Record<string, (typeof items)[0]> = {};
    for (const item of items) {
      profileMap[item.address.toLowerCase()] = item;
    }

    return jsonBig(c, profileMap);
  });

  app.get("/profile/:address", async (c) => {
    const address = c.req.param("address").toLowerCase() as `0x${string}`;
    if (!isValidAddress(address)) {
      return c.json({ error: "Invalid address" }, 400);
    }

    const [item] = await db
      .select()
      .from(profile)
      .where(eq(profile.address, address))
      .limit(1);

    const [voteSummary] = await db
      .select({ count: sql<number>`count(*)` })
      .from(vote)
      .where(eq(vote.voter, address));

    const [contentSummary] = await db
      .select({ count: sql<number>`count(*)` })
      .from(content)
      .where(eq(content.submitter, address));

    const [rewardSummary] = await db
      .select({ total: sql<bigint>`coalesce(sum(${rewardClaim.crepReward}), 0)` })
      .from(rewardClaim)
      .where(eq(rewardClaim.voter, address));

    const recentVotes = await db
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
      .where(eq(vote.voter, address))
      .orderBy(desc(vote.committedAt))
      .limit(20);

    const recentRewards = await db
      .select()
      .from(rewardClaim)
      .where(eq(rewardClaim.voter, address))
      .orderBy(desc(rewardClaim.claimedAt))
      .limit(20);

    const recentSubmissions = await db
      .select({
        id: content.id,
        submitter: content.submitter,
        url: content.url,
        title: content.title,
        description: content.description,
        categoryId: content.categoryId,
        categoryName: category.name,
        status: content.status,
        rating: content.rating,
        createdAt: content.createdAt,
        totalVotes: content.totalVotes,
        totalRounds: content.totalRounds,
      })
      .from(content)
      .leftJoin(category, eq(content.categoryId, category.id))
      .where(eq(content.submitter, address))
      .orderBy(desc(content.createdAt))
      .limit(6);

    return jsonBig(c, {
      profile: item ?? null,
      summary: {
        totalVotes: item?.totalVotes ?? voteSummary?.count ?? 0,
        totalContent: item?.totalContent ?? contentSummary?.count ?? 0,
        totalRewardsClaimed: item?.totalRewardsClaimed ?? rewardSummary?.total ?? 0n,
      },
      recentVotes,
      recentRewards,
      recentSubmissions,
    });
  });
}
