import { NextRequest, NextResponse } from "next/server";
import { issueSignedActionChallenge } from "~~/lib/auth/signedActions";
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

    if (body.intent === "read") {
      const normalizedRead = normalizeWatchlistReadInput(body);
      if (!normalizedRead.ok) {
        return NextResponse.json({ error: normalizedRead.error }, { status: 400 });
      }

      const challenge = await issueSignedActionChallenge({
        title: WATCHLIST_CHALLENGE_TITLE,
        action: READ_WATCHLIST_ACTION,
        walletAddress: normalizedRead.payload.normalizedAddress,
        payloadHash: hashWatchlistReadPayload(normalizedRead.payload),
      });

      return NextResponse.json(challenge);
    }

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
