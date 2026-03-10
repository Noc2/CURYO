import { NextRequest, NextResponse } from "next/server";
import {
  FOLLOW_CATEGORY_ACTION,
  FOLLOW_CATEGORY_CHALLENGE_TITLE,
  UNFOLLOW_CATEGORY_ACTION,
  hashCategoryFollowPayload,
  normalizeCategoryFollowInput,
} from "~~/lib/auth/categoryFollow";
import { issueSignedActionChallenge } from "~~/lib/auth/signedActions";
import { checkRateLimit } from "~~/utils/rateLimit";

const RATE_LIMIT = { limit: 20, windowMs: 60_000 };

export async function POST(request: NextRequest) {
  const limited = await checkRateLimit(request, RATE_LIMIT);
  if (limited) return limited;

  try {
    const body = (await request.json()) as Record<string, unknown> & { action?: "follow" | "unfollow" };
    const normalized = normalizeCategoryFollowInput(body);
    if (!normalized.ok) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }

    const action = body.action === "unfollow" ? UNFOLLOW_CATEGORY_ACTION : FOLLOW_CATEGORY_ACTION;
    const challenge = await issueSignedActionChallenge({
      title: FOLLOW_CATEGORY_CHALLENGE_TITLE,
      action,
      walletAddress: normalized.payload.normalizedAddress,
      payloadHash: hashCategoryFollowPayload(normalized.payload),
    });

    return NextResponse.json(challenge);
  } catch (error) {
    console.error("Error creating category follow challenge:", error);
    return NextResponse.json({ error: "Failed to create challenge" }, { status: 500 });
  }
}
