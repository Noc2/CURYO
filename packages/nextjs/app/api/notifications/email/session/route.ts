import { NextRequest, NextResponse } from "next/server";
import { normalizeNotificationEmailReadInput } from "~~/lib/auth/notificationEmails";
import {
  NOTIFICATION_EMAIL_SIGNED_READ_SESSION_COOKIE_NAME,
  verifySignedReadSession,
} from "~~/lib/auth/signedReadSessions";
import { checkRateLimit } from "~~/utils/rateLimit";

const READ_RATE_LIMIT = { limit: 30, windowMs: 60_000 };

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address");
  const limited = await checkRateLimit(request, READ_RATE_LIMIT, {
    extraKeyParts: [typeof address === "string" ? address : undefined],
  });
  if (limited) return limited;

  const normalized = normalizeNotificationEmailReadInput({
    address: typeof address === "string" ? address : undefined,
  });
  if (!normalized.ok) {
    return NextResponse.json({ error: normalized.error }, { status: 400 });
  }

  try {
    const hasSession = await verifySignedReadSession(
      request.cookies.get(NOTIFICATION_EMAIL_SIGNED_READ_SESSION_COOKIE_NAME)?.value,
      normalized.payload.normalizedAddress,
      "notification_email",
    );

    return NextResponse.json({ hasSession });
  } catch (error) {
    console.error("Error checking notification email signed read session:", error);
    return NextResponse.json({ error: "Failed to check email notification session" }, { status: 500 });
  }
}
