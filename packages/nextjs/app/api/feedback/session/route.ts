import { NextRequest, NextResponse } from "next/server";
import {
  CONTENT_FEEDBACK_SIGNED_READ_SESSION_COOKIE_NAME,
  verifySignedReadSession,
} from "~~/lib/auth/signedReadSessions";
import { isValidWalletAddress, normalizeWalletAddress } from "~~/lib/watchlist/contentWatch";
import { checkRateLimit } from "~~/utils/rateLimit";

const RATE_LIMIT = { limit: 60, windowMs: 60_000 };

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address");
  const limited = await checkRateLimit(request, RATE_LIMIT, {
    extraKeyParts: [typeof address === "string" ? address : undefined],
  });
  if (limited) return limited;

  try {
    if (!address || !isValidWalletAddress(address)) {
      return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
    }

    const normalizedAddress = normalizeWalletAddress(address);
    const hasReadSession = await verifySignedReadSession(
      request.cookies.get(CONTENT_FEEDBACK_SIGNED_READ_SESSION_COOKIE_NAME)?.value,
      normalizedAddress,
      "content_feedback",
    );

    return NextResponse.json({
      hasSession: hasReadSession,
      hasReadSession,
    });
  } catch (error) {
    console.error("Error checking feedback session:", error);
    return NextResponse.json({ error: "Failed to check feedback session" }, { status: 500 });
  }
}
