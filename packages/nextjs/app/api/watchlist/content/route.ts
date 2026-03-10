import { NextRequest, NextResponse } from "next/server";
import {
  ensureSignedActionChallengeTable,
  mapSignedActionError,
  verifyAndConsumeSignedActionChallenge,
} from "~~/lib/auth/signedActions";
import {
  SIGNED_READ_SESSION_COOKIE_NAME,
  getSignedReadSessionCookie,
  issueSignedReadSession,
  verifySignedReadSession,
} from "~~/lib/auth/signedReadSessions";
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
    const hasSession = await verifySignedReadSession(
      request.cookies.get(SIGNED_READ_SESSION_COOKIE_NAME)?.value,
      normalizedAddress,
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
    const payloadHash = hashWatchlistReadPayload(payload);
    await ensureSignedActionChallengeTable();

    try {
      await db.transaction(async tx => {
        await verifyAndConsumeSignedActionChallenge(tx, {
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
      });
    } catch (error: unknown) {
      const mapped = mapSignedActionError(error);
      if (mapped) {
        return NextResponse.json({ error: mapped.error }, { status: mapped.status });
      }
      throw error;
    }

    const session = await issueSignedReadSession(payload.normalizedAddress);
    const items = await listWatchedContent(payload.normalizedAddress);
    const response = NextResponse.json({ items, count: items.length });
    response.cookies.set(getSignedReadSessionCookie(session));
    return response;
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
    } catch (error: unknown) {
      const mapped = mapSignedActionError(error);
      if (mapped) {
        return NextResponse.json({ error: mapped.error }, { status: mapped.status });
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
    } catch (error: unknown) {
      const mapped = mapSignedActionError(error);
      if (mapped) {
        return NextResponse.json({ error: mapped.error }, { status: mapped.status });
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
