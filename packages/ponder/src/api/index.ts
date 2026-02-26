import { Hono } from "hono";
import { cors } from "hono/cors";
import { db } from "ponder:api";
import {
  content,
  round,
  vote,
  pendingCommit,
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
} from "ponder:schema";
import { eq, desc, asc, and, or, inArray, sql, replaceBigInts } from "ponder";

const app = new Hono();

// Enable CORS for frontend access (restrict via CORS_ORIGIN in production, comma-separated)
const corsOrigin = process.env.CORS_ORIGIN;
if (!corsOrigin) {
  console.warn("[ponder] WARNING: CORS_ORIGIN not set — allowing all origins. Set CORS_ORIGIN in production.");
}
app.use(
  "/*",
  cors({
    origin: corsOrigin ? corsOrigin.split(",").map(o => o.trim()) : "*",
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

  // Unrevealed commits: stakes in pendingCommit where revealed = false
  const [pendingResult] = await db
    .select({
      total: sql<string>`coalesce(sum(${pendingCommit.stake}), 0)`,
      count: sql<number>`count(*)`,
    })
    .from(pendingCommit)
    .where(
      and(
        eq(pendingCommit.voter, voterAddr),
        eq(pendingCommit.revealed, false),
      ),
    );

  // Revealed but unsettled votes: stakes in vote where round state is Open (0)
  // Round states: Open(0), Settled(1), Cancelled(2), Tied(3)
  const [revealedResult] = await db
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
    pendingStake: pendingResult?.total ?? "0",
    pendingCount: pendingResult?.count ?? 0,
    revealingStake: revealedResult?.total ?? "0",
    revealingCount: revealedResult?.count ?? 0,
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
    .orderBy(desc(vote.revealedAt))
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
  const profileAddresses = new Set(profileItems.map((p) => p.address));
  let holderOnly: typeof profileItems = [];

  if (remaining > 0) {
    const holders = await db.select().from(tokenHolder).limit(remaining + profileItems.length);
    holderOnly = holders
      .filter((h) => !profileAddresses.has(h.address))
      .slice(0, remaining)
      .map((h) => ({
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
// VOTES
// ============================================================

app.get("/votes", async (c) => {
  const voterRaw = c.req.query("voter");
  const contentId = c.req.query("contentId");
  const roundId = c.req.query("roundId");
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

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const items = await db
    .select()
    .from(vote)
    .where(where)
    .orderBy(desc(vote.revealedAt))
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

export default app;
