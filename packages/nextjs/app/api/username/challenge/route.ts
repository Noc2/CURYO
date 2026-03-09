import { NextRequest, NextResponse } from "next/server";
import {
  PROFILE_UPDATE_CHALLENGE_ACTION,
  PROFILE_UPDATE_CHALLENGE_TITLE,
  hashProfileUpdatePayload,
  normalizeProfileUpdateInput,
} from "~~/lib/auth/profileUpdateChallenge";
import { issueSignedActionChallenge } from "~~/lib/auth/signedActions";
import { checkRateLimit } from "~~/utils/rateLimit";

const RATE_LIMIT = { limit: 10, windowMs: 60_000 };

export async function POST(request: NextRequest) {
  const limited = await checkRateLimit(request, RATE_LIMIT);
  if (limited) return limited;

  try {
    const body = (await request.json()) as {
      address?: string;
      username?: string | null;
      profileImageUrl?: string | null;
    };

    const normalized = normalizeProfileUpdateInput(body);
    if (!normalized.ok) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }

    const challenge = await issueSignedActionChallenge({
      title: PROFILE_UPDATE_CHALLENGE_TITLE,
      action: PROFILE_UPDATE_CHALLENGE_ACTION,
      walletAddress: normalized.payload.normalizedAddress,
      payloadHash: hashProfileUpdatePayload(normalized.payload),
    });

    return NextResponse.json(challenge);
  } catch (error) {
    console.error("Error creating profile update challenge:", error);
    return NextResponse.json({ error: "Failed to create challenge" }, { status: 500 });
  }
}
