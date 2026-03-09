import { NextRequest, NextResponse } from "next/server";
import { issueSignedActionChallenge } from "~~/lib/auth/signedActions";
import {
  UNWATCH_CONTENT_ACTION,
  WATCHLIST_CHALLENGE_TITLE,
  WATCH_CONTENT_ACTION,
  hashWatchlistChallengePayload,
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
    const challenge = await issueSignedActionChallenge({
      title: WATCHLIST_CHALLENGE_TITLE,
      action,
      walletAddress: normalized.payload.normalizedAddress,
      payloadHash: hashWatchlistChallengePayload(normalized.payload),
    });

    return NextResponse.json(challenge);
  } catch (error) {
    console.error("Error creating watchlist challenge:", error);
    return NextResponse.json({ error: "Failed to create challenge" }, { status: 500 });
  }
}
