import { NextRequest, NextResponse } from "next/server";
import {
  cleanupSignedActionChallenges,
  ensureSignedActionChallengeTable,
  persistSignedActionChallenge,
} from "~~/lib/auth/signedActions";
import {
  UNWATCH_CONTENT_ACTION,
  WATCH_CONTENT_ACTION,
  createWatchlistChallenge,
  normalizeWatchlistChallengeInput,
} from "~~/lib/auth/watchlistChallenge";
import { checkRateLimit } from "~~/utils/rateLimit";

const RATE_LIMIT = { limit: 20, windowMs: 60_000 };

export async function POST(request: NextRequest) {
  const limited = await checkRateLimit(request, RATE_LIMIT);
  if (limited) return limited;

  try {
    const body = (await request.json()) as {
      address?: string;
      contentId?: string | number | bigint;
      action?: "watch" | "unwatch";
    };

    const normalized = normalizeWatchlistChallengeInput(body);
    if (!normalized.ok) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }

    const action = body.action === "unwatch" ? UNWATCH_CONTENT_ACTION : WATCH_CONTENT_ACTION;
    await ensureSignedActionChallengeTable();

    const challenge = createWatchlistChallenge(normalized.payload, action);
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
    console.error("Error creating watchlist challenge:", error);
    return NextResponse.json({ error: "Failed to create challenge" }, { status: 500 });
  }
}
