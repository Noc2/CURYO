import { NextRequest, NextResponse } from "next/server";
import {
  getDefaultMcpSessionTtlMs,
  issueMcpSessionChallenge,
  mapMcpSessionAuthError,
  normalizeMcpSessionRequest,
} from "~~/lib/ai/mcpSessionAuth";
import { checkRateLimit } from "~~/utils/rateLimit";

const RATE_LIMIT = { limit: 20, windowMs: 60_000 };

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const normalized = normalizeMcpSessionRequest(body);
    const limited = await checkRateLimit(request, RATE_LIMIT, {
      extraKeyParts: [
        typeof body.address === "string" ? body.address : undefined,
        Array.isArray(body.scopes) ? body.scopes.join(",") : undefined,
        typeof body.clientName === "string" ? body.clientName : undefined,
      ],
    });
    if (limited) return limited;

    if (!normalized.ok) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }

    const { challenge, binding } = await issueMcpSessionChallenge(normalized.payload);
    return NextResponse.json({
      ...challenge,
      requestedScopes: normalized.payload.scopes,
      clientName: normalized.payload.clientName,
      identityBound: !!binding.identityId,
      sessionTtlSeconds: Math.floor(getDefaultMcpSessionTtlMs() / 1000),
    });
  } catch (error) {
    const mapped = mapMcpSessionAuthError(error);
    if (mapped) {
      return NextResponse.json({ error: mapped.error }, { status: mapped.status });
    }

    console.error("Error creating MCP session challenge:", error);
    return NextResponse.json({ error: "Failed to create MCP session challenge" }, { status: 500 });
  }
}
