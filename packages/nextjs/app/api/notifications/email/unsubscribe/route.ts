import { NextRequest, NextResponse } from "next/server";
import { getNotificationDeliverySecret } from "~~/lib/env/server";
import { unsubscribeEmailNotificationSubscription } from "~~/lib/notifications/emailSettings";
import { verifyNotificationEmailUnsubscribeToken } from "~~/lib/notifications/emailUrls";

function buildRedirect(request: NextRequest, status: "unsubscribed" | "invalid_unsubscribe") {
  const url = new URL("/settings", request.nextUrl);
  url.searchParams.set("tab", "notifications");
  url.searchParams.set("email", status);
  return url;
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const secret = getNotificationDeliverySecret();

  if (!token || !secret) {
    return NextResponse.redirect(buildRedirect(request, "invalid_unsubscribe"));
  }

  const payload = verifyNotificationEmailUnsubscribeToken(token, secret);
  if (!payload) {
    return NextResponse.redirect(buildRedirect(request, "invalid_unsubscribe"));
  }

  const result = await unsubscribeEmailNotificationSubscription(payload.walletAddress as `0x${string}`, payload.email);
  return NextResponse.redirect(buildRedirect(request, result.ok ? "unsubscribed" : "invalid_unsubscribe"));
}
