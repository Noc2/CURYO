import { NextRequest, NextResponse } from "next/server";
import { normalizeProfileFollowReadInput } from "~~/lib/auth/profileFollowChallenge";
import { createSignedCollectionSessionResponse } from "~~/lib/auth/signedCollectionRoute";
import { PROFILE_FOLLOWS_SIGNED_READ_SESSION_COOKIE_NAME } from "~~/lib/auth/signedReadSessions";
import { PROFILE_FOLLOWS_SIGNED_WRITE_SESSION_COOKIE_NAME } from "~~/lib/auth/signedWriteSessions";
import { checkRateLimit } from "~~/utils/rateLimit";

const READ_RATE_LIMIT = { limit: 60, windowMs: 60_000 };

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address");
  const limited = await checkRateLimit(request, READ_RATE_LIMIT, {
    allowOnStoreUnavailable: true,
    extraKeyParts: [typeof address === "string" ? address : undefined],
  });
  if (limited) return limited;

  const normalized = normalizeProfileFollowReadInput({
    address: typeof address === "string" ? address : undefined,
  });
  if (!normalized.ok) {
    return NextResponse.json({ error: normalized.error }, { status: 400 });
  }

  try {
    return createSignedCollectionSessionResponse(request, {
      walletAddress: normalized.payload.normalizedAddress,
      readCookieName: PROFILE_FOLLOWS_SIGNED_READ_SESSION_COOKIE_NAME,
      readScope: "profile_follows",
      writeCookieName: PROFILE_FOLLOWS_SIGNED_WRITE_SESSION_COOKIE_NAME,
      writeScope: "profile_follows",
    });
  } catch (error) {
    console.error("Error checking profile follow session:", error);
    return NextResponse.json({ error: "Failed to check follow session" }, { status: 500 });
  }
}
