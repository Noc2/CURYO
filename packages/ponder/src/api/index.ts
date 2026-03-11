import { Hono } from "hono";
import { cors } from "hono/cors";
import { DEFAULT_REVEAL_GRACE_PERIOD_SECONDS, DEFAULT_ROUND_CONFIG, ROUND_STATE } from "@curyo/contracts/protocol";
import { db } from "ponder:api";
import {
  content,
  round,
  vote,
  category,
  profile,
  rewardClaim,
  submitterRewardClaim,
  globalStats,
  ratingChange,
  frontend,
  profileFollow,
  voterId,
  tokenHolder,
  tokenTransfer,
  voterStats,
  voterCategoryStats,
  voterStreak,
} from "ponder:schema";
import { eq, desc, asc, and, or, inArray, notInArray, sql, gte, lt, replaceBigInts } from "ponder";
import {
  resolveAccuracyLeaderboardWindow,
  sortAccuracyLeaderboardItems,
  type AccuracyLeaderboardSortBy,
} from "./leaderboard-utils.js";
import { isLoopbackRateLimitIdentifier, resolveRateLimitIdentifier } from "./request-identity.js";
import { RateLimiter } from "./rate-limit.js";
import { safeBigInt, safeLimit, safeOffset, isValidAddress, getUrlLookupCandidates } from "./utils.js";

const app = new Hono();
const DISCOVER_MODULE_LIMIT = 6;
const SETTLING_SOON_WINDOW_SECONDS = 24 * 60 * 60;
const NOTIFICATION_EMAIL_LOOKBACK_SECONDS = 48 * 60 * 60;

// ============================================================
// GLOBAL ERROR HANDLER — catch unhandled DB/runtime errors
// ============================================================

app.onError((err, c) => {
  console.error("[ponder-api] Unhandled error:", err.message);
  return c.json({ error: "Internal server error" }, 500);
});

// ============================================================
// RATE LIMITING — IP-based sliding window (in-memory, resets on restart)
// ============================================================

const rateLimiter = new RateLimiter(120, 60_000, 60_000);

app.use("/*", async (c, next) => {
  const identifier = resolveRateLimitIdentifier(name => c.req.header(name) ?? undefined, {
    requestUrl: c.req.url,
  });

  const isLoopbackRequest =
    process.env.NODE_ENV !== "production"
    && isLoopbackRateLimitIdentifier(identifier)
    && (() => {
      try {
        const hostname = new URL(c.req.url).hostname;
        return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
      } catch {
        return false;
      }
    })();

  if (isLoopbackRequest) {
    await next();
    return;
  }

  const { allowed, retryAfter } = rateLimiter.check(identifier);

  if (!allowed) {
    c.header("Retry-After", String(retryAfter));
    return c.json({ error: "Too many requests" }, 429);
  }

  await next();
});

// Enable CORS for frontend access (restrict via CORS_ORIGIN in production, comma-separated)
const isProduction = process.env.NODE_ENV === "production";
const DEFAULT_CORS_ORIGINS = ["http://localhost:3000", "http://localhost:3001", "http://127.0.0.1:3000", "http://127.0.0.1:3001"];
const corsOrigin = process.env.CORS_ORIGIN;
const corsMisconfigured = isProduction && !corsOrigin;
if (corsMisconfigured) {
  console.error(
    "[ponder] FATAL: CORS_ORIGIN is required in production. " +
    "Set CORS_ORIGIN env var to your frontend domain(s). " +
    "All API routes will return 503 until this is fixed.",
  );
}

const allowedOrigins = corsOrigin ? corsOrigin.split(",").map((origin: string) => origin.trim()) : DEFAULT_CORS_ORIGINS;
if (!isProduction && !corsOrigin) {
  console.warn("[ponder] CORS_ORIGIN not set — allowing localhost only. Set CORS_ORIGIN for production domains.");
}

// Block all custom routes if CORS is misconfigured — Ponder's built-in /health still works
if (corsMisconfigured) {
  app.use("/*", async (c) => {
    return c.json({ error: "CORS_ORIGIN not configured. Set CORS_ORIGIN env var." }, 503);
  });
}

app.use(
  "/*",
  cors({
    origin: allowedOrigins,
  }),
);

// Helper: serialize BigInts as strings for JSON responses
function jsonBig(c: any, data: any, status?: number) {
  return c.json(replaceBigInts(data, (v: bigint) => String(v)), status);
}

function parseBigIntList(value: string | undefined, max = 50) {
  if (!value) return [];

  const unique = new Set<string>();
  const items: bigint[] = [];

  for (const raw of value.split(",").slice(0, max)) {
    const parsed = safeBigInt(raw.trim());
    if (parsed === null) continue;

    const key = parsed.toString();
    if (unique.has(key)) continue;
    unique.add(key);
    items.push(parsed);
  }

  return items;
}

