import { ROUND_STATE } from "@curyo/contracts/protocol";
import { aggregateProfileSelfReports } from "@curyo/node-utils/profileSelfReport";
import { and, asc, desc, eq, inArray, or, sql } from "ponder";
import { db } from "ponder:api";
import {
  category,
  content,
  contentMedia,
  feedbackBonusPool,
  profile,
  questionBundleReward,
  questionRewardPool,
  ratingChange,
  rewardClaim,
  round,
  vote,
} from "ponder:schema";
import { buildAllowedCategoryCondition, buildAllowedContentCondition } from "../moderation.js";
import type { ApiApp } from "../shared.js";
import { attachOpenRoundSummary, jsonBig, parseBigIntList } from "../shared.js";
import { getUrlLookupCandidates, isValidAddress, normalizeContentSearchQuery, safeBigInt, safeLimit, safeOffset } from "../utils.js";

function createContentSearchVector() {
  return sql`(
    setweight(to_tsvector('simple', coalesce(${content.title}, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(${content.tags}, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(${content.description}, '')), 'C')
  )`;
}

function buildContentSearchExpressions(search: string) {
  const vector = createContentSearchVector();
  const query = sql`websearch_to_tsquery('simple', ${search})`;
  const rank = sql<number>`ts_rank_cd(${vector}, ${query}, 32)`;

  return {
    condition: sql<boolean>`${vector} @@ ${query}`,
    rank,
  };
}

function getRewardAvailableAmount() {
  return sql<bigint>`coalesce((
    select sum(${questionRewardPool.unallocatedAmount} + ${questionRewardPool.allocatedAmount} - ${questionRewardPool.claimedAmount})
    from ${questionRewardPool}
    where ${questionRewardPool.contentId} = ${content.id}
  ), 0) + coalesce((
    select sum(${questionBundleReward.fundedAmount} - ${questionBundleReward.claimedAmount} - ${questionBundleReward.refundedAmount})
    from ${questionBundleReward}
    where ${questionBundleReward.id} = ${content.bundleId}
      and ${questionBundleReward.failed} = false
      and ${questionBundleReward.refunded} = false
  ), 0) + coalesce((
    select sum(${feedbackBonusPool.remainingAmount})
    from ${feedbackBonusPool}
    where ${feedbackBonusPool.contentId} = ${content.id}
      and ${feedbackBonusPool.forfeited} = false
  ), 0)`;
}

function getContentOrderBy(sortBy: string) {
  switch (sortBy) {
    case "oldest":
      return [asc(content.createdAt), asc(content.id)];
    case "highest_rewards":
      return [desc(getRewardAvailableAmount()), desc(content.createdAt), desc(content.id)];
    case "highest_rated":
      return [desc(content.ratingBps), desc(content.rating), desc(content.createdAt), desc(content.id)];
    case "lowest_rated":
      return [asc(content.ratingBps), asc(content.rating), desc(content.createdAt), desc(content.id)];
    case "most_votes":
      return [desc(content.totalVotes), desc(content.createdAt), desc(content.id)];
    case "newest":
    case "relevance":
    default:
      return [desc(content.createdAt), desc(content.id)];
  }
}

function getSearchOrderBy(searchRank: ReturnType<typeof sql<number>>, sortBy: string) {
  switch (sortBy) {
    case "oldest":
      return [desc(searchRank), asc(content.createdAt), asc(content.id)];
    case "highest_rewards":
      return [desc(searchRank), desc(getRewardAvailableAmount()), desc(content.createdAt), desc(content.id)];
    case "highest_rated":
      return [desc(searchRank), desc(content.ratingBps), desc(content.rating), desc(content.createdAt), desc(content.id)];
    case "lowest_rated":
      return [desc(searchRank), asc(content.ratingBps), asc(content.rating), desc(content.createdAt), desc(content.id)];
    case "most_votes":
      return [desc(searchRank), desc(content.totalVotes), desc(content.createdAt), desc(content.id)];
    case "newest":
    case "relevance":
    default:
      return [desc(searchRank), desc(content.createdAt), desc(content.id)];
  }
}

