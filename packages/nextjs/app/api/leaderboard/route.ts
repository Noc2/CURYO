import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import {
  listRegisteredProfileAddresses,
  readCRepBalances,
  readProfileRegistryProfiles,
} from "~~/lib/profileRegistry/server";
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
    const includeAddressParam = request.nextUrl.searchParams.get("includeAddress");
    const includeAddress =
      includeAddressParam && isAddress(includeAddressParam) ? includeAddressParam.toLowerCase() : null;

    // Try Ponder first for enriched leaderboard data
    let users: {
      address: string;
      username: string | null;
      profileImageUrl: string | null;
    }[] = [];
    let source: "ponder" | "rpc" = "rpc";

    const ponderAvailable = await isPonderAvailable();
    if (ponderAvailable) {
      try {
        const result = await ponderApi.getLeaderboard(type, limit);
        users = result.items.map(p => ({
          address: p.address,
          username: p.name || null,
          profileImageUrl: p.imageUrl || null,
        }));
        source = "ponder";
      } catch (e) {
        console.warn("Ponder leaderboard failed, falling back to DB:", e);
      }
    }

    if (users.length === 0) {
      const { addresses } = await listRegisteredProfileAddresses({ limit: Number(limit) });
      const profiles = await readProfileRegistryProfiles(addresses);

      users = addresses.map(address => ({
        address,
        username: profiles[address]?.username || null,
        profileImageUrl: profiles[address]?.profileImageUrl || null,
      }));
    }

    if (includeAddress && !users.some(user => user.address.toLowerCase() === includeAddress)) {
      users.push({
        address: includeAddress,
        username: null,
        profileImageUrl: null,
      });
    }

    const normalizedUsers = users.map(user => ({
      ...user,
      address: user.address.toLowerCase(),
    }));
    const [onChainProfiles, balances] = await Promise.all([
      readProfileRegistryProfiles(normalizedUsers.map(user => user.address)),
      readCRepBalances(normalizedUsers.map(user => user.address)),
    ]);

    const entries = normalizedUsers
      .map(user => {
        const onChainProfile = onChainProfiles[user.address];
        return {
          rank: 0,
          address: user.address,
          username: onChainProfile?.username ?? user.username,
          profileImageUrl: onChainProfile?.profileImageUrl ?? user.profileImageUrl,
          balance: (balances[user.address] ?? 0n).toString(),
        };
      })
      .filter(entry => BigInt(entry.balance) > 0n)
      .sort((left, right) => {
        const leftBalance = BigInt(left.balance);
        const rightBalance = BigInt(right.balance);
        if (rightBalance > leftBalance) return 1;
        if (rightBalance < leftBalance) return -1;
        return left.address.localeCompare(right.address);
      })
      .map((entry, index) => ({
        ...entry,
        rank: index + 1,
      }));

    return NextResponse.json({
      entries,
      totalCount: entries.length,
      source,
    });
  } catch (error) {
    console.error("Error fetching leaderboard data:", error);
    return NextResponse.json({ error: "Failed to fetch leaderboard" }, { status: 500 });
  }
}
