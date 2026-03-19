import { NextRequest, NextResponse } from "next/server";
import {
  createSignedCollectionReadItemsResponse,
  createSignedCollectionResponse,
  ensureSignedCollectionReadSession,
  maybeIssueSignedCollectionWriteSession,
  verifySignedCollectionChallenge,
  verifySignedCollectionWriteAccess,
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
import { addWatchedContent, listWatchedContent, removeWatchedContent } from "~~/lib/watchlist/contentWatch";
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
    const normalized = normalizeWatchlistReadInput({ address: typeof address === "string" ? address : undefined });
    if (!normalized.ok) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }

    const readFailure = await ensureSignedCollectionReadSession(request, {
      cookieName: WATCHLIST_SIGNED_READ_SESSION_COOKIE_NAME,
      walletAddress: normalized.payload.normalizedAddress,
      scope: "watchlist",
    });
    if (readFailure) {
      return readFailure;
    }

    const items = await listWatchedContent(normalized.payload.normalizedAddress);
    return createSignedCollectionResponse(items);
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
    const payloadHash = hashWatchlistReadPayload(payload);
    const challengeFailure = await verifySignedCollectionChallenge({
      challengeId: String(challengeId),
      action: READ_WATCHLIST_ACTION,
      walletAddress: payload.normalizedAddress,
      payloadHash,
      signature: signature as `0x${string}`,
      buildMessage: ({ nonce, expiresAt }) =>
        buildWatchlistReadChallengeMessage({
          address: payload.normalizedAddress,
          payloadHash,
          nonce,
          expiresAt,
        }),
    });
    if (challengeFailure) {
      return challengeFailure;
    }

    const items = await listWatchedContent(payload.normalizedAddress);
    return createSignedCollectionReadItemsResponse(payload.normalizedAddress, "watchlist", items);
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
    const payloadHash = hashWatchlistChallengePayload(payload);
    const writeAccess = await verifySignedCollectionWriteAccess(request, {
      cookieName: WATCHLIST_SIGNED_WRITE_SESSION_COOKIE_NAME,
      walletAddress: payload.normalizedAddress,
      scope: "watchlist",
      signature,
      challengeId: typeof challengeId === "string" ? challengeId : undefined,
      action: WATCH_CONTENT_ACTION,
      payloadHash,
      buildMessage: ({ nonce, expiresAt }) =>
        buildWatchlistChallengeMessage({
          action: WATCH_CONTENT_ACTION,
          address: payload.normalizedAddress,
          payloadHash,
          nonce,
          expiresAt,
        }),
    });
    if (!writeAccess.ok) {
      return writeAccess.response;
    }

    await addWatchedContent(payload.normalizedAddress, payload.contentId);
    return maybeIssueSignedCollectionWriteSession(
      NextResponse.json({ ok: true, watched: true, contentId: payload.contentId }),
      {
        hasWriteSession: writeAccess.hasWriteSession,
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
    const payloadHash = hashWatchlistChallengePayload(payload);
    const writeAccess = await verifySignedCollectionWriteAccess(request, {
      cookieName: WATCHLIST_SIGNED_WRITE_SESSION_COOKIE_NAME,
      walletAddress: payload.normalizedAddress,
      scope: "watchlist",
      signature,
      challengeId: typeof challengeId === "string" ? challengeId : undefined,
      action: UNWATCH_CONTENT_ACTION,
      payloadHash,
      buildMessage: ({ nonce, expiresAt }) =>
        buildWatchlistChallengeMessage({
          action: UNWATCH_CONTENT_ACTION,
          address: payload.normalizedAddress,
          payloadHash,
          nonce,
          expiresAt,
        }),
    });
    if (!writeAccess.ok) {
      return writeAccess.response;
    }

    await removeWatchedContent(payload.normalizedAddress, payload.contentId);
    return maybeIssueSignedCollectionWriteSession(
      NextResponse.json({ ok: true, watched: false, contentId: payload.contentId }),
      {
        hasWriteSession: writeAccess.hasWriteSession,
        walletAddress: payload.normalizedAddress,
        scope: "watchlist",
      },
    );
  } catch (error) {
    console.error("Error unwatching content:", error);
    return NextResponse.json({ error: "Failed to unwatch content" }, { status: 500 });
  }
}
