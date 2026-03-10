import { buildSignedActionMessage, hashSignedActionPayload } from "~~/lib/auth/signedActions";
import { isValidWalletAddress, normalizeWalletAddress } from "~~/lib/watchlist/contentWatch";

export const NOTIFICATION_PREFERENCES_CHALLENGE_TITLE = "Curyo notification settings";
export const UPDATE_NOTIFICATION_PREFERENCES_ACTION = "notification_preferences:update";

export interface NotificationPreferencesState {
  roundResolved: boolean;
  settlingSoonHour: boolean;
  settlingSoonDay: boolean;
  followedSubmission: boolean;
  followedResolution: boolean;
}

export type NotificationPreferencesPayload = {
  normalizedAddress: `0x${string}`;
} & NotificationPreferencesState;

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferencesState = {
  roundResolved: true,
  settlingSoonHour: true,
  settlingSoonDay: true,
  followedSubmission: true,
  followedResolution: true,
};

export function normalizeNotificationPreferencesInput(body: Record<string, unknown>):
  | {
      ok: true;
      payload: NotificationPreferencesPayload;
    }
  | {
      ok: false;
      error: string;
    } {
  if (!body.address || typeof body.address !== "string" || !isValidWalletAddress(body.address)) {
    return { ok: false, error: "Invalid wallet address" };
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
      roundResolved: body.roundResolved as boolean,
      settlingSoonHour: body.settlingSoonHour as boolean,
      settlingSoonDay: body.settlingSoonDay as boolean,
      followedSubmission: body.followedSubmission as boolean,
      followedResolution: body.followedResolution as boolean,
    },
  };
}

export function hashNotificationPreferencesPayload(payload: NotificationPreferencesPayload) {
  return hashSignedActionPayload([
    payload.normalizedAddress,
    payload.roundResolved ? "1" : "0",
    payload.settlingSoonHour ? "1" : "0",
    payload.settlingSoonDay ? "1" : "0",
    payload.followedSubmission ? "1" : "0",
    payload.followedResolution ? "1" : "0",
  ]);
}

export function buildNotificationPreferencesChallengeMessage(params: {
  address: `0x${string}`;
  payloadHash: string;
  nonce: string;
  expiresAt: Date;
}) {
  return buildSignedActionMessage({
    title: NOTIFICATION_PREFERENCES_CHALLENGE_TITLE,
    action: UPDATE_NOTIFICATION_PREFERENCES_ACTION,
    address: params.address,
    payloadHash: params.payloadHash,
    nonce: params.nonce,
    expiresAt: params.expiresAt,
  });
}
