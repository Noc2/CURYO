import { NextRequest, NextResponse } from "next/server";
import { getNotificationDeliverySecret } from "~~/lib/env/server";
import { deliverNotificationEmails } from "~~/lib/notifications/emailDelivery";

function isAuthorized(request: NextRequest) {
  const secret = getNotificationDeliverySecret();
  if (!secret) {
    return { ok: false as const, reason: "missing_secret" };
  }

  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  const querySecret = request.nextUrl.searchParams.get("secret");
  const provided = bearerToken || querySecret;

  if (!provided || provided !== secret) {
    return { ok: false as const, reason: "unauthorized" };
  }

  return { ok: true as const };
}

export async function POST(request: NextRequest) {
  const auth = isAuthorized(request);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.reason === "missing_secret" ? "Notification delivery is not configured" : "Unauthorized" },
      { status: auth.reason === "missing_secret" ? 503 : 401 },
    );
  }

  try {
    const result = await deliverNotificationEmails();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Error delivering notification emails:", error);
    return NextResponse.json({ error: "Failed to deliver notification emails" }, { status: 500 });
  }
}
