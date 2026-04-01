import { NextRequest, NextResponse } from "next/server";
import {
  MCP_SESSION_ACTION,
  buildMcpSessionChallengeMessage,
  hashMcpSessionPayload,
  issueMcpSessionToken,
  mapMcpSessionAuthError,
  normalizeMcpSessionRequest,
} from "~~/lib/ai/mcpSessionAuth";
import { verifySignedActionChallenge } from "~~/lib/auth/signedRouteHelpers";
import { checkRateLimit } from "~~/utils/rateLimit";

const RATE_LIMIT = { limit: 20, windowMs: 60_000 };
const SIGNATURE_REGEX = /^0x[0-9a-fA-F]{130}$/;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const normalized = normalizeMcpSessionRequest(body);
    const limited = await checkRateLimit(request, RATE_LIMIT, {
      extraKeyParts: [
        typeof body.address === "string" ? body.address : undefined,
        typeof body.challengeId === "string" ? body.challengeId : undefined,
      ],
    });
    if (limited) return limited;

    if (!normalized.ok) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }

    const challengeId = typeof body.challengeId === "string" ? body.challengeId.trim() : "";
    if (!challengeId) {
      return NextResponse.json({ error: "Missing challengeId" }, { status: 400 });
    }

    const signature = typeof body.signature === "string" ? body.signature.trim() : "";
    if (!SIGNATURE_REGEX.test(signature)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    const payloadHash = hashMcpSessionPayload(normalized.payload);
    const challengeFailure = await verifySignedActionChallenge({
      challengeId,
      action: MCP_SESSION_ACTION,
      walletAddress: normalized.payload.normalizedAddress,
      payloadHash,
      signature: signature as `0x${string}`,
      buildMessage: ({ nonce, expiresAt }) =>
        buildMcpSessionChallengeMessage({
          address: normalized.payload.normalizedAddress,
          payloadHash,
          nonce,
          expiresAt,
        }),
    });
    if (challengeFailure) {
      return challengeFailure;
    }

    return NextResponse.json(issueMcpSessionToken(normalized.payload));
  } catch (error) {
    const mapped = mapMcpSessionAuthError(error);
    if (mapped) {
      return NextResponse.json({ error: mapped.error }, { status: mapped.status });
    }

    console.error("Error minting MCP session token:", error);
    return NextResponse.json({ error: "Failed to mint MCP session token" }, { status: 500 });
  }
}
