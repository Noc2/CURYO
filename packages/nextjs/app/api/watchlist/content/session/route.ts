import { NextRequest, NextResponse } from "next/server";
import { getSignedCollectionSessionStatus } from "~~/lib/auth/signedCollectionRoute";
import { WATCHLIST_SIGNED_READ_SESSION_COOKIE_NAME } from "~~/lib/auth/signedReadSessions";
import { WATCHLIST_SIGNED_WRITE_SESSION_COOKIE_NAME } from "~~/lib/auth/signedWriteSessions";
import { isValidWalletAddress, normalizeWalletAddress } from "~~/lib/watchlist/contentWatch";
import { checkRateLimit } from "~~/utils/rateLimit";

const READ_RATE_LIMIT = { limit: 60, windowMs: 60_000 };

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address");
  const limited = await checkRateLimit(request, READ_RATE_LIMIT, {
    extraKeyParts: [typeof address === "string" ? address : undefined],
  });
  if (limited) return limited;

  if (!address || !isValidWalletAddress(address)) {
    return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
  }

  try {
    const normalizedAddress = normalizeWalletAddress(address);
    const { hasReadSession, hasWriteSession } = await getSignedCollectionSessionStatus(request, {
      walletAddress: normalizedAddress,
      readCookieName: WATCHLIST_SIGNED_READ_SESSION_COOKIE_NAME,
      readScope: "watchlist",
      writeCookieName: WATCHLIST_SIGNED_WRITE_SESSION_COOKIE_NAME,
      writeScope: "watchlist",
    });

    return NextResponse.json({
      hasSession: hasReadSession,
      hasReadSession,
      hasWriteSession,
    });
  } catch (error) {
    console.error("Error checking watchlist signed read session:", error);
    return NextResponse.json({ error: "Failed to check watchlist session" }, { status: 500 });
  }
}