function inferMediaTypeFromHost(urlHost: string): "image" | "video" {
  return urlHost === "youtube.com" || urlHost === "www.youtube.com" || urlHost === "m.youtube.com" || urlHost === "youtu.be"
    ? "video"
    : "image";
}

const DIRECT_IMAGE_URL_PATTERN = /^https:\/\/.+\.(?:avif|gif|jpe?g|png|webp)(?:[?#].*)?$/i;

function isFallbackMediaUrl(item: { url?: string; urlHost?: string }) {
  if (!item.url) return false;
  if (DIRECT_IMAGE_URL_PATTERN.test(item.url)) return true;
  return inferMediaTypeFromHost(item.urlHost ?? "") === "video";
}

function fallbackMediaForItem<T extends { url?: string; canonicalUrl?: string; urlHost?: string }>(item: T) {
  if (!isFallbackMediaUrl(item)) return [];
  return [
    {
      index: 0,
      mediaIndex: 0,
      mediaType: inferMediaTypeFromHost(item.urlHost ?? ""),
      url: item.url,
      canonicalUrl: item.canonicalUrl ?? item.url,
      urlHost: item.urlHost ?? "",
    },
  ];
}

async function attachContentMedia<T extends { id: bigint; url?: string; canonicalUrl?: string; urlHost?: string }>(
  items: T[],
) {
  if (items.length === 0) {
    return items.map(item => ({ ...item, media: fallbackMediaForItem(item) }));
  }

  const rows = await db
    .select()
    .from(contentMedia)
    .where(inArray(contentMedia.contentId, items.map(item => item.id)))
    .orderBy(asc(contentMedia.contentId), asc(contentMedia.mediaIndex));
  const rowsByContentId = new Map<bigint, typeof rows>();

  for (const row of rows) {
    const existing = rowsByContentId.get(row.contentId) ?? [];
    existing.push(row);
    rowsByContentId.set(row.contentId, existing);
  }

  return items.map(item => {
    const mediaRows = rowsByContentId.get(item.id);
    return {
      ...item,
      media: mediaRows?.length
        ? mediaRows.map(row => ({
            index: row.mediaIndex,
            mediaIndex: row.mediaIndex,
            mediaType: row.mediaType,
            url: row.url,
            canonicalUrl: row.canonicalUrl,
            urlHost: row.urlHost,
          }))
        : fallbackMediaForItem(item),
    };
  });
}

async function attachQuestionBundleSummaries<T extends { bundleId?: bigint | null }>(items: T[]) {
  const bundleIds = [
    ...new Set(
      items
        .map(item => item.bundleId)
        .filter((bundleId): bundleId is bigint => typeof bundleId === "bigint" && bundleId > 0n),
    ),
  ];
  if (bundleIds.length === 0) {
    return items.map(item => ({ ...item, bundle: null }));
  }

  const rows = await db
    .select()
    .from(questionBundleReward)
    .where(inArray(questionBundleReward.id, bundleIds));
  const bundlesById = new Map(rows.map(row => [row.id, row]));

  return items.map(item => {
    const bundle = typeof item.bundleId === "bigint" ? bundlesById.get(item.bundleId) : null;
    return {
      ...item,
      bundle: bundle
        ? {
            id: bundle.id,
            asset: bundle.asset,
            fundedAmount: bundle.fundedAmount,
            claimedAmount: bundle.claimedAmount,
            refundedAmount: bundle.refundedAmount,
            requiredCompleters: bundle.requiredCompleters,
            questionCount: bundle.questionCount,
            completedQuestionCount: bundle.completedQuestionCount,
            claimedCount: bundle.claimedCount,
            failed: bundle.failed,
            refunded: bundle.refunded,
          }
        : null,
    };
  });
}

async function getAudienceContextForContent(contentId: bigint) {
  const rows = await db
    .select({
      isUp: vote.isUp,
      selfReport: profile.selfReport,
    })
    .from(vote)
    .innerJoin(round, and(eq(vote.contentId, round.contentId), eq(vote.roundId, round.roundId)))
    .leftJoin(profile, eq(vote.voter, profile.address))
    .where(and(eq(vote.contentId, contentId), eq(round.state, ROUND_STATE.Settled), eq(vote.revealed, true)));

  return aggregateProfileSelfReports(rows);
}

export function registerContentRoutes(app: ApiApp) {
  app.get("/content", async (c) => {
    const categoryId = c.req.query("categoryId");
    const contentIds = parseBigIntList(c.req.query("contentIds"), 500);
    const rawSearch = c.req.query("search");
    const requestedSearch = rawSearch?.trim();
    const search = normalizeContentSearchQuery(rawSearch);
    const status = c.req.query("status") ?? "0";
    const submitterQuery = c.req.query("submitter");
    const submittersQuery = c.req.query("submitters");
    const sortBy = c.req.query("sortBy") ?? "newest";
    const limit = safeLimit(c.req.query("limit"), 50, 200);
    const offset = safeOffset(c.req.query("offset"));
    if (Number.isNaN(offset)) return c.json({ error: "Invalid offset" }, 400);
    if (requestedSearch && search === null) {
      return jsonBig(c, {
        items: [],
        total: 0,
        limit,
        offset,
        hasMore: false,
      });
    }

    const conditions = [
      buildAllowedContentCondition({
        canonicalUrl: content.canonicalUrl,
        description: content.description,
        tags: content.tags,
        title: content.title,
        url: content.url,
        urlHost: content.urlHost,
      }),
    ];
    if (status !== "all") {
      const parsed = parseInt(status);
      if (isNaN(parsed)) return c.json({ error: "Invalid status filter" }, 400);
      conditions.push(eq(content.status, parsed));
    }
    if (sortBy === "highest_rewards") {
      conditions.push(sql<boolean>`${getRewardAvailableAmount()} > 0`);
    }
    if (categoryId) {
      const parsed = safeBigInt(categoryId);
      if (parsed === null) return c.json({ error: "Invalid categoryId" }, 400);
      conditions.push(eq(content.categoryId, parsed));
    }
    if (contentIds.length > 0) {
      conditions.push(inArray(content.id, contentIds));
    }
    const submitterFilters = new Set<`0x${string}`>();
    if (submitterQuery) {
      if (!isValidAddress(submitterQuery)) return c.json({ error: "Invalid submitter address" }, 400);
      submitterFilters.add(submitterQuery.toLowerCase() as `0x${string}`);
    }
    if (submittersQuery) {
      const parsedSubmitters = submittersQuery
        .split(",")
        .map(value => value.trim())
        .filter(Boolean);
      if (parsedSubmitters.length === 0 || parsedSubmitters.some(value => !isValidAddress(value))) {
        return c.json({ error: "Invalid submitters filter" }, 400);
      }
      parsedSubmitters.forEach(value => submitterFilters.add(value.toLowerCase() as `0x${string}`));
    }
    if (submitterFilters.size === 1) {
      conditions.push(eq(content.submitter, Array.from(submitterFilters)[0]));
    } else if (submitterFilters.size > 1) {
      conditions.push(inArray(content.submitter, Array.from(submitterFilters)));
    }
    const urlSearchCandidates = search ? getUrlLookupCandidates(search) : null;
    const searchExpressions = search && urlSearchCandidates === null ? buildContentSearchExpressions(search) : null;
    if (urlSearchCandidates) {
      conditions.push(or(inArray(content.canonicalUrl, urlSearchCandidates), inArray(content.url, urlSearchCandidates)));
    } else if (search) {
      conditions.push(searchExpressions!.condition);
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const queryLimit = search ? limit + 1 : limit;
    const orderByExprs = searchExpressions ? getSearchOrderBy(searchExpressions.rank, sortBy) : getContentOrderBy(sortBy);

    const items = await db
      .select()
      .from(content)
      .where(where)
      .orderBy(...orderByExprs)
      .limit(queryLimit)
      .offset(offset);

    const hasMore = items.length > limit;
    const pageItems = hasMore ? items.slice(0, limit) : items;
    const itemsWithOpenRound = await attachOpenRoundSummary(pageItems);
    const itemsWithMedia = await attachContentMedia(itemsWithOpenRound);
    const itemsWithBundles = await attachQuestionBundleSummaries(itemsWithMedia);
    const total =
      search === null
        ? (
            await db
              .select({ count: sql<number>`count(*)` })
              .from(content)
              .where(where)
          )[0]?.count ?? 0
        : null;

    return jsonBig(c, {
      items: itemsWithBundles,
      total,
      limit,
      offset,
      hasMore,
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

    const mediaMatches = await db
      .select({ contentId: contentMedia.contentId })
      .from(contentMedia)
      .where(or(inArray(contentMedia.canonicalUrl, candidates), inArray(contentMedia.url, candidates)))
      .limit(20);
    const matchedMediaContentIds = [...new Set(mediaMatches.map(item => item.contentId))];

    const matches = await db
      .select()
      .from(content)
      .where(
        and(
          matchedMediaContentIds.length > 0
            ? or(
                inArray(content.canonicalUrl, candidates),
                inArray(content.url, candidates),
                inArray(content.id, matchedMediaContentIds),
              )
            : or(inArray(content.canonicalUrl, candidates), inArray(content.url, candidates)),
          buildAllowedContentCondition({
            canonicalUrl: content.canonicalUrl,
            description: content.description,
            tags: content.tags,
            title: content.title,
            url: content.url,
            urlHost: content.urlHost,
          }),
        ),
      )
      .orderBy(desc(content.createdAt))
      .limit(5);

    const item = matches[0];
    if (!item) {
      return c.json({ error: "Content not found" }, 404);
    }

    const [contentWithOpenRound] = await attachOpenRoundSummary([item]);
    const [contentWithMedia] = await attachContentMedia([contentWithOpenRound]);
    const [contentWithBundle] = await attachQuestionBundleSummaries([contentWithMedia]);

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
    const audienceContext = await getAudienceContextForContent(item.id);

    return jsonBig(c, {
      content: contentWithBundle,
      rounds,
      ratings,
      audienceContext,
      matchCount: matches.length,
    });
  });

  app.get("/content/:id", async (c) => {
    const id = safeBigInt(c.req.param("id"));
    if (id === null) return c.json({ error: "Invalid content id" }, 400);

    const [item] = await db
      .select()
      .from(content)
      .where(
        and(
          eq(content.id, id),
          buildAllowedContentCondition({
            canonicalUrl: content.canonicalUrl,
            description: content.description,
            tags: content.tags,
            title: content.title,
            url: content.url,
            urlHost: content.urlHost,
          }),
        ),
      )
      .limit(1);

    if (!item) {
      return c.json({ error: "Content not found" }, 404);
    }

    const [contentWithOpenRound] = await attachOpenRoundSummary([item]);
    const [contentWithMedia] = await attachContentMedia([contentWithOpenRound]);
    const [contentWithBundle] = await attachQuestionBundleSummaries([contentWithMedia]);

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
    const audienceContext = await getAudienceContextForContent(id);

    return jsonBig(c, { content: contentWithBundle, rounds, ratings, audienceContext });
  });

  app.get("/rounds", async (c) => {
    const contentId = c.req.query("contentId");
    const stateFilter = c.req.query("state");
    const submitter = c.req.query("submitter");
    const limit = safeLimit(c.req.query("limit"), 50, 200);
    const offset = safeOffset(c.req.query("offset"));
    if (Number.isNaN(offset)) return c.json({ error: "Invalid offset" }, 400);

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
    if (submitter) {
      if (!isValidAddress(submitter)) return c.json({ error: "Invalid submitter address" }, 400);
      conditions.push(eq(content.submitter, submitter.toLowerCase() as `0x${string}`));
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
        referenceRatingBps: round.referenceRatingBps,
        ratingBps: round.ratingBps,
        conservativeRatingBps: round.conservativeRatingBps,
        confidenceMass: round.confidenceMass,
        effectiveEvidence: round.effectiveEvidence,
        settledRounds: round.settledRounds,
        lowSince: round.lowSince,
        upWins: round.upWins,
        losingPool: round.losingPool,
        startTime: round.startTime,
        settledAt: round.settledAt,
        epochDuration: round.epochDuration,
        maxDuration: round.maxDuration,
        minVoters: round.minVoters,
        maxVoters: round.maxVoters,
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
      .leftJoin(content, eq(round.contentId, content.id))
      .where(where);

    return jsonBig(c, {
      items,
      total: countResult?.count ?? 0,
      limit,
      offset,
    });
  });

  app.get("/submitter-settled-rounds", async (c) => {
    const submitter = c.req.query("submitter");
    const limit = safeLimit(c.req.query("limit"), 50, 200);
    const offset = safeOffset(c.req.query("offset"));
    if (Number.isNaN(offset)) return c.json({ error: "Invalid offset" }, 400);

    if (!submitter) {
      return c.json({ error: "submitter parameter required" }, 400);
    }
    if (!isValidAddress(submitter)) {
      return c.json({ error: "Invalid submitter address" }, 400);
    }

    const submitterAddress = submitter.toLowerCase() as `0x${string}`;
    const where = and(eq(content.submitter, submitterAddress), eq(round.state, ROUND_STATE.Settled));

    const items = await db
      .select({
        contentId: round.contentId,
        roundId: round.roundId,
      })
      .from(round)
      .innerJoin(content, eq(round.contentId, content.id))
      .where(where)
      .orderBy(desc(round.settledAt), desc(round.contentId), desc(round.roundId))
      .limit(limit)
      .offset(offset);

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(round)
      .innerJoin(content, eq(round.contentId, content.id))
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

    return jsonBig(c, {
      activeCount: 0,
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
    const where = buildAllowedCategoryCondition({
      slug: category.slug,
      name: category.name,
    });
    const offset = safeOffset(c.req.query("offset"));
    if (Number.isNaN(offset)) return c.json({ error: "Invalid offset" }, 400);

    const items = await db
      .select()
      .from(category)
      .where(where)
      .orderBy(asc(category.name))
      .limit(safeLimit(c.req.query("limit"), 100, 500))
      .offset(offset);

    return jsonBig(c, { items });
  });

  app.get("/category-popularity", async (c) => {
    const items = await db
      .select({
        id: category.id,
        totalVotes: category.totalVotes,
      })
      .from(category);

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
        commitHash: vote.commitHash,
        targetRound: vote.targetRound,
        drandChainHash: vote.drandChainHash,
        isUp: vote.isUp,
        stake: vote.stake,
        epochIndex: vote.epochIndex,
        revealed: vote.revealed,
        committedAt: vote.committedAt,
        revealedAt: vote.revealedAt,
        roundStartTime: round.startTime,
        roundEpochDuration: round.epochDuration,
        roundMaxDuration: round.maxDuration,
        roundMinVoters: round.minVoters,
        roundMaxVoters: round.maxVoters,
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
        ratingBps: content.ratingBps,
        conservativeRatingBps: content.conservativeRatingBps,
        ratingConfidenceMass: content.ratingConfidenceMass,
        ratingEffectiveEvidence: content.ratingEffectiveEvidence,
        ratingSettledRounds: content.ratingSettledRounds,
        ratingLowSince: content.ratingLowSince,
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
