import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { getPrimaryServerTargetNetwork, getServerTargetNetworkById } from "~~/lib/env/server";
import { listClaimableFrontendFeeRounds } from "~~/lib/frontendFees/server";
import { checkRateLimit } from "~~/utils/rateLimit";

const RATE_LIMIT = { limit: 60, windowMs: 60_000 };

export async function GET(request: NextRequest) {
  const frontend = request.nextUrl.searchParams.get("frontend");
  const chainIdRaw = request.nextUrl.searchParams.get("chainId");
  const limited = await checkRateLimit(request, RATE_LIMIT, {
    allowOnStoreUnavailable: true,
    extraKeyParts: [
      typeof frontend === "string" ? frontend : undefined,
      typeof chainIdRaw === "string" ? chainIdRaw : undefined,
    ],
  });
  if (limited) return limited;

  if (!frontend || !isAddress(frontend)) {
    return NextResponse.json({ error: "Valid frontend address is required" }, { status: 400 });
  }

  const fallbackChainId = getPrimaryServerTargetNetwork()?.id;
  const parsedChainId = chainIdRaw ? Number.parseInt(chainIdRaw, 10) : fallbackChainId;
  if (!Number.isFinite(parsedChainId)) {
    return NextResponse.json({ error: "Valid chainId is required" }, { status: 400 });
  }

  if (!getServerTargetNetworkById(parsedChainId!)) {
    return NextResponse.json({ error: "Unsupported chainId" }, { status: 400 });
  }

  const limit = Math.min(Math.max(parseInt(request.nextUrl.searchParams.get("limit") ?? "10") || 10, 1), 50);
  const offset = Math.max(parseInt(request.nextUrl.searchParams.get("offset") ?? "0") || 0, 0);

  try {
    const result = await listClaimableFrontendFeeRounds(frontend, { chainId: parsedChainId!, limit, offset });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to fetch claimable frontend fees:", error);
    return NextResponse.json({ error: "Failed to fetch claimable frontend fees" }, { status: 500 });
  }
}
