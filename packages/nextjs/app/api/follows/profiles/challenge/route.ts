import { NextRequest, NextResponse } from "next/server";
import {
  FOLLOW_PROFILE_ACTION,
  FOLLOW_PROFILE_CHALLENGE_TITLE,
  UNFOLLOW_PROFILE_ACTION,
  hashFollowProfileChallengePayload,
  normalizeFollowProfileChallengeInput,
} from "~~/lib/auth/followProfileChallenge";
import { issueSignedActionChallenge } from "~~/lib/auth/signedActions";
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
    const challenge = await issueSignedActionChallenge({
      title: FOLLOW_PROFILE_CHALLENGE_TITLE,
      action,
      walletAddress: normalized.payload.normalizedAddress,
      payloadHash: hashFollowProfileChallengePayload(normalized.payload),
    });

    return NextResponse.json(challenge);
  } catch (error) {
    console.error("Error creating follow challenge:", error);
    return NextResponse.json({ error: "Failed to create challenge" }, { status: 500 });
  }
}
