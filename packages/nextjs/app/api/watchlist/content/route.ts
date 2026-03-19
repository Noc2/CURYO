import { NextRequest, NextResponse } from "next/server";
import {
  createSignedCollectionReadResponse,
  hasSignedCollectionReadSession,
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
import type { NormalizedWatchlistChallengePayload } from "~~/lib/auth/watchlistChallenge";
import { addWatchedContent, listWatchedContent, removeWatchedContent } from "~~/lib/watchlist/contentWatch";
import { checkRateLimit } from "~~/utils/rateLimit";

const READ_RATE_LIMIT = { limit: 60, windowMs: 60_000 };
const WRITE_RATE_LIMIT = { limit: 20, windowMs: 60_000 };

type WatchlistWriteBody = {
  address?: string;
  contentId?: string | number | bigint;
  signature?: `0x${string}`;
  challengeId?: string;
};

async function handleWatchlistWrite(
  request: NextRequest,
  params: {
    action: typeof WATCH_CONTENT_ACTION | typeof UNWATCH_CONTENT_ACTION;
    watched: boolean;
    logMessage: string;
    responseError: string;
    mutate: (payload: NormalizedWatchlistChallengePayload) => Promise<void>;
  },
) {
  try {
    const body = (await request.json()) as WatchlistWriteBody;
    const limited = await checkRateLimit(request, WRITE_RATE_LIMIT, {
      extraKeyParts: [typeof body.address === "string" ? body.address : undefined],
    });
    if (limited) return limited;

    const normalized = normalizeWatchlistChallengeInput(body);
    if (!normalized.ok) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }

    const payload = normalized.payload;
    const payloadHash = hashWatchlistChallengePayload(payload);
    const writeAccess = await verifySignedCollectionWriteAccess(request, {
      cookieName: WATCHLIST_SIGNED_WRITE_SESSION_COOKIE_NAME,
      walletAddress: payload.normalizedAddress,
      scope: "watchlist",
      signature: body.signature,
      challengeId: body.challengeId,
      action: params.action,
      payloadHash,
      buildMessage: ({ nonce, expiresAt }) =>
        buildWatchlistChallengeMessage({
          action: params.action,
          address: payload.normalizedAddress,
          payloadHash,
          nonce,
          expiresAt,
        }),
    });
    if (!writeAccess.ok) {
      return writeAccess.response;
    }

    await params.mutate(payload);
    return maybeIssueSignedCollectionWriteSession(
      NextResponse.json({ ok: true, watched: params.watched, contentId: payload.contentId }),
      {
        hasWriteSession: writeAccess.hasWriteSession,
        walletAddress: payload.normalizedAddress,
        scope: "watchlist",
      },
    );
  } catch (error) {
    console.error(params.logMessage, error);
    return NextResponse.json({ error: params.responseError }, { status: 500 });
  }
}

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

    const hasSession = await hasSignedCollectionReadSession(
      request,
      WATCHLIST_SIGNED_READ_SESSION_COOKIE_NAME,
      normalized.payload.normalizedAddress,
      "watchlist",
    );
    if (!hasSession) {
      return NextResponse.json({ error: "Signed read required" }, { status: 401 });
    }

    const items = await listWatchedContent(normalized.payload.normalizedAddress);
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
    return createSignedCollectionReadResponse(payload.normalizedAddress, "watchlist", { items, count: items.length });
  } catch (error) {
    console.error("Error fetching watched content:", error);
    return NextResponse.json({ error: "Failed to fetch watched content" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  return handleWatchlistWrite(request, {
    action: WATCH_CONTENT_ACTION,
    watched: true,
    logMessage: "Error watching content:",
    responseError: "Failed to watch content",
    mutate: payload => addWatchedContent(payload.normalizedAddress, payload.contentId),
  });
}

export async function DELETE(request: NextRequest) {
  return handleWatchlistWrite(request, {
    action: UNWATCH_CONTENT_ACTION,
    watched: false,
    logMessage: "Error unwatching content:",
    responseError: "Failed to unwatch content",
    mutate: payload => removeWatchedContent(payload.normalizedAddress, payload.contentId),
  });
}
