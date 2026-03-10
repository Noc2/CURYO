import { NextRequest, NextResponse } from "next/server";
import {
  COMMENT_CHALLENGE_ACTION,
  COMMENT_CHALLENGE_TITLE,
  hashCommentChallengePayload,
  normalizeCommentChallengeInput,
} from "~~/lib/auth/commentChallenge";
import { issueSignedActionChallenge } from "~~/lib/auth/signedActions";
import { checkRateLimit } from "~~/utils/rateLimit";

const RATE_LIMIT = { limit: 10, windowMs: 60_000 };

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      address?: string;
      contentId?: string | number | bigint;
      body?: string;
    };
    const limited = await checkRateLimit(request, RATE_LIMIT, {
      extraKeyParts: [typeof body.address === "string" ? body.address : undefined],
    });
    if (limited) return limited;

    const normalized = normalizeCommentChallengeInput(body);
    if (!normalized.ok) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }

    const challenge = await issueSignedActionChallenge({
      title: COMMENT_CHALLENGE_TITLE,
      action: COMMENT_CHALLENGE_ACTION,
      walletAddress: normalized.payload.normalizedAddress,
      payloadHash: hashCommentChallengePayload(normalized.payload),
    });

    return NextResponse.json(challenge);
  } catch (error) {
    console.error("Error creating comment challenge:", error);
    return NextResponse.json({ error: "Failed to create challenge" }, { status: 500 });
  }
}