function getEstimatedSettlementTime(startTime: bigint | null | undefined) {
  if (startTime === null || startTime === undefined) return null;

  return (
    startTime
    + BigInt(DEFAULT_ROUND_CONFIG.epochDurationSeconds)
    + BigInt(DEFAULT_REVEAL_GRACE_PERIOD_SECONDS)
  );
}

function getRadarResolutionOutcome(state: number | null, isUp: boolean | null, upWins: boolean | null) {
  if (state === ROUND_STATE.Cancelled) return "cancelled" as const;
  if (state === ROUND_STATE.Tied) return "tied" as const;
  if (state === ROUND_STATE.RevealFailed) return "reveal_failed" as const;
  if (state === ROUND_STATE.Settled && isUp !== null && upWins !== null) {
    return isUp === upWins ? "won" as const : "lost" as const;
  }

  return "resolved" as const;
}

// Ponder provides /health and /status natively — no custom health check needed.

// ============================================================
// CONTENT
// ============================================================

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
    conditions.push(eq(content.status, parseInt(status)));
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
        lower(${content.goal}) like ${pattern}
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

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(content)
    .where(where);

  return jsonBig(c, {
    items,
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
    content: item,
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

  // Get recent rounds for this content
  const rounds = await db
    .select()
    .from(round)
    .where(eq(round.contentId, id))
    .orderBy(desc(round.roundId))
    .limit(20);

  // Get rating history
  const ratings = await db
    .select()
    .from(ratingChange)
    .where(eq(ratingChange.contentId, id))
    .orderBy(desc(ratingChange.timestamp))
    .limit(50);

  return jsonBig(c, { content: item, rounds, ratings });
});

// ============================================================
// SUBMISSION STAKES
// ============================================================

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

// ============================================================
// VOTING STAKES (active voting stakes per voter)
// ============================================================

