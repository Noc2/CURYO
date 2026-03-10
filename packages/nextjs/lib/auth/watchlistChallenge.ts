import { buildSignedActionMessage, hashSignedActionPayload } from "~~/lib/auth/signedActions";
import { isValidWalletAddress, normalizeContentId, normalizeWalletAddress } from "~~/lib/watchlist/contentWatch";

export const WATCH_CONTENT_ACTION = "watch-content";
export const UNWATCH_CONTENT_ACTION = "unwatch-content";
export const READ_WATCHLIST_ACTION = "watchlist:read";
export const WATCHLIST_CHALLENGE_TITLE = "Curyo watchlist authorization";

export interface WatchlistChallengeInput {
  address?: string;
  contentId?: string | number | bigint;
}

export interface NormalizedWatchlistChallengePayload {
  normalizedAddress: `0x${string}`;
  contentId: string;
}

export interface NormalizedWatchlistReadPayload {
  normalizedAddress: `0x${string}`;
}

export function normalizeWatchlistChallengeInput(
  input: WatchlistChallengeInput,
): { ok: true; payload: NormalizedWatchlistChallengePayload } | { ok: false; error: string } {
  if (!input.address || !isValidWalletAddress(input.address)) {
    return { ok: false, error: "Invalid wallet address" };
  }

  const contentId = normalizeContentId(input.contentId);
  if (!contentId) {
    return { ok: false, error: "Missing or invalid contentId" };
  }

  return {
    ok: true,
    payload: {
      normalizedAddress: normalizeWalletAddress(input.address),
      contentId,
    },
  };
}

export function hashWatchlistChallengePayload(payload: NormalizedWatchlistChallengePayload): string {
  return hashSignedActionPayload([`contentId:${payload.contentId}`]);
}

export function normalizeWatchlistReadInput(
  input: Pick<WatchlistChallengeInput, "address">,
): { ok: true; payload: NormalizedWatchlistReadPayload } | { ok: false; error: string } {
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

export function hashWatchlistReadPayload(payload: NormalizedWatchlistReadPayload): string {
  return hashSignedActionPayload([payload.normalizedAddress]);
}

export function buildWatchlistChallengeMessage(params: {
  action: typeof WATCH_CONTENT_ACTION | typeof UNWATCH_CONTENT_ACTION;
  address: `0x${string}`;
  payloadHash: string;
  nonce: string;
  expiresAt: Date;
}): string {
  return buildSignedActionMessage({
    title: WATCHLIST_CHALLENGE_TITLE,
    action: params.action,
    address: params.address,
    payloadHash: params.payloadHash,
    nonce: params.nonce,
    expiresAt: params.expiresAt,
  });
}

export function buildWatchlistReadChallengeMessage(params: {
  address: `0x${string}`;
  payloadHash: string;
  nonce: string;
  expiresAt: Date;
}): string {
  return buildSignedActionMessage({
    title: WATCHLIST_CHALLENGE_TITLE,
    action: READ_WATCHLIST_ACTION,
    address: params.address,
    payloadHash: params.payloadHash,
    nonce: params.nonce,
    expiresAt: params.expiresAt,
  });
}
