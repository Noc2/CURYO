import { NextRequest, NextResponse } from "next/server";
import {
  NOTIFICATION_EMAIL_CHALLENGE_TITLE,
  READ_NOTIFICATION_EMAIL_ACTION,
  UPDATE_NOTIFICATION_EMAIL_ACTION,
  hashNotificationEmailPayload,
  hashNotificationEmailReadPayload,
  normalizeNotificationEmailInput,
  normalizeNotificationEmailReadInput,
} from "~~/lib/auth/notificationEmails";
import { issueSignedActionChallenge } from "~~/lib/auth/signedActions";
import { checkRateLimit } from "~~/utils/rateLimit";

const RATE_LIMIT = { limit: 20, windowMs: 60_000 };

export async function POST(request: NextRequest) {
  const limited = await checkRateLimit(request, RATE_LIMIT);
  if (limited) return limited;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const intent = body.intent === "read" ? "read" : "update";
    const normalized =
      intent === "read" ? normalizeNotificationEmailReadInput(body) : normalizeNotificationEmailInput(body);
    if (!normalized.ok) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }

    const payloadHash =
      intent === "read"
        ? hashNotificationEmailReadPayload(normalized.payload as Parameters<typeof hashNotificationEmailReadPayload>[0])
        : hashNotificationEmailPayload(normalized.payload as Parameters<typeof hashNotificationEmailPayload>[0]);

    const challenge = await issueSignedActionChallenge({
      title: NOTIFICATION_EMAIL_CHALLENGE_TITLE,
      action: intent === "read" ? READ_NOTIFICATION_EMAIL_ACTION : UPDATE_NOTIFICATION_EMAIL_ACTION,
      walletAddress: normalized.payload.normalizedAddress,
      payloadHash,
    });

    return NextResponse.json(challenge);
  } catch (error) {
    console.error("Error creating notification email challenge:", error);
    return NextResponse.json({ error: "Failed to create challenge" }, { status: 500 });
  }
}
