import "server-only";
import { buildSignedActionMessage, hashSignedActionPayload } from "~~/lib/auth/signedActions";
import { isValidWalletAddress, normalizeWalletAddress } from "~~/lib/watchlist/contentWatch";

export const PRIVATE_ACCOUNT_ACCESS_CHALLENGE_TITLE = "Curyo account access";
export const READ_PRIVATE_ACCOUNT_ACTION = "account:read_private";

export type PrivateAccountReadPayload = {
  normalizedAddress: `0x${string}`;
};

type NormalizedResult<TPayload> = { ok: true; payload: TPayload } | { ok: false; error: string };

export function normalizePrivateAccountReadInput(
  body: Record<string, unknown>,
): NormalizedResult<PrivateAccountReadPayload> {
  if (!body.address || typeof body.address !== "string" || !isValidWalletAddress(body.address)) {
    return { ok: false, error: "Invalid wallet address" };
  }

  return {
    ok: true,
    payload: {
      normalizedAddress: normalizeWalletAddress(body.address),
    },
  };
}

export function hashPrivateAccountReadPayload(payload: PrivateAccountReadPayload) {
  return hashSignedActionPayload([payload.normalizedAddress]);
}

export function buildPrivateAccountReadChallengeMessage(params: {
  address: `0x${string}`;
  payloadHash: string;
  nonce: string;
  expiresAt: Date;
}) {
  return buildSignedActionMessage({
    title: PRIVATE_ACCOUNT_ACCESS_CHALLENGE_TITLE,
    action: READ_PRIVATE_ACCOUNT_ACTION,
    address: params.address,
    payloadHash: params.payloadHash,
    nonce: params.nonce,
    expiresAt: params.expiresAt,
  });
}
