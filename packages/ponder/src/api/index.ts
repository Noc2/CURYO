import { Hono } from "hono";
import { cors } from "hono/cors";
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
  voterId,
  tokenHolder,
  tokenTransfer,
  voterStats,
  voterCategoryStats,
  voterStreak,
} from "ponder:schema";
import { eq, desc, asc, and, or, inArray, notInArray, sql, gte, replaceBigInts } from "ponder";

const app = new Hono();

// ============================================================
// RATE LIMITING — IP-based sliding window
// ============================================================

interface RateLimitEntry {
  timestamps: number[];
}

const rateLimitStore = new Map<string, RateLimitEntry>();
const RATE_LIMIT = 120; // requests per window
const RATE_WINDOW_MS = 60_000; // 1 minute
const RATE_CLEANUP_INTERVAL_MS = 60_000;
let rateLimitLastCleanup = Date.now();

function rateLimitCleanup() {
  const now = Date.now();
  if (now - rateLimitLastCleanup < RATE_CLEANUP_INTERVAL_MS) return;
  rateLimitLastCleanup = now;
  const cutoff = now - RATE_WINDOW_MS;
  for (const [key, entry] of rateLimitStore) {
    entry.timestamps = entry.timestamps.filter(t => t > cutoff);
    if (entry.timestamps.length === 0) rateLimitStore.delete(key);
  }
}

app.use("/*", async (c, next) => {
  const xff = c.req.header("x-forwarded-for");
  const ip =
    c.req.header("x-real-ip")?.trim() ||
    xff?.split(",").pop()?.trim() ||
    "unknown";

  // Skip rate limiting for localhost/loopback (dev server, E2E tests)
  const isLocal = ip === "unknown" || ip === "127.0.0.1" || ip === "::1" || ip === "localhost";
  if (isLocal) {
    await next();
    return;
  }

  const now = Date.now();
  const cutoff = now - RATE_WINDOW_MS;

  rateLimitCleanup();

  let entry = rateLimitStore.get(ip);
  if (!entry) {
    entry = { timestamps: [] };
    rateLimitStore.set(ip, entry);
  }

  entry.timestamps = entry.timestamps.filter(t => t > cutoff);

  if (entry.timestamps.length >= RATE_LIMIT) {
    const oldestInWindow = entry.timestamps[0];
    const retryAfter = Math.ceil((oldestInWindow + RATE_WINDOW_MS - now) / 1000);
    c.header("Retry-After", String(retryAfter));
    return c.json({ error: "Too many requests" }, 429);
  }

  entry.timestamps.push(now);
  await next();
});

// Enable CORS for frontend access (restrict via CORS_ORIGIN in production, comma-separated)
const DEFAULT_CORS_ORIGINS = [
  "https://curyo.xyz",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
];
const corsOrigin = process.env.CORS_ORIGIN;
const allowedOrigins = corsOrigin
  ? corsOrigin.split(",").map(o => o.trim())
  : DEFAULT_CORS_ORIGINS;
if (!corsOrigin) {
  console.warn("[ponder] CORS_ORIGIN not set — allowing localhost only. Set CORS_ORIGIN for production domains.");
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

// Helper: safely parse a BigInt from a query/path parameter, returning null on invalid input
function safeBigInt(value: string): bigint | null {
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

// Helper: safely parse pagination params with defaults and clamping
function safeLimit(value: string | undefined, defaultVal: number, max: number): number {
  const parsed = parseInt(value ?? String(defaultVal));
  if (isNaN(parsed) || parsed < 1) return defaultVal;
  return Math.min(parsed, max);
}

function safeOffset(value: string | undefined): number {
  const parsed = parseInt(value ?? "0");
  return isNaN(parsed) || parsed < 0 ? 0 : parsed;
}

// Helper: validate Ethereum address format
function isValidAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/i.test(value);
}

// Ponder provides /health and /status natively — no custom health check needed.

// ============================================================
// CONTENT
// ============================================================

app.get("/content", async (c) => {
  const categoryId = c.req.query("categoryId");
  const status = c.req.query("status") ?? "0";
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

  // Active voting stakes: votes in open rounds (state = 0)
  // Round states: Open(0), Settled(1), Cancelled(2), Tied(3)
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
      and(eq(vote.voter, voterAddr), eq(round.state, 0)),
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
  const sortBy = c.req.query("sortBy") ?? "winRate";
  const minVotesParam = c.req.query("minVotes") ?? "3";
  const limit = safeLimit(c.req.query("limit"), 20, 100);
  const offset = safeOffset(c.req.query("offset"));

  const minVotes = parseInt(minVotesParam);
  if (isNaN(minVotes) || minVotes < 1) return c.json({ error: "Invalid minVotes" }, 400);

  let orderByExpr;
  switch (sortBy) {
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

  if (categoryIdParam) {
    const categoryId = safeBigInt(categoryIdParam);
    if (categoryId === null) return c.json({ error: "Invalid categoryId" }, 400);

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

    return jsonBig(c, { items: result, categoryId: categoryIdParam });
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

  return jsonBig(c, { items: result });
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

  return jsonBig(c, { items });
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
