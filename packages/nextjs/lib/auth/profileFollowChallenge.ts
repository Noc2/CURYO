import { buildSignedActionMessage, hashSignedActionPayload } from "~~/lib/auth/signedActions";
import { isValidWalletAddress, normalizeWalletAddress } from "~~/lib/follows/profileFollow";

export const FOLLOW_PROFILE_ACTION = "follow-profile";
export const UNFOLLOW_PROFILE_ACTION = "unfollow-profile";
export const READ_PROFILE_FOLLOWS_ACTION = "profile-follows:read";
export const PROFILE_FOLLOW_CHALLENGE_TITLE = "Curyo follow authorization";

interface ProfileFollowChallengeInput {
  address?: string;
  targetAddress?: string;
}

export interface NormalizedProfileFollowPayload {
  normalizedAddress: `0x${string}`;
  normalizedTargetAddress: `0x${string}`;
}

interface NormalizedProfileFollowReadPayload {
  normalizedAddress: `0x${string}`;
}

export function normalizeProfileFollowChallengeInput(
  input: ProfileFollowChallengeInput,
): { ok: true; payload: NormalizedProfileFollowPayload } | { ok: false; error: string } {
  if (!input.address || !isValidWalletAddress(input.address)) {
    return { ok: false, error: "Invalid wallet address" };
  }

  if (!input.targetAddress || !isValidWalletAddress(input.targetAddress)) {
    return { ok: false, error: "Invalid target address" };
  }

  const normalizedAddress = normalizeWalletAddress(input.address);
  const normalizedTargetAddress = normalizeWalletAddress(input.targetAddress);

  if (normalizedAddress === normalizedTargetAddress) {
    return { ok: false, error: "Cannot follow yourself" };
  }

  return {
    ok: true,
    payload: {
      normalizedAddress,
      normalizedTargetAddress,
    },
  };
}

export function normalizeProfileFollowReadInput(
  input: Pick<ProfileFollowChallengeInput, "address">,
): { ok: true; payload: NormalizedProfileFollowReadPayload } | { ok: false; error: string } {
  if (!input.address || !isValidWalletAddress(input.address)) {
    return { ok: false, error: "Invalid wallet address" };
  }

  return {
    ok: true,
    payload: {
      normalizedAddress: normalizeWalletAddress(input.address),
    },
  };
}

export function hashProfileFollowPayload(payload: NormalizedProfileFollowPayload): string {
  return hashSignedActionPayload([`target:${payload.normalizedTargetAddress}`]);
}

export function hashProfileFollowReadPayload(payload: NormalizedProfileFollowReadPayload): string {
  return hashSignedActionPayload([payload.normalizedAddress]);
}

export function buildProfileFollowChallengeMessage(params: {
  action: typeof FOLLOW_PROFILE_ACTION | typeof UNFOLLOW_PROFILE_ACTION;
  address: `0x${string}`;
  payloadHash: string;
  nonce: string;
  expiresAt: Date;
}): string {
  return buildSignedActionMessage({
    title: PROFILE_FOLLOW_CHALLENGE_TITLE,
    action: params.action,
    address: params.address,
    payloadHash: params.payloadHash,
    nonce: params.nonce,
    expiresAt: params.expiresAt,
  });
}

export function buildProfileFollowReadChallengeMessage(params: {
  address: `0x${string}`;
  payloadHash: string;
  nonce: string;
  expiresAt: Date;
}): string {
  return buildSignedActionMessage({
    title: PROFILE_FOLLOW_CHALLENGE_TITLE,
    action: READ_PROFILE_FOLLOWS_ACTION,
    address: params.address,
    payloadHash: params.payloadHash,
    nonce: params.nonce,
    expiresAt: params.expiresAt,
  });
}
