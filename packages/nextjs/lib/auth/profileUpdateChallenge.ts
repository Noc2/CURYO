import { createHash } from "crypto";
import {
  buildSignedActionMessage,
  createSignedActionChallenge,
  ensureSignedActionChallengeTable,
} from "~~/lib/auth/signedActions";

export const PROFILE_UPDATE_CHALLENGE_ACTION = "profile-update";
export const PROFILE_UPDATE_CHALLENGE_TITLE = "Curyo profile update authorization";

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/;

export interface ProfileUpdateInput {
  address?: string;
  username?: string | null;
  profileImageUrl?: string | null;
}

export interface NormalizedProfileUpdatePayload {
  normalizedAddress: `0x${string}`;
  username?: string;
  profileImageUrl?: string | null;
  hasUsername: boolean;
  hasProfileImage: boolean;
}

export async function ensureProfileUpdateChallengeTable() {
  await ensureSignedActionChallengeTable();
}

function isValidAddress(address: string): address is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

export function isValidProfileImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function normalizeProfileUpdateInput(
  input: ProfileUpdateInput,
): { ok: true; payload: NormalizedProfileUpdatePayload } | { ok: false; error: string } {
  if (!input.address || !isValidAddress(input.address)) {
    return { ok: false, error: "Invalid wallet address" };
  }

  const hasUsername = input.username !== undefined && input.username !== null;
  const hasProfileImage = input.profileImageUrl !== undefined;

  if (!hasUsername && !hasProfileImage) {
    return { ok: false, error: "Must provide username or profileImageUrl" };
  }

  if (hasUsername && !USERNAME_REGEX.test(input.username!)) {
    return { ok: false, error: "Username must be 3-20 characters (letters, numbers, underscores only)" };
  }

  let normalizedProfileImageUrl: string | null | undefined = undefined;
  if (hasProfileImage) {
    const imageUrl = input.profileImageUrl;

    if (imageUrl === "" || imageUrl === null) {
      normalizedProfileImageUrl = null;
    } else if (typeof imageUrl !== "string" || !isValidProfileImageUrl(imageUrl)) {
      return { ok: false, error: "Invalid image URL format (must be http or https)" };
    } else {
      normalizedProfileImageUrl = imageUrl;
    }
  }

  return {
    ok: true,
    payload: {
      normalizedAddress: input.address.toLowerCase() as `0x${string}`,
      ...(hasUsername ? { username: input.username! } : {}),
      ...(hasProfileImage ? { profileImageUrl: normalizedProfileImageUrl } : {}),
      hasUsername,
      hasProfileImage,
    },
  };
}

export function hashProfileUpdatePayload(payload: NormalizedProfileUpdatePayload): string {
  const serialized = [
    `username:${payload.hasUsername ? (payload.username ?? "") : "__absent__"}`,
    `profileImageUrl:${payload.hasProfileImage ? (payload.profileImageUrl ?? "") : "__absent__"}`,
  ].join("\n");

  return createHash("sha256").update(serialized).digest("hex");
}

export function buildProfileUpdateChallengeMessage(params: {
  address: `0x${string}`;
  payloadHash: string;
  nonce: string;
  expiresAt: Date;
}): string {
  return buildSignedActionMessage({
    title: PROFILE_UPDATE_CHALLENGE_TITLE,
    action: PROFILE_UPDATE_CHALLENGE_ACTION,
    address: params.address,
    payloadHash: params.payloadHash,
    nonce: params.nonce,
    expiresAt: params.expiresAt,
  });
}

export function createProfileUpdateChallenge(payload: NormalizedProfileUpdatePayload) {
  const payloadHash = hashProfileUpdatePayload(payload);
  return createSignedActionChallenge({
    title: PROFILE_UPDATE_CHALLENGE_TITLE,
    action: PROFILE_UPDATE_CHALLENGE_ACTION,
    address: payload.normalizedAddress,
    payloadHash,
  });
}
