import { NextRequest, NextResponse } from "next/server";
import { createSignedCollectionChallengeResponse } from "~~/lib/auth/signedCollectionRoute";
import {
  READ_WATCHLIST_ACTION,
  UNWATCH_CONTENT_ACTION,
  WATCHLIST_CHALLENGE_TITLE,
  WATCH_CONTENT_ACTION,
  hashWatchlistChallengePayload,
  hashWatchlistReadPayload,
  normalizeWatchlistChallengeInput,
  normalizeWatchlistReadInput,
} from "~~/lib/auth/watchlistChallenge";
import { checkRateLimit } from "~~/utils/rateLimit";

const RATE_LIMIT = { limit: 20, windowMs: 60_000 };

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      address?: string;
      contentId?: string | number | bigint;
      action?: "watch" | "unwatch";
      intent?: "read";
    };
    const limited = await checkRateLimit(request, RATE_LIMIT, {
      extraKeyParts: [typeof body.address === "string" ? body.address : undefined, body.intent ?? body.action],
    });
    if (limited) return limited;

    return createSignedCollectionChallengeResponse(body, {
      title: WATCHLIST_CHALLENGE_TITLE,
      readAction: READ_WATCHLIST_ACTION,
      getWriteAction: challengeBody =>
        challengeBody.action === "unwatch" ? UNWATCH_CONTENT_ACTION : WATCH_CONTENT_ACTION,
      isReadRequest: challengeBody => challengeBody.intent === "read",
      normalizeReadInput: normalizeWatchlistReadInput,
      hashReadPayload: hashWatchlistReadPayload,
      normalizeWriteInput: normalizeWatchlistChallengeInput,
      hashWritePayload: hashWatchlistChallengePayload,
    });
  } catch (error) {
    console.error("Error creating watchlist challenge:", error);
    return NextResponse.json({ error: "Failed to create challenge" }, { status: 500 });
  }
}
