import { NextRequest, NextResponse } from "next/server";
import { AGENT_WRITE_RATE_LIMIT, handlePublicAgentRoute, parseJsonBody } from "~~/lib/agent/http";
import { createAgentSigningIntent } from "~~/lib/agent/signingIntents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readTtlMs(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export async function POST(request: NextRequest) {
  const body = await parseJsonBody(request);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const requestBody = "request" in body ? (body as { request?: unknown }).request : body;
  const origin = new URL(request.url).origin;

  return handlePublicAgentRoute({
    handler: () =>
      createAgentSigningIntent({
        origin,
        requestBody,
        ttlMs: readTtlMs((body as { ttlMs?: unknown }).ttlMs),
      }),
    rateLimit: AGENT_WRITE_RATE_LIMIT,
    request,
  });
}
