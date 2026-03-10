import { NextRequest, NextResponse } from "next/server";
import { getOptionalAppUrl } from "~~/lib/env/server";
import { verifyEmailNotificationToken } from "~~/lib/notifications/emailSettings";

function buildRedirect(status: "verified" | "invalid") {
  const base = getOptionalAppUrl() ?? "http://localhost:3000";
  const url = new URL("/settings/notifications", base);
  url.searchParams.set("email", status);
  return url;
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(buildRedirect("invalid"));
  }

  const result = await verifyEmailNotificationToken(token);
  return NextResponse.redirect(buildRedirect(result.ok ? "verified" : "invalid"));
}
