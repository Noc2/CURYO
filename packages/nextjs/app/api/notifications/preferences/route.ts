import { NextRequest, NextResponse } from "next/server";
import {
  UPDATE_NOTIFICATION_PREFERENCES_ACTION,
  buildNotificationPreferencesChallengeMessage,
  hashNotificationPreferencesPayload,
  normalizeNotificationPreferencesInput,
} from "~~/lib/auth/notificationPreferences";
import { ensureSignedActionChallengeTable, verifyAndConsumeSignedActionChallenge } from "~~/lib/auth/signedActions";
import { db } from "~~/lib/db";
import { getNotificationPreferences, upsertNotificationPreferences } from "~~/lib/notifications/preferences";
import { isValidWalletAddress, normalizeWalletAddress } from "~~/lib/watchlist/contentWatch";
import { checkRateLimit } from "~~/utils/rateLimit";

const READ_RATE_LIMIT = { limit: 60, windowMs: 60_000 };
const WRITE_RATE_LIMIT = { limit: 20, windowMs: 60_000 };

export async function GET(request: NextRequest) {
  const limited = await checkRateLimit(request, READ_RATE_LIMIT);
  if (limited) return limited;

  try {
    const address = request.nextUrl.searchParams.get("address");
    if (!address || !isValidWalletAddress(address)) {
      return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
    }

    const preferences = await getNotificationPreferences(normalizeWalletAddress(address));
    return NextResponse.json(preferences);
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
    await ensureSignedActionChallengeTable();

    try {
      await db.transaction(async tx => {
        await verifyAndConsumeSignedActionChallenge(tx, {
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

    const preferences = await upsertNotificationPreferences(payload.normalizedAddress, payload);
    return NextResponse.json({ ok: true, preferences });
  } catch (error) {
    console.error("Error updating notification preferences:", error);
    return NextResponse.json({ error: "Failed to update notification preferences" }, { status: 500 });
  }
}
