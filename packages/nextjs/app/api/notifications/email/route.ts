import { NextRequest, NextResponse } from "next/server";
import {
  UPDATE_NOTIFICATION_EMAIL_ACTION,
  buildNotificationEmailChallengeMessage,
  hashNotificationEmailPayload,
  normalizeNotificationEmailInput,
} from "~~/lib/auth/notificationEmails";
import { ensureSignedActionChallengeTable, verifyAndConsumeSignedActionChallenge } from "~~/lib/auth/signedActions";
import { db } from "~~/lib/db";
import { getOptionalAppUrl } from "~~/lib/env/server";
import { getEmailNotificationSettings, upsertEmailNotificationSettings } from "~~/lib/notifications/emailSettings";
import { sendNotificationVerificationEmail } from "~~/lib/notifications/resend";
import { isValidWalletAddress, normalizeWalletAddress } from "~~/lib/watchlist/contentWatch";
import { checkRateLimit } from "~~/utils/rateLimit";

const READ_RATE_LIMIT = { limit: 30, windowMs: 60_000 };
const WRITE_RATE_LIMIT = { limit: 10, windowMs: 60_000 };

export async function GET(request: NextRequest) {
  const limited = await checkRateLimit(request, READ_RATE_LIMIT);
  if (limited) return limited;

  try {
    const address = request.nextUrl.searchParams.get("address");
    if (!address || !isValidWalletAddress(address)) {
      return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
    }

    const settings = await getEmailNotificationSettings(normalizeWalletAddress(address));
    return NextResponse.json(settings);
  } catch (error) {
    console.error("Error fetching email notification settings:", error);
    return NextResponse.json({ error: "Failed to fetch email notification settings" }, { status: 500 });
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

    const normalized = normalizeNotificationEmailInput(body);
    if (!normalized.ok) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }

    const payload = normalized.payload;
    const payloadHash = hashNotificationEmailPayload(payload);
    await ensureSignedActionChallengeTable();

    try {
      await db.transaction(async tx => {
        await verifyAndConsumeSignedActionChallenge(tx, {
          challengeId: String(body.challengeId),
          action: UPDATE_NOTIFICATION_EMAIL_ACTION,
          walletAddress: payload.normalizedAddress,
          payloadHash,
          signature: body.signature as `0x${string}`,
          buildMessage: ({ nonce, expiresAt }) =>
            buildNotificationEmailChallengeMessage({
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

    try {
      const { settings, verificationToken } = await upsertEmailNotificationSettings(payload.normalizedAddress, payload);
      const appUrl = getOptionalAppUrl();
      let verificationSent = false;

      if (verificationToken && payload.email) {
        if (!appUrl) {
          return NextResponse.json(
            { error: "Email notifications are missing an application URL for verification links" },
            { status: 503 },
          );
        }
        const verifyUrl = new URL("/api/notifications/email/verify", appUrl);
        verifyUrl.searchParams.set("token", verificationToken);
        await sendNotificationVerificationEmail({
          email: payload.email,
          verifyUrl: verifyUrl.toString(),
        });
        verificationSent = true;
      }

      return NextResponse.json({ ok: true, settings, verificationSent });
    } catch (error: any) {
      if (error.message === "EMAIL_IN_USE") {
        return NextResponse.json({ error: "Email address already belongs to another wallet" }, { status: 409 });
      }
      if (error.message === "Resend is not configured") {
        return NextResponse.json(
          { error: "Email notifications are not configured on this deployment" },
          { status: 503 },
        );
      }
      throw error;
    }
  } catch (error) {
    console.error("Error updating email notification settings:", error);
    return NextResponse.json({ error: "Failed to update email notification settings" }, { status: 500 });
  }
}
