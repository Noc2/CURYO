import { NextRequest, NextResponse } from "next/server";
import {
  FOLLOW_PROFILE_ACTION,
  UNFOLLOW_PROFILE_ACTION,
  createFollowProfileChallenge,
  normalizeFollowProfileChallengeInput,
} from "~~/lib/auth/followProfileChallenge";
import {
  cleanupSignedActionChallenges,
  ensureSignedActionChallengeTable,
  persistSignedActionChallenge,
} from "~~/lib/auth/signedActions";
import { checkRateLimit } from "~~/utils/rateLimit";

const RATE_LIMIT = { limit: 20, windowMs: 60_000 };

export async function POST(request: NextRequest) {
  const limited = await checkRateLimit(request, RATE_LIMIT);
  if (limited) return limited;

  try {
    const body = (await request.json()) as {
      address?: string;
      targetAddress?: string;
      action?: "follow" | "unfollow";
    };

    const normalized = normalizeFollowProfileChallengeInput(body);
    if (!normalized.ok) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }

    const action = body.action === "unfollow" ? UNFOLLOW_PROFILE_ACTION : FOLLOW_PROFILE_ACTION;
    await ensureSignedActionChallengeTable();

    const challenge = createFollowProfileChallenge(normalized.payload, action);
    await cleanupSignedActionChallenges();
    await persistSignedActionChallenge({
      challengeId: challenge.challengeId,
      action,
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
    console.error("Error creating follow challenge:", error);
    return NextResponse.json({ error: "Failed to create challenge" }, { status: 500 });
  }
}
