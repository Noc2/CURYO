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
import { issueSignedActionChallenge } from "~~/lib/auth/signedActions";
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

    if (body.intent === "read") {
      const normalizedRead = normalizeProfileFollowReadInput(body);
      if (!normalizedRead.ok) {
        return NextResponse.json({ error: normalizedRead.error }, { status: 400 });
      }

      const challenge = await issueSignedActionChallenge({
        title: PROFILE_FOLLOW_CHALLENGE_TITLE,
        action: READ_PROFILE_FOLLOWS_ACTION,
        walletAddress: normalizedRead.payload.normalizedAddress,
        payloadHash: hashProfileFollowReadPayload(normalizedRead.payload),
      });

      return NextResponse.json(challenge);
    }

    const normalized = normalizeProfileFollowChallengeInput(body);
    if (!normalized.ok) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }

    const action = body.action === "unfollow" ? UNFOLLOW_PROFILE_ACTION : FOLLOW_PROFILE_ACTION;
    const challenge = await issueSignedActionChallenge({
      title: PROFILE_FOLLOW_CHALLENGE_TITLE,
      action,
      walletAddress: normalized.payload.normalizedAddress,
      payloadHash: hashProfileFollowPayload(normalized.payload),
    });

    return NextResponse.json(challenge);
  } catch (error) {
    console.error("Error creating profile follow challenge:", error);
    return NextResponse.json({ error: "Failed to create challenge" }, { status: 500 });
  }
}
