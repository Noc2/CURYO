import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { listClaimableFrontendFeeRounds } from "~~/lib/frontendFees/server";
import { checkRateLimit } from "~~/utils/rateLimit";

const RATE_LIMIT = { limit: 60, windowMs: 60_000 };

export async function GET(request: NextRequest) {
  const frontend = request.nextUrl.searchParams.get("frontend");
  const limited = await checkRateLimit(request, RATE_LIMIT, {
    allowOnStoreUnavailable: true,
    extraKeyParts: [typeof frontend === "string" ? frontend : undefined],
  });
  if (limited) return limited;

  if (!frontend || !isAddress(frontend)) {
    return NextResponse.json({ error: "Valid frontend address is required" }, { status: 400 });
  }

  const limit = Math.min(Math.max(parseInt(request.nextUrl.searchParams.get("limit") ?? "10") || 10, 1), 50);
  const offset = Math.max(parseInt(request.nextUrl.searchParams.get("offset") ?? "0") || 0, 0);

  try {
    const result = await listClaimableFrontendFeeRounds(frontend, { limit, offset });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to fetch claimable frontend fees:", error);
    return NextResponse.json({ error: "Failed to fetch claimable frontend fees" }, { status: 500 });
  }
}
