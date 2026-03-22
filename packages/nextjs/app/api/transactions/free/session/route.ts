import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { getPrimaryServerTargetNetwork } from "~~/lib/env/server";
import { getFreeTransactionAllowanceSummary } from "~~/lib/thirdweb/freeTransactions";
import { checkRateLimit } from "~~/utils/rateLimit";

const READ_RATE_LIMIT = { limit: 60, windowMs: 60_000 };

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address");
  const limited = await checkRateLimit(request, READ_RATE_LIMIT, {
    extraKeyParts: [typeof address === "string" ? address : undefined],
  });
  if (limited) return limited;

  const chainIdRaw = request.nextUrl.searchParams.get("chainId");
  const fallbackChainId = getPrimaryServerTargetNetwork()?.id;
  const parsedChainId = chainIdRaw ? Number.parseInt(chainIdRaw, 10) : fallbackChainId;

  if (!address || !isAddress(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  if (!Number.isFinite(parsedChainId)) {
    return NextResponse.json({ error: "Invalid chain" }, { status: 400 });
  }

  try {
    const summary = await getFreeTransactionAllowanceSummary({
      address,
      chainId: parsedChainId!,
    });

    return NextResponse.json(summary);
  } catch (error) {
    console.error("Failed to read free transaction summary:", error);
    return NextResponse.json({ error: "Failed to read free transaction summary" }, { status: 500 });
  }
}
