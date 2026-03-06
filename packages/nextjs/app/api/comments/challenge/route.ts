import { NextRequest, NextResponse } from "next/server";
import {
  COMMENT_CHALLENGE_ACTION,
  createCommentChallenge,
  normalizeCommentChallengeInput,
} from "~~/lib/auth/commentChallenge";
import {
  cleanupSignedActionChallenges,
  ensureSignedActionChallengeTable,
  persistSignedActionChallenge,
} from "~~/lib/auth/signedActions";
import { checkRateLimit } from "~~/utils/rateLimit";

const RATE_LIMIT = { limit: 10, windowMs: 60_000 };

export async function POST(request: NextRequest) {
  const limited = await checkRateLimit(request, RATE_LIMIT);
  if (limited) return limited;

  try {
    const body = (await request.json()) as {
      address?: string;
      contentId?: string | number | bigint;
      body?: string;
    };

    const normalized = normalizeCommentChallengeInput(body);
    if (!normalized.ok) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }

    await ensureSignedActionChallengeTable();

    const challenge = createCommentChallenge(normalized.payload);
    await cleanupSignedActionChallenges();
    await persistSignedActionChallenge({
      challengeId: challenge.challengeId,
      action: COMMENT_CHALLENGE_ACTION,
      walletAddress: normalized.payload.normalizedAddress,
      payloadHash: challenge.payloadHash,
      nonce: challenge.nonce,
      expiresAt: challenge.expiresAt,
      createdAt: challenge.createdAt,
    });

    return NextResponse.json({
      challengeId: challenge.challengeId,
      message: challenge.message,
      expiresAt: challenge.expiresAt.toISOString(),
    });
  } catch (error) {
    console.error("Error creating comment challenge:", error);
    return NextResponse.json({ error: "Failed to create challenge" }, { status: 500 });
  }
}
