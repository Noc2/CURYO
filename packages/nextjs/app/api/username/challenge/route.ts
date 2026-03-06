import { NextRequest, NextResponse } from "next/server";
import { and, isNotNull, lt, or } from "drizzle-orm";
import {
  PROFILE_UPDATE_CHALLENGE_ACTION,
  createProfileUpdateChallenge,
  ensureProfileUpdateChallengeTable,
  normalizeProfileUpdateInput,
  signedActionChallenges,
} from "~~/lib/auth/profileUpdateChallenge";
import { db } from "~~/lib/db";
import { checkRateLimit } from "~~/utils/rateLimit";

const RATE_LIMIT = { limit: 10, windowMs: 60_000 };
const STALE_USED_CHALLENGE_MS = 24 * 60 * 60 * 1000;

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

    await ensureProfileUpdateChallengeTable();

    const challenge = createProfileUpdateChallenge(normalized.payload);
    const staleUsedBefore = new Date(Date.now() - STALE_USED_CHALLENGE_MS);
    const now = new Date();

    await db
      .delete(signedActionChallenges)
      .where(
        or(
          lt(signedActionChallenges.expiresAt, now),
          and(isNotNull(signedActionChallenges.usedAt), lt(signedActionChallenges.usedAt, staleUsedBefore)),
        ),
      );

    await db.insert(signedActionChallenges).values({
      id: challenge.challengeId,
      walletAddress: normalized.payload.normalizedAddress,
      action: PROFILE_UPDATE_CHALLENGE_ACTION,
      payloadHash: challenge.payloadHash,
      nonce: challenge.nonce,
      expiresAt: challenge.expiresAt,
      createdAt: challenge.createdAt,
      usedAt: null,
    });

    return NextResponse.json({
      challengeId: challenge.challengeId,
      message: challenge.message,
      expiresAt: challenge.expiresAt.toISOString(),
    });
  } catch (error) {
    console.error("Error creating profile update challenge:", error);
    return NextResponse.json({ error: "Failed to create challenge" }, { status: 500 });
  }
}
