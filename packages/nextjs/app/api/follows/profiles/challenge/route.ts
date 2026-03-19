import { NextRequest, NextResponse } from "next/server";
import {
  FOLLOW_PROFILE_ACTION,
  PROFILE_FOLLOW_CHALLENGE_TITLE,
  READ_PROFILE_FOLLOWS_ACTION,
  UNFOLLOW_PROFILE_ACTION,
  hashProfileFollowPayload,
  hashProfileFollowReadPayload,
  normalizeProfileFollowChallengeInput,
  normalizeProfileFollowReadInput,
} from "~~/lib/auth/profileFollowChallenge";
import { createSignedCollectionChallengeResponse } from "~~/lib/auth/signedCollectionRoute";
import { checkRateLimit } from "~~/utils/rateLimit";

const RATE_LIMIT = { limit: 20, windowMs: 60_000 };

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      address?: string;
      targetAddress?: string;
      action?: "follow" | "unfollow";
      intent?: "read";
    };
    const limited = await checkRateLimit(request, RATE_LIMIT, {
      extraKeyParts: [typeof body.address === "string" ? body.address : undefined, body.intent ?? body.action],
    });
    if (limited) return limited;

    return createSignedCollectionChallengeResponse(body, {
      title: PROFILE_FOLLOW_CHALLENGE_TITLE,
      readAction: READ_PROFILE_FOLLOWS_ACTION,
      getWriteAction: challengeBody =>
        challengeBody.action === "unfollow" ? UNFOLLOW_PROFILE_ACTION : FOLLOW_PROFILE_ACTION,
      isReadRequest: challengeBody => challengeBody.intent === "read",
      normalizeReadInput: normalizeProfileFollowReadInput,
      hashReadPayload: hashProfileFollowReadPayload,
      normalizeWriteInput: normalizeProfileFollowChallengeInput,
      hashWritePayload: hashProfileFollowPayload,
    });
  } catch (error) {
    console.error("Error creating profile follow challenge:", error);
    return NextResponse.json({ error: "Failed to create challenge" }, { status: 500 });
  }
}
