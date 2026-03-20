import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { getNotificationDeliverySecret } from "~~/lib/env/server";
import { deliverNotificationEmails, getNotificationEmailDeliveryStatus } from "~~/lib/notifications/emailDelivery";

function constantTimeEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function isAuthorized(request: NextRequest) {
  const secret = getNotificationDeliverySecret();
  if (!secret) {
    return { ok: false as const, reason: "missing_secret" };
  }

  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

  if (!bearerToken || !constantTimeEquals(bearerToken, secret)) {
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

  const deliveryStatus = await getNotificationEmailDeliveryStatus();
  if (!deliveryStatus.ok) {
    return NextResponse.json({ error: deliveryStatus.error }, { status: 503 });
  }

  try {
    const result = await deliverNotificationEmails();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Error delivering notification emails:", error);
    return NextResponse.json({ error: "Failed to deliver notification emails" }, { status: 500 });
  }
}
