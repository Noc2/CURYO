import { NextRequest, NextResponse } from "next/server";
import {
  READ_NOTIFICATION_PREFERENCES_ACTION,
  UPDATE_NOTIFICATION_PREFERENCES_ACTION,
  buildNotificationPreferencesChallengeMessage,
  buildNotificationPreferencesReadChallengeMessage,
  hashNotificationPreferencesPayload,
  hashNotificationPreferencesReadPayload,
  normalizeNotificationPreferencesInput,
  normalizeNotificationPreferencesReadInput,
} from "~~/lib/auth/notificationPreferences";
import {
  NOTIFICATION_PREFERENCES_SIGNED_READ_SESSION_COOKIE_NAME,
  verifySignedReadSession,
} from "~~/lib/auth/signedReadSessions";
import { createSignedReadResponse, verifySignedActionChallenge } from "~~/lib/auth/signedRouteHelpers";
import { getNotificationPreferences, upsertNotificationPreferences } from "~~/lib/notifications/preferences";
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
    const normalized = normalizeNotificationPreferencesReadInput({
      address: typeof address === "string" ? address : undefined,
    });
    if (!normalized.ok) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }

    const hasSession = await verifySignedReadSession(
      request.cookies.get(NOTIFICATION_PREFERENCES_SIGNED_READ_SESSION_COOKIE_NAME)?.value,
      normalized.payload.normalizedAddress,
      "notification_preferences",
    );
    if (!hasSession) {
      return NextResponse.json({ error: "Signed read required" }, { status: 401 });
    }

    const preferences = await getNotificationPreferences(normalized.payload.normalizedAddress);
    return NextResponse.json(preferences);
  } catch (error) {
    console.error("Error fetching notification preferences:", error);
    return NextResponse.json({ error: "Failed to fetch notification preferences" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const limited = await checkRateLimit(request, READ_RATE_LIMIT);
  if (limited) return limited;

  try {
    const body = (await request.json()) as Record<string, unknown> & {
      signature?: `0x${string}`;
      challengeId?: string;
    };

    if (!body.signature || !body.challengeId) {
      return NextResponse.json({ error: "Missing or invalid fields" }, { status: 400 });
    }

    const normalized = normalizeNotificationPreferencesReadInput(body);
    if (!normalized.ok) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }

    const payload = normalized.payload;
    const payloadHash = hashNotificationPreferencesReadPayload(payload);
    const challengeFailure = await verifySignedActionChallenge({
      challengeId: String(body.challengeId),
      action: READ_NOTIFICATION_PREFERENCES_ACTION,
      walletAddress: payload.normalizedAddress,
      payloadHash,
      signature: body.signature as `0x${string}`,
      buildMessage: ({ nonce, expiresAt }) =>
        buildNotificationPreferencesReadChallengeMessage({
          address: payload.normalizedAddress,
          payloadHash,
          nonce,
          expiresAt,
        }),
    });
    if (challengeFailure) {
      return challengeFailure;
    }

    const preferences = await getNotificationPreferences(payload.normalizedAddress);
    return createSignedReadResponse(payload.normalizedAddress, "notification_preferences", preferences);
  } catch (error) {
    console.error("Error fetching notification preferences:", error);
    return NextResponse.json({ error: "Failed to fetch notification preferences" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const limited = await checkRateLimit(request, WRITE_RATE_LIMIT);
  if (limited) return limited;

  try {
    const body = (await request.json()) as Record<string, unknown> & {
      signature?: `0x${string}`;
      challengeId?: string;
    };

    if (!body.signature || !body.challengeId) {
      return NextResponse.json({ error: "Missing or invalid fields" }, { status: 400 });
    }

    const normalized = normalizeNotificationPreferencesInput(body);
    if (!normalized.ok) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }

    const payload = normalized.payload;
    const payloadHash = hashNotificationPreferencesPayload(payload);
    const challengeFailure = await verifySignedActionChallenge({
      challengeId: String(body.challengeId),
      action: UPDATE_NOTIFICATION_PREFERENCES_ACTION,
      walletAddress: payload.normalizedAddress,
      payloadHash,
      signature: body.signature as `0x${string}`,
      buildMessage: ({ nonce, expiresAt }) =>
        buildNotificationPreferencesChallengeMessage({
          address: payload.normalizedAddress,
          payloadHash,
          nonce,
          expiresAt,
        }),
    });
    if (challengeFailure) {
      return challengeFailure;
    }

    const preferences = await upsertNotificationPreferences(payload.normalizedAddress, payload);
    return NextResponse.json({ ok: true, preferences });
  } catch (error) {
    console.error("Error updating notification preferences:", error);
    return NextResponse.json({ error: "Failed to update notification preferences" }, { status: 500 });
  }
}
