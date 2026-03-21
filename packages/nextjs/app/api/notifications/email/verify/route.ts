import { NextRequest, NextResponse } from "next/server";
import { verifyEmailNotificationToken } from "~~/lib/notifications/emailSettings";

function buildRedirect(request: NextRequest, status: "verified" | "invalid") {
  const url = new URL("/settings", request.nextUrl);
  url.searchParams.set("tab", "notifications");
  url.searchParams.set("email", status);
  return url;
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(buildRedirect(request, "invalid"));
  }

  const result = await verifyEmailNotificationToken(token);
  return NextResponse.redirect(buildRedirect(request, result.ok ? "verified" : "invalid"));
}
