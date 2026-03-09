import { NextRequest, NextResponse } from "next/server";
import { listRegisteredProfileAddresses, readProfileRegistryProfiles } from "~~/lib/profileRegistry/server";
import { isPonderAvailable, ponderApi } from "~~/services/ponder/client";
import { checkRateLimit } from "~~/utils/rateLimit";

const RATE_LIMIT = { limit: 60, windowMs: 60_000 };
const ALLOWED_TYPES = ["voters", "content", "rewards"];
const MAX_LIMIT = 100;

// GET: Fetch leaderboard data
// Uses Ponder when available for richer data (vote counts, rewards), falls back to direct ProfileRegistry reads
export async function GET(request: NextRequest) {
  const limited = await checkRateLimit(request, RATE_LIMIT);
  if (limited) return limited;

  try {
    const rawType = request.nextUrl.searchParams.get("type") ?? "voters";
    const type = ALLOWED_TYPES.includes(rawType) ? rawType : "voters";
    const limit = String(
      Math.min(Math.max(parseInt(request.nextUrl.searchParams.get("limit") ?? "20") || 20, 1), MAX_LIMIT),
    );

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

    // Fallback: direct on-chain ProfileRegistry reads
    const { addresses, total } = await listRegisteredProfileAddresses({ limit: Number(limit) });
    const profiles = await readProfileRegistryProfiles(addresses);

    const entries = addresses.map(address => ({
      address,
      username: profiles[address]?.username || null,
      profileImageUrl: profiles[address]?.profileImageUrl || null,
    }));

    return NextResponse.json({
      users: entries,
      totalCount: total,
      source: "rpc",
    });
  } catch (error) {
    console.error("Error fetching leaderboard data:", error);
    return NextResponse.json({ error: "Failed to fetch leaderboard" }, { status: 500 });
  }
}
