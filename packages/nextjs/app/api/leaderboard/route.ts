import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { readCRepBalances, readProfileRegistryProfiles } from "~~/lib/profileRegistry/server";
import { isPonderAvailable, ponderApi } from "~~/services/ponder/client";
import { checkRateLimit } from "~~/utils/rateLimit";

const RATE_LIMIT = { limit: 60, windowMs: 60_000 };
const MAX_LIMIT = 100;

async function buildIncludedAddressFallback(address: string) {
  const [balances, profiles] = await Promise.all([readCRepBalances([address]), readProfileRegistryProfiles([address])]);

  return NextResponse.json({
    entries: [
      {
        rank: 0,
        address,
        username: profiles[address]?.username ?? null,
        balance: (balances[address] ?? 0n).toString(),
      },
    ],
    totalCount: 1,
    source: "onchain_fallback",
    type: "voters",
  });
}

// GET: Fetch cREP leaderboard data.
// Uses Ponder when available for candidate discovery, then ranks by live on-chain cREP balances.
export async function GET(request: NextRequest) {
  const limited = await checkRateLimit(request, RATE_LIMIT);
  if (limited) return limited;

  try {
    const requestedType = request.nextUrl.searchParams.get("type");
    if (requestedType && requestedType !== "voters") {
      return NextResponse.json({ error: "Unsupported leaderboard type" }, { status: 400 });
    }
    const limit = Math.min(Math.max(parseInt(request.nextUrl.searchParams.get("limit") ?? "20") || 20, 1), MAX_LIMIT);
    const includeAddressParam = request.nextUrl.searchParams.get("includeAddress");
    const includeAddress =
      includeAddressParam && isAddress(includeAddressParam) ? includeAddressParam.toLowerCase() : null;
    const canFallbackToIncludedAddress = includeAddress !== null && limit === 1;

    // Try Ponder first for complete holder discovery.
    const ponderAvailable = await isPonderAvailable();
    if (!ponderAvailable) {
      if (canFallbackToIncludedAddress) {
        return buildIncludedAddressFallback(includeAddress);
      }

      return NextResponse.json(
        { error: "Leaderboard is temporarily unavailable while the indexer is offline" },
        { status: 503 },
      );
    }

    let candidateAddresses: string[];
    try {
      const holders = await ponderApi.getAllTokenHolders();
      candidateAddresses = holders.map(holder => holder.address);
    } catch (e) {
      if (canFallbackToIncludedAddress) {
        console.warn("Ponder token-holder discovery failed, using included-address fallback");
        return buildIncludedAddressFallback(includeAddress);
      }

      console.warn("Ponder token-holder discovery failed:", e);
      return NextResponse.json(
        { error: "Leaderboard is temporarily unavailable while holder indexing catches up" },
        { status: 503 },
      );
    }

    if (includeAddress && !candidateAddresses.some(address => address.toLowerCase() === includeAddress)) {
      candidateAddresses.push(includeAddress);
    }

    const normalizedAddresses = [...new Set(candidateAddresses.map(address => address.toLowerCase()))];
    const balances = await readCRepBalances(normalizedAddresses);

    const rankedAddresses = normalizedAddresses
      .filter(address => address === includeAddress || (balances[address] ?? 0n) > 0n)
      .sort((left, right) => {
        const leftBalance = balances[left] ?? 0n;
        const rightBalance = balances[right] ?? 0n;
        if (rightBalance > leftBalance) return 1;
        if (rightBalance < leftBalance) return -1;
        return left.localeCompare(right);
      });

    const selectedAddresses = rankedAddresses.slice(0, limit);
    if (includeAddress && !selectedAddresses.includes(includeAddress) && rankedAddresses.includes(includeAddress)) {
      selectedAddresses.push(includeAddress);
    }

    const profiles = await readProfileRegistryProfiles(selectedAddresses);
    const ranks = new Map(rankedAddresses.map((address, index) => [address, index + 1]));
    const entries = selectedAddresses.map(address => ({
      rank: ranks.get(address) ?? 0,
      address,
      username: profiles[address]?.username ?? null,
      balance: (balances[address] ?? 0n).toString(),
    }));

    return NextResponse.json({
      entries,
      totalCount: entries.length,
      source: "ponder",
      type: "voters",
    });
  } catch (error) {
    console.error("Error fetching leaderboard data:", error);
    return NextResponse.json({ error: "Failed to fetch leaderboard" }, { status: 500 });
  }
}
