import { NextRequest, NextResponse } from "next/server";
import { sweepAgentLifecycleCallbacks } from "~~/lib/agent-callbacks/lifecycle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
}

function parseLimit(request: NextRequest) {
  const value = Number.parseInt(request.nextUrl.searchParams.get("limit") ?? "", 10);
  return Number.isSafeInteger(value) && value > 0 ? Math.min(value, 100) : 25;
}

export async function POST(request: NextRequest) {
  const secret = process.env.CURYO_AGENT_CALLBACK_DELIVERY_SECRET?.trim() ?? "";
  if (!secret) {
    return NextResponse.json({ error: "Callback delivery is not configured." }, { status: 503 });
  }

  const token = request.headers.get("x-curyo-agent-callback-secret")?.trim() || readBearerToken(request);
  if (token !== secret) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  return NextResponse.json(await sweepAgentLifecycleCallbacks({ limit: parseLimit(request) }));
}
