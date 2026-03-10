import { NextRequest, NextResponse } from "next/server";
import {
  READ_NOTIFICATION_EMAIL_ACTION,
  UPDATE_NOTIFICATION_EMAIL_ACTION,
  buildNotificationEmailChallengeMessage,
  buildNotificationEmailReadChallengeMessage,
  hashNotificationEmailPayload,
  hashNotificationEmailReadPayload,
  normalizeNotificationEmailInput,
  normalizeNotificationEmailReadInput,
} from "~~/lib/auth/notificationEmails";
import {
  ensureSignedActionChallengeTable,
  mapSignedActionError,
  verifyAndConsumeSignedActionChallenge,
} from "~~/lib/auth/signedActions";
import {
  NOTIFICATION_EMAIL_SIGNED_READ_SESSION_COOKIE_NAME,
  getSignedReadSessionCookie,
  issueSignedReadSession,
  verifySignedReadSession,
} from "~~/lib/auth/signedReadSessions";
import { db } from "~~/lib/db";
import { getOptionalAppUrl } from "~~/lib/env/server";
import {
  getEmailNotificationSettings,
  getEmailNotificationSubscription,
  restoreEmailNotificationSubscription,
  upsertEmailNotificationSettings,
} from "~~/lib/notifications/emailSettings";
import { isResendConfigured, sendNotificationVerificationEmail } from "~~/lib/notifications/resend";
import { checkRateLimit } from "~~/utils/rateLimit";

const READ_RATE_LIMIT = { limit: 30, windowMs: 60_000 };
const WRITE_RATE_LIMIT = { limit: 10, windowMs: 60_000 };

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address");
  const limited = await checkRateLimit(request, READ_RATE_LIMIT, {
    extraKeyParts: [typeof address === "string" ? address : undefined],
  });
  if (limited) return limited;

  try {
    const normalized = normalizeNotificationEmailReadInput({
      address: typeof address === "string" ? address : undefined,
    });
    if (!normalized.ok) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }

    const hasSession = await verifySignedReadSession(
      request.cookies.get(NOTIFICATION_EMAIL_SIGNED_READ_SESSION_COOKIE_NAME)?.value,
      normalized.payload.normalizedAddress,
      "notification_email",
    );
    if (!hasSession) {
      return NextResponse.json({ error: "Signed read required" }, { status: 401 });
    }

    const settings = await getEmailNotificationSettings(normalized.payload.normalizedAddress);
    return NextResponse.json(settings);
  } catch (error) {
    console.error("Error fetching email notification settings:", error);
    return NextResponse.json({ error: "Failed to fetch email notification settings" }, { status: 500 });
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

    const normalized = normalizeNotificationEmailReadInput(body);
    if (!normalized.ok) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }

    const payload = normalized.payload;
    const payloadHash = hashNotificationEmailReadPayload(payload);
    await ensureSignedActionChallengeTable();

    try {
      await db.transaction(async tx => {
        await verifyAndConsumeSignedActionChallenge(tx, {
          challengeId: String(body.challengeId),
          action: READ_NOTIFICATION_EMAIL_ACTION,
          walletAddress: payload.normalizedAddress,
          payloadHash,
          signature: body.signature as `0x${string}`,
          buildMessage: ({ nonce, expiresAt }) =>
            buildNotificationEmailReadChallengeMessage({
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

    const session = await issueSignedReadSession(payload.normalizedAddress, "notification_email");
    const settings = await getEmailNotificationSettings(payload.normalizedAddress);
    const response = NextResponse.json(settings);
    response.cookies.set(getSignedReadSessionCookie("notification_email", session));
    return response;
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
    const existingSubscription = await getEmailNotificationSubscription(payload.normalizedAddress);
    const requiresVerification =
      Boolean(payload.email) &&
      (!existingSubscription ||
        existingSubscription.email !== payload.email ||
        existingSubscription.verifiedAt === null);
    const appUrl = getOptionalAppUrl();

    if (requiresVerification && !appUrl) {
      return NextResponse.json(
        { error: "Email notifications are missing an application URL for verification links" },
        { status: 503 },
      );
    }

    if (requiresVerification && !isResendConfigured()) {
      return NextResponse.json({ error: "Email notifications are not configured on this deployment" }, { status: 503 });
    }

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
    } catch (error: unknown) {
      const mapped = mapSignedActionError(error);
      if (mapped) {
        return NextResponse.json({ error: mapped.error }, { status: mapped.status });
      }
      throw error;
    }

    try {
      const { settings, verificationToken } = await upsertEmailNotificationSettings(payload.normalizedAddress, payload);
      let verificationSent = false;

      if (verificationToken && payload.email) {
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
      if (payload.email) {
        await restoreEmailNotificationSubscription(payload.normalizedAddress, existingSubscription);
      }
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
