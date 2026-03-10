import { NextRequest, NextResponse } from "next/server";
import { ensureSignedActionChallengeTable, verifyAndConsumeSignedActionChallenge } from "~~/lib/auth/signedActions";
import {
  UNWATCH_CONTENT_ACTION,
  WATCH_CONTENT_ACTION,
  buildWatchlistChallengeMessage,
  hashWatchlistChallengePayload,
  normalizeWatchlistChallengeInput,
} from "~~/lib/auth/watchlistChallenge";
import { db } from "~~/lib/db";
import {
  addWatchedContent,
  isValidWalletAddress,
  listWatchedContent,
  normalizeWalletAddress,
  removeWatchedContent,
} from "~~/lib/watchlist/contentWatch";
import { checkRateLimit } from "~~/utils/rateLimit";

const READ_RATE_LIMIT = { limit: 60, windowMs: 60_000 };
const WRITE_RATE_LIMIT = { limit: 20, windowMs: 60_000 };

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address");
  const limited = await checkRateLimit(request, READ_RATE_LIMIT, {
    extraKeyParts: [typeof address === "string" ? address : undefined],
  });
  if (limited) return limited;

  try {
    if (!address || !isValidWalletAddress(address)) {
      return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
    }

    const normalizedAddress = normalizeWalletAddress(address);
    const items = await listWatchedContent(normalizedAddress);
    return NextResponse.json({ items, count: items.length });
  } catch (error) {
    console.error("Error fetching watched content:", error);
    return NextResponse.json({ error: "Failed to fetch watched content" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { address, contentId, signature, challengeId } = await request.json();
    const limited = await checkRateLimit(request, WRITE_RATE_LIMIT, {
      extraKeyParts: [typeof address === "string" ? address : undefined],
    });
    if (limited) return limited;
    if (!signature || !challengeId) {
      return NextResponse.json({ error: "Missing or invalid fields" }, { status: 400 });
    }

    const normalized = normalizeWatchlistChallengeInput({ address, contentId });
    if (!normalized.ok) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }

    const payload = normalized.payload;
    const payloadHash = hashWatchlistChallengePayload(payload);
    await ensureSignedActionChallengeTable();

    try {
      await db.transaction(async tx => {
        await verifyAndConsumeSignedActionChallenge(tx, {
          challengeId: String(challengeId),
          action: WATCH_CONTENT_ACTION,
          walletAddress: payload.normalizedAddress,
          payloadHash,
          signature: signature as `0x${string}`,
          buildMessage: ({ nonce, expiresAt }) =>
            buildWatchlistChallengeMessage({
              action: WATCH_CONTENT_ACTION,
              address: payload.normalizedAddress,
              payloadHash,
              nonce,
              expiresAt,
            }),
        });
      });
    } catch (error: any) {
      if (error.message === "CHALLENGE_USED") {
        return NextResponse.json({ error: "Challenge already used" }, { status: 409 });
      }
      if (error.message === "CHALLENGE_EXPIRED") {
        return NextResponse.json({ error: "Challenge expired" }, { status: 401 });
      }
      if (error.message === "INVALID_CHALLENGE" || error.message === "INVALID_SIGNATURE") {
        return NextResponse.json({ error: "Invalid signature challenge" }, { status: 401 });
      }
      throw error;
    }

    await addWatchedContent(payload.normalizedAddress, payload.contentId);
    return NextResponse.json({ ok: true, watched: true, contentId: payload.contentId });
  } catch (error) {
    console.error("Error watching content:", error);
    return NextResponse.json({ error: "Failed to watch content" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { address, contentId, signature, challengeId } = await request.json();
    const limited = await checkRateLimit(request, WRITE_RATE_LIMIT, {
      extraKeyParts: [typeof address === "string" ? address : undefined],
    });
    if (limited) return limited;
    if (!signature || !challengeId) {
      return NextResponse.json({ error: "Missing or invalid fields" }, { status: 400 });
    }

    const normalized = normalizeWatchlistChallengeInput({ address, contentId });
    if (!normalized.ok) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }

    const payload = normalized.payload;
    const payloadHash = hashWatchlistChallengePayload(payload);
    await ensureSignedActionChallengeTable();

    try {
      await db.transaction(async tx => {
        await verifyAndConsumeSignedActionChallenge(tx, {
          challengeId: String(challengeId),
          action: UNWATCH_CONTENT_ACTION,
          walletAddress: payload.normalizedAddress,
          payloadHash,
          signature: signature as `0x${string}`,
          buildMessage: ({ nonce, expiresAt }) =>
            buildWatchlistChallengeMessage({
              action: UNWATCH_CONTENT_ACTION,
              address: payload.normalizedAddress,
              payloadHash,
              nonce,
              expiresAt,
            }),
        });
      });
    } catch (error: any) {
      if (error.message === "CHALLENGE_USED") {
        return NextResponse.json({ error: "Challenge already used" }, { status: 409 });
      }
      if (error.message === "CHALLENGE_EXPIRED") {
        return NextResponse.json({ error: "Challenge expired" }, { status: 401 });
      }
      if (error.message === "INVALID_CHALLENGE" || error.message === "INVALID_SIGNATURE") {
        return NextResponse.json({ error: "Invalid signature challenge" }, { status: 401 });
      }
      throw error;
    }

    await removeWatchedContent(payload.normalizedAddress, payload.contentId);
    return NextResponse.json({ ok: true, watched: false, contentId: payload.contentId });
  } catch (error) {
    console.error("Error unwatching content:", error);
    return NextResponse.json({ error: "Failed to unwatch content" }, { status: 500 });
  }
}
