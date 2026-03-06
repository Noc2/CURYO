import {
  buildSignedActionMessage,
  createSignedActionChallenge,
  hashSignedActionPayload,
} from "~~/lib/auth/signedActions";
import { isValidWalletAddress, normalizeWalletAddress } from "~~/lib/social/profileFollows";

export const FOLLOW_PROFILE_ACTION = "follow-profile";
export const UNFOLLOW_PROFILE_ACTION = "unfollow-profile";
export const FOLLOW_PROFILE_CHALLENGE_TITLE = "Curyo follow authorization";

export interface FollowProfileChallengeInput {
  address?: string;
  targetAddress?: string;
}

export interface NormalizedFollowProfileChallengePayload {
  normalizedAddress: `0x${string}`;
  normalizedTargetAddress: `0x${string}`;
}

export function normalizeFollowProfileChallengeInput(
  input: FollowProfileChallengeInput,
): { ok: true; payload: NormalizedFollowProfileChallengePayload } | { ok: false; error: string } {
  if (
    !input.address ||
    !input.targetAddress ||
    !isValidWalletAddress(input.address) ||
    !isValidWalletAddress(input.targetAddress)
  ) {
    return { ok: false, error: "Missing or invalid fields" };
  }

  const normalizedAddress = normalizeWalletAddress(input.address);
  const normalizedTargetAddress = normalizeWalletAddress(input.targetAddress);
  if (normalizedAddress === normalizedTargetAddress) {
    return { ok: false, error: "You cannot follow yourself" };
  }

  return {
    ok: true,
    payload: {
      normalizedAddress,
      normalizedTargetAddress,
    },
  };
}

export function hashFollowProfileChallengePayload(payload: NormalizedFollowProfileChallengePayload): string {
  return hashSignedActionPayload([`targetAddress:${payload.normalizedTargetAddress}`]);
}

export function buildFollowProfileChallengeMessage(params: {
  action: typeof FOLLOW_PROFILE_ACTION | typeof UNFOLLOW_PROFILE_ACTION;
  address: `0x${string}`;
  payloadHash: string;
  nonce: string;
  expiresAt: Date;
}): string {
  return buildSignedActionMessage({
    title: FOLLOW_PROFILE_CHALLENGE_TITLE,
    action: params.action,
    address: params.address,
    payloadHash: params.payloadHash,
    nonce: params.nonce,
    expiresAt: params.expiresAt,
  });
}

export function createFollowProfileChallenge(
  payload: NormalizedFollowProfileChallengePayload,
  action: typeof FOLLOW_PROFILE_ACTION | typeof UNFOLLOW_PROFILE_ACTION,
) {
  const payloadHash = hashFollowProfileChallengePayload(payload);

  return createSignedActionChallenge({
    title: FOLLOW_PROFILE_CHALLENGE_TITLE,
    action,
    address: payload.normalizedAddress,
    payloadHash,
  });
}
