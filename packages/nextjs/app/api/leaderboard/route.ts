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
const MAX_LIMIT = 100;

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

    // Try Ponder first for complete holder discovery.
    let candidateAddresses: string[] = [];
    let source: "ponder" | "rpc" = "rpc";

    const ponderAvailable = await isPonderAvailable();
    if (ponderAvailable) {
      try {
        const holders = await ponderApi.getAllTokenHolders();
        candidateAddresses = holders.map(holder => holder.address);
        source = "ponder";
      } catch (e) {
        console.warn("Ponder token-holder discovery failed, falling back to profile registry:", e);
      }
    }

    if (candidateAddresses.length === 0) {
      const { addresses } = await listRegisteredProfileAddresses({ limit });
      candidateAddresses = addresses;
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
      profileImageUrl: profiles[address]?.profileImageUrl ?? null,
      balance: (balances[address] ?? 0n).toString(),
    }));

    return NextResponse.json({
      entries,
      totalCount: entries.length,
      source,
      type: "voters",
    });
  } catch (error) {
    console.error("Error fetching leaderboard data:", error);
    return NextResponse.json({ error: "Failed to fetch leaderboard" }, { status: 500 });
  }
}
