import { NextRequest, NextResponse } from "next/server";
import {
  NOTIFICATION_EMAIL_CHALLENGE_TITLE,
  UPDATE_NOTIFICATION_EMAIL_ACTION,
  hashNotificationEmailPayload,
  normalizeNotificationEmailInput,
} from "~~/lib/auth/notificationEmails";
import { issueSignedActionChallenge } from "~~/lib/auth/signedActions";
import { checkRateLimit } from "~~/utils/rateLimit";

const RATE_LIMIT = { limit: 20, windowMs: 60_000 };

export async function POST(request: NextRequest) {
  const limited = await checkRateLimit(request, RATE_LIMIT);
  if (limited) return limited;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const normalized = normalizeNotificationEmailInput(body);
    if (!normalized.ok) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }

    const challenge = await issueSignedActionChallenge({
      title: NOTIFICATION_EMAIL_CHALLENGE_TITLE,
      action: UPDATE_NOTIFICATION_EMAIL_ACTION,
      walletAddress: normalized.payload.normalizedAddress,
      payloadHash: hashNotificationEmailPayload(normalized.payload),
    });

    return NextResponse.json(challenge);
  } catch (error) {
    console.error("Error creating notification email challenge:", error);
    return NextResponse.json({ error: "Failed to create challenge" }, { status: 500 });
  }
}
