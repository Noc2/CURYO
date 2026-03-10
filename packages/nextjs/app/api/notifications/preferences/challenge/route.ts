import { NextRequest, NextResponse } from "next/server";
import {
  NOTIFICATION_PREFERENCES_CHALLENGE_TITLE,
  READ_NOTIFICATION_PREFERENCES_ACTION,
  UPDATE_NOTIFICATION_PREFERENCES_ACTION,
  hashNotificationPreferencesPayload,
  hashNotificationPreferencesReadPayload,
  normalizeNotificationPreferencesInput,
  normalizeNotificationPreferencesReadInput,
} from "~~/lib/auth/notificationPreferences";
import { issueSignedActionChallenge } from "~~/lib/auth/signedActions";
import { checkRateLimit } from "~~/utils/rateLimit";

const RATE_LIMIT = { limit: 20, windowMs: 60_000 };

export async function POST(request: NextRequest) {
  const limited = await checkRateLimit(request, RATE_LIMIT);
  if (limited) return limited;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (body.intent === "read") {
      const normalizedRead = normalizeNotificationPreferencesReadInput(body);
      if (!normalizedRead.ok) {
        return NextResponse.json({ error: normalizedRead.error }, { status: 400 });
      }

      const challenge = await issueSignedActionChallenge({
        title: NOTIFICATION_PREFERENCES_CHALLENGE_TITLE,
        action: READ_NOTIFICATION_PREFERENCES_ACTION,
        walletAddress: normalizedRead.payload.normalizedAddress,
        payloadHash: hashNotificationPreferencesReadPayload(normalizedRead.payload),
      });

      return NextResponse.json(challenge);
    }

    const normalized = normalizeNotificationPreferencesInput(body);
    if (!normalized.ok) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }

    const challenge = await issueSignedActionChallenge({
      title: NOTIFICATION_PREFERENCES_CHALLENGE_TITLE,
      action: UPDATE_NOTIFICATION_PREFERENCES_ACTION,
      walletAddress: normalized.payload.normalizedAddress,
      payloadHash: hashNotificationPreferencesPayload(normalized.payload),
    });

    return NextResponse.json(challenge);
  } catch (error) {
    console.error("Error creating notification preferences challenge:", error);
    return NextResponse.json({ error: "Failed to create challenge" }, { status: 500 });
  }
}
