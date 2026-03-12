import { NextRequest, NextResponse } from "next/server";
import {
  createSignedCollectionReadResponse,
  hasSignedCollectionReadSession,
  hasSignedCollectionWriteSession,
  maybeIssueSignedCollectionWriteSession,
  verifySignedCollectionChallenge,
} from "~~/lib/auth/signedCollectionRoute";
import { WATCHLIST_SIGNED_READ_SESSION_COOKIE_NAME } from "~~/lib/auth/signedReadSessions";
import { WATCHLIST_SIGNED_WRITE_SESSION_COOKIE_NAME } from "~~/lib/auth/signedWriteSessions";
import {
  READ_WATCHLIST_ACTION,
  UNWATCH_CONTENT_ACTION,
  WATCH_CONTENT_ACTION,
  buildWatchlistChallengeMessage,
  buildWatchlistReadChallengeMessage,
  hashWatchlistChallengePayload,
  hashWatchlistReadPayload,
  normalizeWatchlistChallengeInput,
  normalizeWatchlistReadInput,
} from "~~/lib/auth/watchlistChallenge";
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
    const hasSession = await hasSignedCollectionReadSession(
      request,
      WATCHLIST_SIGNED_READ_SESSION_COOKIE_NAME,
      normalizedAddress,
      "watchlist",
    );

    if (!hasSession) {
      return NextResponse.json({ error: "Signed read required" }, { status: 401 });
    }

    const items = await listWatchedContent(normalizedAddress);
    return NextResponse.json({ items, count: items.length });
  } catch (error) {
    console.error("Error fetching watched content:", error);
    return NextResponse.json({ error: "Failed to fetch watched content" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const limited = await checkRateLimit(request, READ_RATE_LIMIT);
  if (limited) return limited;

  try {
    const { address, signature, challengeId } = (await request.json()) as Record<string, unknown> & {
      signature?: `0x${string}`;
      challengeId?: string;
    };
    if (!signature || !challengeId) {
      return NextResponse.json({ error: "Missing or invalid fields" }, { status: 400 });
    }

    const normalized = normalizeWatchlistReadInput({ address: typeof address === "string" ? address : undefined });
    if (!normalized.ok) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }

    const payload = normalized.payload;
    const challengeFailure = await verifySignedCollectionChallenge({
      challengeId: String(challengeId),
      action: READ_WATCHLIST_ACTION,
      walletAddress: payload.normalizedAddress,
      payloadHash: hashWatchlistReadPayload(payload),
      signature: signature as `0x${string}`,
      buildMessage: ({ nonce, expiresAt }) =>
        buildWatchlistReadChallengeMessage({
          address: payload.normalizedAddress,
          payloadHash: hashWatchlistReadPayload(payload),
          nonce,
          expiresAt,
        }),
    });
    if (challengeFailure) {
      return challengeFailure;
    }

    const items = await listWatchedContent(payload.normalizedAddress);
    return createSignedCollectionReadResponse(payload.normalizedAddress, "watchlist", {
      items,
      count: items.length,
    });
  } catch (error) {
    console.error("Error fetching watched content:", error);
    return NextResponse.json({ error: "Failed to fetch watched content" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { address, contentId, signature, challengeId } = await request.json();
    const limited = await checkRateLimit(request, WRITE_RATE_LIMIT, {
      extraKeyParts: [typeof address === "string" ? address : undefined],
    });
    if (limited) return limited;

    const normalized = normalizeWatchlistChallengeInput({ address, contentId });
    if (!normalized.ok) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }

    const payload = normalized.payload;
    const hasWriteSession = await hasSignedCollectionWriteSession(
      request,
      WATCHLIST_SIGNED_WRITE_SESSION_COOKIE_NAME,
      payload.normalizedAddress,
      "watchlist",
    );

    if (!hasWriteSession) {
      if (!signature || !challengeId) {
        return NextResponse.json({ error: "Signed write required" }, { status: 401 });
      }

      const challengeFailure = await verifySignedCollectionChallenge({
        challengeId: String(challengeId),
        action: WATCH_CONTENT_ACTION,
        walletAddress: payload.normalizedAddress,
        payloadHash: hashWatchlistChallengePayload(payload),
        signature: signature as `0x${string}`,
        buildMessage: ({ nonce, expiresAt }) =>
          buildWatchlistChallengeMessage({
            action: WATCH_CONTENT_ACTION,
            address: payload.normalizedAddress,
            payloadHash: hashWatchlistChallengePayload(payload),
            nonce,
            expiresAt,
          }),
      });
      if (challengeFailure) {
        return challengeFailure;
      }
    }

    await addWatchedContent(payload.normalizedAddress, payload.contentId);
    return maybeIssueSignedCollectionWriteSession(
      NextResponse.json({ ok: true, watched: true, contentId: payload.contentId }),
      {
        hasWriteSession,
        walletAddress: payload.normalizedAddress,
        scope: "watchlist",
      },
    );
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

    const normalized = normalizeWatchlistChallengeInput({ address, contentId });
    if (!normalized.ok) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }

    const payload = normalized.payload;
    const hasWriteSession = await hasSignedCollectionWriteSession(
      request,
      WATCHLIST_SIGNED_WRITE_SESSION_COOKIE_NAME,
      payload.normalizedAddress,
      "watchlist",
    );

    if (!hasWriteSession) {
      if (!signature || !challengeId) {
        return NextResponse.json({ error: "Signed write required" }, { status: 401 });
      }

      const challengeFailure = await verifySignedCollectionChallenge({
        challengeId: String(challengeId),
        action: UNWATCH_CONTENT_ACTION,
        walletAddress: payload.normalizedAddress,
        payloadHash: hashWatchlistChallengePayload(payload),
        signature: signature as `0x${string}`,
        buildMessage: ({ nonce, expiresAt }) =>
          buildWatchlistChallengeMessage({
            action: UNWATCH_CONTENT_ACTION,
            address: payload.normalizedAddress,
            payloadHash: hashWatchlistChallengePayload(payload),
            nonce,
            expiresAt,
          }),
      });
      if (challengeFailure) {
        return challengeFailure;
      }
    }

    await removeWatchedContent(payload.normalizedAddress, payload.contentId);
    return maybeIssueSignedCollectionWriteSession(
      NextResponse.json({ ok: true, watched: false, contentId: payload.contentId }),
      {
        hasWriteSession,
        walletAddress: payload.normalizedAddress,
        scope: "watchlist",
      },
    );
  } catch (error) {
    console.error("Error unwatching content:", error);
    return NextResponse.json({ error: "Failed to unwatch content" }, { status: 500 });
  }
}
