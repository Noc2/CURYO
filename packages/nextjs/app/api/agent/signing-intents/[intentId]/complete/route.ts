import { NextRequest, NextResponse } from "next/server";
import { AGENT_WRITE_RATE_LIMIT, handlePublicAgentRoute, parseJsonBody } from "~~/lib/agent/http";
import { completeAgentSigningIntent } from "~~/lib/agent/signingIntents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: { params: Promise<{ intentId: string }> }) {
  const body = await parseJsonBody(request);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const { intentId } = await context.params;
  const { token, transactionHashes } = body as {
    token?: unknown;
    transactionHashes?: unknown;
  };
  if (typeof token !== "string" || !token.trim()) {
    return NextResponse.json({ error: "token is required." }, { status: 400 });
  }

  return handlePublicAgentRoute({
    handler: () =>
      completeAgentSigningIntent({
        intentId,
        token,
        transactionHashes,
      }),
    rateLimit: AGENT_WRITE_RATE_LIMIT,
    request,
  });
}
