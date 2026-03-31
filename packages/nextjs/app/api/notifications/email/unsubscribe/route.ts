import { NextRequest, NextResponse } from "next/server";
import { getNotificationDeliverySecret, getOptionalAppUrl } from "~~/lib/env/server";
import { unsubscribeEmailNotificationSubscription } from "~~/lib/notifications/emailSettings";
import {
  buildNotificationSettingsRedirectUrl,
  verifyNotificationEmailUnsubscribeToken,
} from "~~/lib/notifications/emailUrls";

function buildRedirect(request: NextRequest, status: "unsubscribed" | "invalid_unsubscribe") {
  return buildNotificationSettingsRedirectUrl({
    requestOrigin: request.nextUrl.origin,
    fallbackAppUrl: getOptionalAppUrl(),
    status,
  });
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const secret = getNotificationDeliverySecret();

  if (!token || !secret) {
    const redirectUrl = buildRedirect(request, "invalid_unsubscribe");
    return redirectUrl
      ? NextResponse.redirect(redirectUrl)
      : NextResponse.json({ ok: false, status: "invalid_unsubscribe" }, { status: 400 });
  }

  const payload = verifyNotificationEmailUnsubscribeToken(token, secret);
  if (!payload) {
    const redirectUrl = buildRedirect(request, "invalid_unsubscribe");
    return redirectUrl
      ? NextResponse.redirect(redirectUrl)
      : NextResponse.json({ ok: false, status: "invalid_unsubscribe" }, { status: 400 });
  }

  const result = await unsubscribeEmailNotificationSubscription(payload.walletAddress as `0x${string}`, payload.email);
  const status = result.ok ? "unsubscribed" : "invalid_unsubscribe";
  const redirectUrl = buildRedirect(request, status);
  return redirectUrl
    ? NextResponse.redirect(redirectUrl)
    : NextResponse.json({ ok: result.ok, status }, { status: result.ok ? 200 : 400 });
}
