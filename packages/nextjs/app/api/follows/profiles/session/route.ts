import { NextRequest, NextResponse } from "next/server";
import { normalizeProfileFollowReadInput } from "~~/lib/auth/profileFollowChallenge";
import {
  PROFILE_FOLLOWS_SIGNED_READ_SESSION_COOKIE_NAME,
  verifySignedReadSession,
} from "~~/lib/auth/signedReadSessions";
import {
  PROFILE_FOLLOWS_SIGNED_WRITE_SESSION_COOKIE_NAME,
  verifySignedWriteSession,
} from "~~/lib/auth/signedWriteSessions";
import { checkRateLimit } from "~~/utils/rateLimit";

const READ_RATE_LIMIT = { limit: 60, windowMs: 60_000 };

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address");
  const limited = await checkRateLimit(request, READ_RATE_LIMIT, {
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
    const hasReadSession = await verifySignedReadSession(
      request.cookies.get(PROFILE_FOLLOWS_SIGNED_READ_SESSION_COOKIE_NAME)?.value,
      normalized.payload.normalizedAddress,
      "profile_follows",
    );
    const hasWriteSession = await verifySignedWriteSession(
      request.cookies.get(PROFILE_FOLLOWS_SIGNED_WRITE_SESSION_COOKIE_NAME)?.value,
      normalized.payload.normalizedAddress,
      "profile_follows",
    );

    return NextResponse.json({
      hasSession: hasReadSession,
      hasReadSession,
      hasWriteSession,
    });
  } catch (error) {
    console.error("Error checking profile follow session:", error);
    return NextResponse.json({ error: "Failed to check follow session" }, { status: 500 });
  }
}
