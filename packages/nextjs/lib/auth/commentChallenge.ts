import { buildSignedActionMessage, hashSignedActionPayload } from "~~/lib/auth/signedActions";

export const COMMENT_CHALLENGE_ACTION = "comment-create";
export const COMMENT_CHALLENGE_TITLE = "Curyo comment authorization";

export interface CommentChallengeInput {
  address?: string;
  contentId?: string | number | bigint;
  body?: string;
}

export interface NormalizedCommentChallengePayload {
  normalizedAddress: `0x${string}`;
  contentId: string;
  body: string;
}

function isValidAddress(address: string): address is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

export function normalizeCommentChallengeInput(
  input: CommentChallengeInput,
): { ok: true; payload: NormalizedCommentChallengePayload } | { ok: false; error: string } {
  if (!input.address || !isValidAddress(input.address)) {
    return { ok: false, error: "Invalid wallet address" };
  }

  const contentId = input.contentId?.toString().trim();
  if (!contentId) {
    return { ok: false, error: "Missing contentId" };
  }

  const trimmedBody = input.body?.trim();
  if (!trimmedBody || trimmedBody.length > 500) {
    return { ok: false, error: "Comment must be 1-500 characters" };
  }

  return {
    ok: true,
    payload: {
      normalizedAddress: input.address.toLowerCase() as `0x${string}`,
      contentId,
      body: trimmedBody,
    },
  };
}

export function hashCommentChallengePayload(payload: NormalizedCommentChallengePayload): string {
  return hashSignedActionPayload([`contentId:${payload.contentId}`, `body:${payload.body}`]);
}

export function buildCommentChallengeMessage(params: {
  address: `0x${string}`;
  payloadHash: string;
  nonce: string;
  expiresAt: Date;
}): string {
  return buildSignedActionMessage({
    title: COMMENT_CHALLENGE_TITLE,
    action: COMMENT_CHALLENGE_ACTION,
    address: params.address,
    payloadHash: params.payloadHash,
    nonce: params.nonce,
    expiresAt: params.expiresAt,
  });
}
