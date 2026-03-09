import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { readProfileRegistryProfile, readProfileRegistryProfiles } from "~~/lib/profileRegistry/server";
import { checkRateLimit } from "~~/utils/rateLimit";

const READ_RATE_LIMIT = { limit: 60, windowMs: 60_000 };

// GET: Fetch username(s) for address(es)
// Query params: ?address=0x... or ?addresses=0x...,0x...
export async function GET(request: NextRequest) {
  const limited = await checkRateLimit(request, READ_RATE_LIMIT);
  if (limited) return limited;

  try {
    const searchParams = request.nextUrl.searchParams;
    const singleAddress = searchParams.get("address");
    const multipleAddresses = searchParams.get("addresses");

    if (singleAddress) {
      if (!isAddress(singleAddress)) {
        return NextResponse.json({ error: "Invalid address parameter" }, { status: 400 });
      }

      const normalizedAddress = singleAddress.toLowerCase();
      const profile = await readProfileRegistryProfile(normalizedAddress);

      return NextResponse.json({
        address: normalizedAddress,
        username: profile.username,
        profileImageUrl: profile.profileImageUrl,
      });
    }

    if (multipleAddresses) {
      const addresses = multipleAddresses
        .split(",")
        .slice(0, 100)
        .map(a => a.toLowerCase());
      if (addresses.some(address => !isAddress(address))) {
        return NextResponse.json({ error: "Invalid addresses parameter" }, { status: 400 });
      }

      const profiles = await readProfileRegistryProfiles(addresses);

      const profilesMap: Record<string, { username: string | null; profileImageUrl: string | null }> = {};
      addresses.forEach(addr => {
        const profile = profiles[addr];
        profilesMap[addr] = {
          username: profile?.username || null,
          profileImageUrl: profile?.profileImageUrl || null,
        };
      });

      return NextResponse.json({ profiles: profilesMap });
    }

    return NextResponse.json({ error: "Missing address parameter" }, { status: 400 });
  } catch (error) {
    console.error("Error fetching username:", error);
    return NextResponse.json({ error: "Failed to fetch username" }, { status: 500 });
  }
}
