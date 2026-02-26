import { NextResponse } from "next/server";
import { db } from "~~/lib/db";
import { userProfiles } from "~~/lib/db/schema";
import { isPonderAvailable, ponderApi } from "~~/services/ponder/client";

const ALLOWED_TYPES = ["voters", "content", "rewards"];
const MAX_LIMIT = 100;

// GET: Fetch leaderboard data
// Uses Ponder when available for richer data (vote counts, rewards), falls back to local DB
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawType = searchParams.get("type") ?? "voters";
    const type = ALLOWED_TYPES.includes(rawType) ? rawType : "voters";
    const limit = String(Math.min(Math.max(parseInt(searchParams.get("limit") ?? "20") || 20, 1), MAX_LIMIT));

    // Try Ponder first for enriched leaderboard data
    const ponderAvailable = await isPonderAvailable();
    if (ponderAvailable) {
      try {
        const result = await ponderApi.getLeaderboard(type, limit);
        const entries = result.items.map(p => ({
          address: p.address,
          username: p.name || null,
          profileImageUrl: p.imageUrl || null,
          totalVotes: p.totalVotes,
          totalContent: p.totalContent,
          totalRewardsClaimed: p.totalRewardsClaimed,
        }));
        return NextResponse.json({
          users: entries,
          totalCount: entries.length,
          source: "ponder",
        });
      } catch (e) {
        console.warn("Ponder leaderboard failed, falling back to DB:", e);
      }
    }

    // Fallback: local database (user profiles only)
    const profiles = await db.select().from(userProfiles).limit(Number(limit));

    const entries = profiles.map(profile => ({
      address: profile.walletAddress,
      username: profile.username,
      profileImageUrl: profile.profileImageUrl || null,
    }));

    return NextResponse.json({
      users: entries,
      totalCount: entries.length,
      source: "rpc",
    });
  } catch (error) {
    console.error("Error fetching leaderboard data:", error);
    return NextResponse.json({ error: "Failed to fetch leaderboard" }, { status: 500 });
  }
}