app.get("/voting-stakes", async (c) => {
  const voter = c.req.query("voter");
  if (!voter) {
    return c.json({ error: "voter parameter required" }, 400);
  }
  if (!isValidAddress(voter)) {
    return c.json({ error: "Invalid voter address" }, 400);
  }

  const voterAddr = voter.toLowerCase() as `0x${string}`;

  // Active voting stakes: votes in open rounds
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

// ============================================================
// CATEGORIES
// ============================================================

app.get("/categories", async (c) => {
  const statusFilter = c.req.query("status") ?? "1"; // Default: approved only

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
    .orderBy(asc(category.name));

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

// ============================================================
// PROFILES
// ============================================================

app.get("/profiles", async (c) => {
  const addressesParam = c.req.query("addresses");
  if (!addressesParam) {
    return c.json({ error: "addresses parameter required" }, 400);
  }

  const addresses = addressesParam
    .split(",")
    .slice(0, 50)
    .map((a) => a.trim().toLowerCase() as `0x${string}`);

  const items = await db
    .select()
    .from(profile)
    .where(inArray(profile.address, addresses));

  // Return as address -> profile map
  const profileMap: Record<string, (typeof items)[0]> = {};
  for (const p of items) {
    profileMap[p.address.toLowerCase()] = p;
  }

  return jsonBig(c, profileMap);
});

app.get("/profile/:address", async (c) => {
  const address = c.req.param("address").toLowerCase() as `0x${string}`;

  const [item] = await db
    .select()
    .from(profile)
    .where(eq(profile.address, address))
    .limit(1);

  if (!item) {
    return c.json({ error: "Profile not found" }, 404);
  }

  // Get recent votes
  const recentVotes = await db
    .select()
    .from(vote)
    .where(eq(vote.voter, address))
    .orderBy(desc(vote.committedAt))
    .limit(20);

  // Get recent rewards
  const recentRewards = await db
    .select()
    .from(rewardClaim)
    .where(eq(rewardClaim.voter, address))
    .orderBy(desc(rewardClaim.claimedAt))
    .limit(20);

  return jsonBig(c, { profile: item, recentVotes, recentRewards });
});

app.get("/following/:address", async (c) => {
  const address = c.req.param("address").toLowerCase() as `0x${string}`;
  if (!isValidAddress(address)) return c.json({ error: "Invalid address" }, 400);

  const limit = safeLimit(c.req.query("limit"), 100, 200);
  const offset = safeOffset(c.req.query("offset"));

  const items = await db
    .select({
      walletAddress: profileFollow.followed,
      createdAt: profileFollow.createdAt,
      profileName: profile.name,
      profileImageUrl: profile.imageUrl,
    })
    .from(profileFollow)
    .leftJoin(profile, eq(profileFollow.followed, profile.address))
    .where(eq(profileFollow.follower, address))
    .orderBy(desc(profileFollow.createdAt))
    .limit(limit)
    .offset(offset);

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(profileFollow)
    .where(eq(profileFollow.follower, address));

  return jsonBig(c, {
    items,
    total: countResult?.count ?? 0,
    limit,
    offset,
  });
});

app.get("/followers/:address", async (c) => {
  const address = c.req.param("address").toLowerCase() as `0x${string}`;
  if (!isValidAddress(address)) return c.json({ error: "Invalid address" }, 400);

  const limit = safeLimit(c.req.query("limit"), 100, 200);
  const offset = safeOffset(c.req.query("offset"));

  const items = await db
    .select({
      walletAddress: profileFollow.follower,
      createdAt: profileFollow.createdAt,
      profileName: profile.name,
      profileImageUrl: profile.imageUrl,
    })
    .from(profileFollow)
    .leftJoin(profile, eq(profileFollow.follower, profile.address))
    .where(eq(profileFollow.followed, address))
    .orderBy(desc(profileFollow.createdAt))
    .limit(limit)
    .offset(offset);

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(profileFollow)
    .where(eq(profileFollow.followed, address));

  return jsonBig(c, {
    items,
    total: countResult?.count ?? 0,
    limit,
    offset,
  });
});

app.get("/follow-state", async (c) => {
  const follower = c.req.query("follower")?.toLowerCase() as `0x${string}` | undefined;
  const target = c.req.query("target")?.toLowerCase() as `0x${string}` | undefined;

  if (!follower || !target || !isValidAddress(follower) || !isValidAddress(target)) {
    return c.json({ error: "Invalid follower or target address" }, 400);
  }

  const [item] = await db
    .select({ id: profileFollow.id })
    .from(profileFollow)
    .where(eq(profileFollow.id, `${follower}-${target}`))
    .limit(1);

  return c.json({ follower, target, following: Boolean(item) });
});

// ============================================================
// DISCOVER SIGNALS
// ============================================================

app.get("/discover-signals/:address", async (c) => {
  const address = c.req.param("address").toLowerCase() as `0x${string}`;
  if (!isValidAddress(address)) return c.json({ error: "Invalid address" }, 400);

  const watchedContentIds = parseBigIntList(c.req.query("watched"), 100);

  const followedRows = await db
    .select({ followed: profileFollow.followed })
    .from(profileFollow)
    .where(eq(profileFollow.follower, address))
    .orderBy(desc(profileFollow.createdAt))
    .limit(200);

  const followedAddresses = followedRows.map(item => item.followed);

  const votedOpenRounds = await db
    .select({
      id: round.id,
      contentId: round.contentId,
      roundId: round.roundId,
      goal: content.goal,
      url: content.url,
      submitter: content.submitter,
      categoryId: content.categoryId,
      roundStartTime: round.startTime,
      profileName: profile.name,
      profileImageUrl: profile.imageUrl,
    })
    .from(vote)
    .innerJoin(
      round,
      and(eq(vote.contentId, round.contentId), eq(vote.roundId, round.roundId)),
    )
    .innerJoin(content, eq(vote.contentId, content.id))
    .leftJoin(profile, eq(content.submitter, profile.address))
    .where(
      and(
        eq(vote.voter, address),
        eq(round.state, ROUND_STATE.Open),
        gte(round.voteCount, DEFAULT_ROUND_CONFIG.minVoters),
      ),
    )
    .orderBy(asc(round.startTime))
    .limit(24);

  const watchedOpenRounds = watchedContentIds.length === 0
    ? []
    : await db
        .select({
          id: round.id,
          contentId: round.contentId,
          roundId: round.roundId,
          goal: content.goal,
          url: content.url,
          submitter: content.submitter,
          categoryId: content.categoryId,
          roundStartTime: round.startTime,
          profileName: profile.name,
          profileImageUrl: profile.imageUrl,
        })
        .from(round)
        .innerJoin(content, eq(round.contentId, content.id))
        .leftJoin(profile, eq(content.submitter, profile.address))
        .where(
          and(
            inArray(round.contentId, watchedContentIds),
            eq(round.state, ROUND_STATE.Open),
            gte(round.voteCount, DEFAULT_ROUND_CONFIG.minVoters),
          ),
        )
        .orderBy(asc(round.startTime))
        .limit(24);

  const settlingSoonMap = new Map<
    string,
    {
      id: string;
      contentId: bigint;
      roundId: bigint;
      goal: string;
      url: string;
      submitter: string;
      categoryId: bigint;
      roundStartTime: bigint | null;
      estimatedSettlementTime: bigint | null;
      profileName: string | null;
      profileImageUrl: string | null;
      source: "watched" | "voted" | "watched_voted";
    }
  >();

  const addSettlingItems = (
    rows: typeof votedOpenRounds,
    source: "watched" | "voted",
  ) => {
    for (const item of rows) {
      const key = `${item.contentId.toString()}-${item.roundId.toString()}`;
      const existing = settlingSoonMap.get(key);
      settlingSoonMap.set(key, {
        ...item,
        estimatedSettlementTime: getEstimatedSettlementTime(item.roundStartTime),
        source: existing && existing.source !== source ? "watched_voted" : existing?.source ?? source,
      });
    }
  };

  addSettlingItems(votedOpenRounds, "voted");
  addSettlingItems(watchedOpenRounds, "watched");

  const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
  const cutoff = nowSeconds + BigInt(SETTLING_SOON_WINDOW_SECONDS);
  const allSettlingSoon = [...settlingSoonMap.values()].sort((a, b) => {
    const aTime = a.estimatedSettlementTime ?? (2n ** 62n);
    const bTime = b.estimatedSettlementTime ?? (2n ** 62n);
    if (aTime === bTime) return 0;
    return aTime < bTime ? -1 : 1;
  });
  const settlingSoon = (
    allSettlingSoon.filter(item => item.estimatedSettlementTime !== null && item.estimatedSettlementTime <= cutoff)
      .slice(0, DISCOVER_MODULE_LIMIT)
  );
  const settlingSoonItems = (
    settlingSoon.length > 0 ? settlingSoon : allSettlingSoon.slice(0, DISCOVER_MODULE_LIMIT)
  );

  const followedSubmissions = followedAddresses.length === 0
    ? []
    : await db
        .select({
          contentId: content.id,
          goal: content.goal,
          url: content.url,
          createdAt: content.createdAt,
          categoryId: content.categoryId,
          submitter: content.submitter,
          profileName: profile.name,
          profileImageUrl: profile.imageUrl,
        })
        .from(content)
        .leftJoin(profile, eq(content.submitter, profile.address))
        .where(and(eq(content.status, 0), inArray(content.submitter, followedAddresses)))
        .orderBy(desc(content.createdAt))
        .limit(DISCOVER_MODULE_LIMIT);

  const followedResolutions = followedAddresses.length === 0
    ? []
    : await db
        .select({
          id: vote.id,
          contentId: vote.contentId,
          roundId: vote.roundId,
          voter: vote.voter,
          isUp: vote.isUp,
          goal: content.goal,
          url: content.url,
          settledAt: round.settledAt,
          roundState: round.state,
          roundUpWins: round.upWins,
          profileName: profile.name,
          profileImageUrl: profile.imageUrl,
        })
        .from(vote)
        .innerJoin(
          round,
          and(eq(vote.contentId, round.contentId), eq(vote.roundId, round.roundId)),
        )
        .innerJoin(content, eq(vote.contentId, content.id))
        .leftJoin(profile, eq(vote.voter, profile.address))
        .where(and(
          inArray(vote.voter, followedAddresses),
          eq(vote.revealed, true),
          or(
            eq(round.state, ROUND_STATE.Settled),
            eq(round.state, ROUND_STATE.Cancelled),
            eq(round.state, ROUND_STATE.Tied),
            eq(round.state, ROUND_STATE.RevealFailed),
          ),
        ))
        .orderBy(desc(round.settledAt), desc(vote.revealedAt))
        .limit(DISCOVER_MODULE_LIMIT);

  return jsonBig(c, {
    settlingSoon: settlingSoonItems,
    followedSubmissions,
    followedResolutions: followedResolutions.map(item => ({
      ...item,
      outcome: getRadarResolutionOutcome(item.roundState, item.isUp, item.roundUpWins),
    })),
  });
});

app.get("/notification-events/:address", async (c) => {
  const address = c.req.param("address").toLowerCase() as `0x${string}`;
  if (!isValidAddress(address)) return c.json({ error: "Invalid address" }, 400);

  const watchedContentIds = parseBigIntList(c.req.query("watched"), 200);
  const followedRows = await db
    .select({ followed: profileFollow.followed })
    .from(profileFollow)
    .where(eq(profileFollow.follower, address))
    .orderBy(desc(profileFollow.createdAt))
    .limit(200);

  const followedAddresses = followedRows.map(item => item.followed);
  const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
  const settlingSoonCutoff = nowSeconds + BigInt(SETTLING_SOON_WINDOW_SECONDS);
  const recentCutoff = nowSeconds - BigInt(NOTIFICATION_EMAIL_LOOKBACK_SECONDS);

  const votedOpenRounds = await db
    .select({
      id: round.id,
      contentId: round.contentId,
      roundId: round.roundId,
      goal: content.goal,
      url: content.url,
      submitter: content.submitter,
      categoryId: content.categoryId,
      roundStartTime: round.startTime,
      profileName: profile.name,
      profileImageUrl: profile.imageUrl,
    })
    .from(vote)
    .innerJoin(round, and(eq(vote.contentId, round.contentId), eq(vote.roundId, round.roundId)))
    .innerJoin(content, eq(vote.contentId, content.id))
    .leftJoin(profile, eq(content.submitter, profile.address))
    .where(
      and(
        eq(vote.voter, address),
        eq(round.state, ROUND_STATE.Open),
        gte(round.voteCount, DEFAULT_ROUND_CONFIG.minVoters),
      ),
    )
    .orderBy(asc(round.startTime))
    .limit(24);

  const watchedOpenRounds = watchedContentIds.length === 0
    ? []
    : await db
        .select({
          id: round.id,
          contentId: round.contentId,
          roundId: round.roundId,
          goal: content.goal,
          url: content.url,
          submitter: content.submitter,
          categoryId: content.categoryId,
          roundStartTime: round.startTime,
          profileName: profile.name,
          profileImageUrl: profile.imageUrl,
        })
        .from(round)
        .innerJoin(content, eq(round.contentId, content.id))
        .leftJoin(profile, eq(content.submitter, profile.address))
        .where(
          and(
            inArray(round.contentId, watchedContentIds),
            eq(round.state, ROUND_STATE.Open),
            gte(round.voteCount, DEFAULT_ROUND_CONFIG.minVoters),
          ),
        )
        .orderBy(asc(round.startTime))
        .limit(24);

  const settlingSoonMap = new Map<string, any>();
  for (const [rows, source] of [[votedOpenRounds, "voted"], [watchedOpenRounds, "watched"]] as const) {
    for (const item of rows) {
      const key = `${item.contentId.toString()}-${item.roundId.toString()}`;
      const existing = settlingSoonMap.get(key);
      settlingSoonMap.set(key, {
        ...item,
        estimatedSettlementTime: getEstimatedSettlementTime(item.roundStartTime),
        source: existing && existing.source !== source ? "watched_voted" : existing?.source ?? source,
      });
    }
  }

  const settlingSoon = [...settlingSoonMap.values()]
    .filter(item => item.estimatedSettlementTime !== null && item.estimatedSettlementTime <= settlingSoonCutoff)
    .sort((a, b) => {
      const aTime = a.estimatedSettlementTime ?? 2n ** 62n;
      const bTime = b.estimatedSettlementTime ?? 2n ** 62n;
      if (aTime === bTime) return 0;
      return aTime < bTime ? -1 : 1;
    })
    .slice(0, 24);

  const followedSubmissions = followedAddresses.length === 0
    ? []
    : await db
        .select({
          contentId: content.id,
          goal: content.goal,
          url: content.url,
          createdAt: content.createdAt,
          categoryId: content.categoryId,
          submitter: content.submitter,
          profileName: profile.name,
          profileImageUrl: profile.imageUrl,
        })
        .from(content)
        .leftJoin(profile, eq(content.submitter, profile.address))
        .where(and(eq(content.status, 0), inArray(content.submitter, followedAddresses), gte(content.createdAt, recentCutoff)))
        .orderBy(desc(content.createdAt))
        .limit(24);

  const followedResolutions = followedAddresses.length === 0
    ? []
    : await db
        .select({
          id: vote.id,
          contentId: vote.contentId,
          roundId: vote.roundId,
          voter: vote.voter,
          isUp: vote.isUp,
          goal: content.goal,
          url: content.url,
          settledAt: round.settledAt,
          roundState: round.state,
          roundUpWins: round.upWins,
          profileName: profile.name,
          profileImageUrl: profile.imageUrl,
        })
        .from(vote)
        .innerJoin(round, and(eq(vote.contentId, round.contentId), eq(vote.roundId, round.roundId)))
        .innerJoin(content, eq(vote.contentId, content.id))
        .leftJoin(profile, eq(vote.voter, profile.address))
        .where(and(
          inArray(vote.voter, followedAddresses),
          eq(vote.revealed, true),
          gte(round.settledAt, recentCutoff),
          or(
            eq(round.state, ROUND_STATE.Settled),
            eq(round.state, ROUND_STATE.Cancelled),
            eq(round.state, ROUND_STATE.Tied),
            eq(round.state, ROUND_STATE.RevealFailed),
          ),
        ))
        .orderBy(desc(round.settledAt), desc(vote.revealedAt))
        .limit(24);

  const votedResolved = await db
    .select({
      id: vote.id,
      contentId: vote.contentId,
      roundId: vote.roundId,
      voter: vote.voter,
      isUp: vote.isUp,
      goal: content.goal,
      url: content.url,
      settledAt: round.settledAt,
      roundState: round.state,
      roundUpWins: round.upWins,
      profileName: profile.name,
      profileImageUrl: profile.imageUrl,
      source: sql<string>`'voted'`,
    })
    .from(vote)
    .innerJoin(round, and(eq(vote.contentId, round.contentId), eq(vote.roundId, round.roundId)))
    .innerJoin(content, eq(vote.contentId, content.id))
    .leftJoin(profile, eq(content.submitter, profile.address))
    .where(and(
      eq(vote.voter, address),
      gte(round.settledAt, recentCutoff),
      or(
        eq(round.state, ROUND_STATE.Settled),
        eq(round.state, ROUND_STATE.Cancelled),
        eq(round.state, ROUND_STATE.Tied),
        eq(round.state, ROUND_STATE.RevealFailed),
      ),
    ))
    .orderBy(desc(round.settledAt))
    .limit(24);

  const watchedResolved = watchedContentIds.length === 0
    ? []
    : await db
        .select({
          id: round.id,
          contentId: round.contentId,
          roundId: round.roundId,
          voter: sql<string>`''`,
          isUp: sql<boolean | null>`NULL`,
          goal: content.goal,
          url: content.url,
          settledAt: round.settledAt,
          roundState: round.state,
          roundUpWins: round.upWins,
          profileName: profile.name,
          profileImageUrl: profile.imageUrl,
          source: sql<string>`'watched'`,
        })
        .from(round)
        .innerJoin(content, eq(round.contentId, content.id))
        .leftJoin(profile, eq(content.submitter, profile.address))
        .where(and(
          inArray(round.contentId, watchedContentIds),
          gte(round.settledAt, recentCutoff),
          or(
            eq(round.state, ROUND_STATE.Settled),
            eq(round.state, ROUND_STATE.Cancelled),
            eq(round.state, ROUND_STATE.Tied),
            eq(round.state, ROUND_STATE.RevealFailed),
          ),
        ))
        .orderBy(desc(round.settledAt))
        .limit(24);

  const trackedResolutionMap = new Map<string, any>();
  for (const item of [...watchedResolved, ...votedResolved]) {
    const key = `${item.contentId.toString()}-${item.roundId.toString()}`;
    const existing = trackedResolutionMap.get(key);
    trackedResolutionMap.set(key, {
      ...item,
      source: existing && existing.source !== item.source ? "watched_voted" : existing?.source ?? item.source,
      outcome: getRadarResolutionOutcome(item.roundState, item.isUp, item.roundUpWins),
    });
  }

  return jsonBig(c, {
    settlingSoon,
    followedSubmissions,
    followedResolutions: followedResolutions.map(item => ({
      ...item,
      outcome: getRadarResolutionOutcome(item.roundState, item.isUp, item.roundUpWins),
    })),
    trackedResolutions: [...trackedResolutionMap.values()]
      .sort((a, b) => {
        const aTime = a.settledAt ?? 0n;
        const bTime = b.settledAt ?? 0n;
        if (aTime === bTime) return 0;
        return aTime > bTime ? -1 : 1;
      })
      .slice(0, 24),
  });
});

app.get("/featured-today", async (c) => {
  const limit = safeLimit(c.req.query("limit"), DISCOVER_MODULE_LIMIT, 12);
  const activeLimit = Math.max(2, Math.ceil(limit / 2));
  const earlyLimit = Math.max(2, limit - activeLimit + 1);

  const selectFields = {
    id: round.id,
    contentId: round.contentId,
    roundId: round.roundId,
    goal: content.goal,
    url: content.url,
    submitter: content.submitter,
    categoryId: content.categoryId,
    voteCount: round.voteCount,
    totalStake: round.totalStake,
    roundStartTime: round.startTime,
    profileName: profile.name,
    profileImageUrl: profile.imageUrl,
  };

  const activeDebates = await db
    .select(selectFields)
    .from(round)
    .innerJoin(content, eq(round.contentId, content.id))
    .leftJoin(profile, eq(content.submitter, profile.address))
    .where(and(
      eq(round.state, ROUND_STATE.Open),
      eq(content.status, 0),
      gte(round.voteCount, DEFAULT_ROUND_CONFIG.minVoters),
    ))
    .orderBy(desc(round.totalStake), desc(round.voteCount), desc(round.startTime))
    .limit(activeLimit);

  const earlySignal = await db
    .select(selectFields)
    .from(round)
    .innerJoin(content, eq(round.contentId, content.id))
    .leftJoin(profile, eq(content.submitter, profile.address))
    .where(and(
      eq(round.state, ROUND_STATE.Open),
      eq(content.status, 0),
      sql`${round.voteCount} < ${DEFAULT_ROUND_CONFIG.minVoters}`,
    ))
    .orderBy(desc(round.startTime), desc(round.totalStake))
    .limit(earlyLimit);

  const seen = new Set<string>();
  const items = [...activeDebates, ...earlySignal]
    .filter(item => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .slice(0, limit)
    .map(item => ({
      ...item,
      featuredReason:
        item.voteCount >= DEFAULT_ROUND_CONFIG.minVoters
          ? "Active debate"
          : item.voteCount > 0
            ? "Needs early signal"
            : "Fresh round",
    }));

  return jsonBig(c, { items });
});

// ============================================================
// LEADERBOARD
// ============================================================

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

  // Fetch profiles (with activity stats)
  const profileItems = await db
    .select()
    .from(profile)
    .orderBy(orderBy)
    .limit(limit);

  // Fill remaining slots with token holders who haven't created a profile
  const remaining = limit - profileItems.length;
  const profileAddresses = profileItems.map((p) => p.address);
  let holderOnly: typeof profileItems = [];

  if (remaining > 0) {
    const holders = profileAddresses.length > 0
      ? await db.select().from(tokenHolder)
          .where(notInArray(tokenHolder.address, profileAddresses))
          .limit(remaining)
      : await db.select().from(tokenHolder).limit(remaining);

    holderOnly = holders.map((h) => ({
      address: h.address,
      name: "",
      imageUrl: "",
      createdAt: h.firstSeenAt,
      updatedAt: h.firstSeenAt,
      totalVotes: 0,
      totalContent: 0,
      totalRewardsClaimed: 0n,
    }));
  }

  const items = [...profileItems, ...holderOnly];
  return jsonBig(c, { items, type });
});

// ============================================================
// ACCURACY LEADERBOARD
// ============================================================

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

  const minVotes = parseInt(minVotesParam);
  if (isNaN(minVotes) || minVotes < 1) return c.json({ error: "Invalid minVotes" }, 400);

  const categoryId = categoryIdParam ? safeBigInt(categoryIdParam) : null;
  if (categoryIdParam && categoryId === null) return c.json({ error: "Invalid categoryId" }, 400);

  let orderByExpr;
  switch (sortBy) {
    case "settledVotes":
      orderByExpr = categoryIdParam
        ? desc(voterCategoryStats.totalSettledVotes)
        : desc(voterStats.totalSettledVotes);
      break;
    case "wins":
      orderByExpr = categoryIdParam
        ? desc(voterCategoryStats.totalWins)
        : desc(voterStats.totalWins);
      break;
    case "stakeWon":
      orderByExpr = categoryIdParam
        ? desc(voterCategoryStats.totalStakeWon)
        : desc(voterStats.totalStakeWon);
      break;
    case "winRate":
    default:
      orderByExpr = categoryIdParam
        ? desc(sql`CAST(${voterCategoryStats.totalWins} AS FLOAT) / ${voterCategoryStats.totalSettledVotes}`)
        : desc(sql`CAST(${voterStats.totalWins} AS FLOAT) / ${voterStats.totalSettledVotes}`);
      break;
  }

  if (windowBounds.window !== "all" && windowBounds.startsAt !== null && windowBounds.endsAt !== null) {
    const aggregateSelection = {
      voter: vote.voter,
      totalSettledVotes: sql<number>`count(*)`,
      totalWins: sql<number>`sum(case when ${vote.isUp} = ${round.upWins} then 1 else 0 end)`,
      totalLosses: sql<number>`sum(case when ${vote.isUp} = ${round.upWins} then 0 else 1 end)`,
      totalStakeWon: sql<bigint>`coalesce(sum(case when ${vote.isUp} = ${round.upWins} then ${vote.stake} else 0 end), 0)`,
      totalStakeLost: sql<bigint>`coalesce(sum(case when ${vote.isUp} = ${round.upWins} then 0 else ${vote.stake} end), 0)`,
      profileName: profile.name,
      profileImageUrl: profile.imageUrl,
    };

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
          .groupBy(vote.voter, profile.name, profile.imageUrl)
      : await db
          .select(aggregateSelection)
          .from(vote)
          .innerJoin(
            round,
            and(eq(vote.contentId, round.contentId), eq(vote.roundId, round.roundId)),
          )
          .leftJoin(profile, eq(vote.voter, profile.address))
          .where(and(...baseConditions))
          .groupBy(vote.voter, profile.name, profile.imageUrl);

    const normalized = rows
      .map((row) => ({
        voter: row.voter,
        totalSettledVotes: Number(row.totalSettledVotes),
        totalWins: Number(row.totalWins),
        totalLosses: Number(row.totalLosses),
        totalStakeWon: typeof row.totalStakeWon === "bigint" ? row.totalStakeWon : BigInt(row.totalStakeWon ?? 0),
        totalStakeLost: typeof row.totalStakeLost === "bigint" ? row.totalStakeLost : BigInt(row.totalStakeLost ?? 0),
        profileName: row.profileName,
        profileImageUrl: row.profileImageUrl,
        winRate: Number(row.totalSettledVotes) > 0 ? Number(row.totalWins) / Number(row.totalSettledVotes) : 0,
      }))
      .filter((row) => row.totalSettledVotes >= minVotes);

    const items = sortAccuracyLeaderboardItems(normalized, sortBy as AccuracyLeaderboardSortBy).slice(
      offset,
      offset + limit,
    );

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
        profileImageUrl: profile.imageUrl,
      })
      .from(voterCategoryStats)
      .leftJoin(profile, eq(voterCategoryStats.voter, profile.address))
      .where(
        and(
          eq(voterCategoryStats.categoryId, categoryId),
          gte(voterCategoryStats.totalSettledVotes, minVotes),
        ),
      )
      .orderBy(orderByExpr)
      .limit(limit)
      .offset(offset);

    const result = items.map((item) => ({
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

  // Global accuracy leaderboard
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
      profileImageUrl: profile.imageUrl,
    })
    .from(voterStats)
    .leftJoin(profile, eq(voterStats.voter, profile.address))
    .where(gte(voterStats.totalSettledVotes, minVotes))
    .orderBy(orderByExpr)
    .limit(limit)
    .offset(offset);

  const result = items.map((item) => ({
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

// ============================================================
// VOTER ACCURACY (individual)
// ============================================================

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

  const categories = categoryRows.map((row) => ({
    ...row,
    winRate: row.totalSettledVotes > 0 ? row.totalWins / row.totalSettledVotes : 0,
  }));

  return jsonBig(c, { stats: statsWithRate, categories });
});

// ============================================================
// VOTER STATS BATCH
// ============================================================

app.get("/voter-stats-batch", async (c) => {
  const votersParam = c.req.query("voters");
  if (!votersParam) {
    return c.json({ error: "voters parameter required" }, 400);
  }

  const voters = votersParam
    .split(",")
    .slice(0, 50)
    .map((a) => a.trim().toLowerCase() as `0x${string}`)
    .filter((a) => isValidAddress(a));

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

// ============================================================
// VOTES
// ============================================================

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

// ============================================================
// REWARDS
// ============================================================

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

// ============================================================
// SUBMITTER REWARDS
// ============================================================

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

// ============================================================
// BALANCE HISTORY (cREP transfers for a given address)
// ============================================================

app.get("/balance-history", async (c) => {
  const address = c.req.query("address");
  if (!address) {
    return c.json({ error: "address parameter required" }, 400);
  }
  if (!isValidAddress(address)) {
    return c.json({ error: "Invalid address" }, 400);
  }

  const addr = address.toLowerCase() as `0x${string}`;
  const limit = safeLimit(c.req.query("limit"), 500, 1000);

  const transfers = await db
    .select()
    .from(tokenTransfer)
    .where(or(eq(tokenTransfer.from, addr), eq(tokenTransfer.to, addr)))
    .orderBy(asc(tokenTransfer.blockNumber))
    .limit(limit);

  return jsonBig(c, { transfers, address: addr });
});

// ============================================================
// GLOBAL STATS
// ============================================================

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

// ============================================================
// FRONTENDS
// ============================================================

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
  // "all" → no where clause

  const items = await db.select().from(frontend).where(where);

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

// ============================================================
// VOTER IDS
// ============================================================

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

// ============================================================
// VOTER STREAK
// ============================================================

const STREAK_MILESTONES = [
  { days: 7, baseBonus: 10 },
  { days: 30, baseBonus: 50 },
  { days: 90, baseBonus: 200 },
];

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

  // Find next milestone
  const nextMilestone = STREAK_MILESTONES.find(
    (m) => m.days > streak.currentDailyStreak,
  );

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

export default app;
