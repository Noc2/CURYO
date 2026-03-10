import "server-only";
import { buildSignedActionMessage, hashSignedActionPayload } from "~~/lib/auth/signedActions";
import { type EmailNotificationSettingsPayload } from "~~/lib/notifications/emailShared";
import { isValidWalletAddress, normalizeWalletAddress } from "~~/lib/watchlist/contentWatch";

export const NOTIFICATION_EMAIL_CHALLENGE_TITLE = "Curyo email notification settings";
export const UPDATE_NOTIFICATION_EMAIL_ACTION = "notification_email:update";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type NotificationEmailPayload = {
  normalizedAddress: `0x${string}`;
  email: string | null;
} & Omit<EmailNotificationSettingsPayload, "email">;

export function normalizeNotificationEmailInput(
  body: Record<string, unknown>,
): { ok: true; payload: NotificationEmailPayload } | { ok: false; error: string } {
  if (!body.address || typeof body.address !== "string" || !isValidWalletAddress(body.address)) {
    return { ok: false, error: "Invalid wallet address" };
  }

  const rawEmail = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const email = rawEmail.length > 0 ? rawEmail : null;

  if (email && !EMAIL_REGEX.test(email)) {
    return { ok: false, error: "Invalid email address" };
  }

  const flags = {
    roundResolved: body.roundResolved,
    settlingSoonHour: body.settlingSoonHour,
    settlingSoonDay: body.settlingSoonDay,
    followedSubmission: body.followedSubmission,
    followedResolution: body.followedResolution,
  };

  for (const [key, value] of Object.entries(flags)) {
    if (typeof value !== "boolean") {
      return { ok: false, error: `Invalid preference: ${key}` };
    }
  }

  return {
    ok: true,
    payload: {
      normalizedAddress: normalizeWalletAddress(body.address),
      email,
      roundResolved: email ? (body.roundResolved as boolean) : false,
      settlingSoonHour: email ? (body.settlingSoonHour as boolean) : false,
      settlingSoonDay: email ? (body.settlingSoonDay as boolean) : false,
      followedSubmission: email ? (body.followedSubmission as boolean) : false,
      followedResolution: email ? (body.followedResolution as boolean) : false,
    },
  };
}

export function hashNotificationEmailPayload(payload: NotificationEmailPayload) {
  return hashSignedActionPayload([
    payload.normalizedAddress,
    payload.email ?? "",
    payload.roundResolved ? "1" : "0",
    payload.settlingSoonHour ? "1" : "0",
    payload.settlingSoonDay ? "1" : "0",
    payload.followedSubmission ? "1" : "0",
    payload.followedResolution ? "1" : "0",
  ]);
}

export function buildNotificationEmailChallengeMessage(params: {
  address: `0x${string}`;
  payloadHash: string;
  nonce: string;
  expiresAt: Date;
}) {
  return buildSignedActionMessage({
    title: NOTIFICATION_EMAIL_CHALLENGE_TITLE,
    action: UPDATE_NOTIFICATION_EMAIL_ACTION,
    address: params.address,
    payloadHash: params.payloadHash,
    nonce: params.nonce,
    expiresAt: params.expiresAt,
  });
}
