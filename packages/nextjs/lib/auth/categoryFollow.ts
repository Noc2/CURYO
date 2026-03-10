import { buildSignedActionMessage, hashSignedActionPayload } from "~~/lib/auth/signedActions";
import { isValidWalletAddress, normalizeWalletAddress } from "~~/lib/watchlist/contentWatch";

export const FOLLOW_CATEGORY_CHALLENGE_TITLE = "Curyo category follow authorization";
export const FOLLOW_CATEGORY_ACTION = "category_follow:follow";
export const UNFOLLOW_CATEGORY_ACTION = "category_follow:unfollow";

export type CategoryFollowPayload = {
  normalizedAddress: `0x${string}`;
  categoryId: string;
};

export function normalizeCategoryFollowInput(body: Record<string, unknown>):
  | {
      ok: true;
      payload: CategoryFollowPayload;
    }
  | {
      ok: false;
      error: string;
    } {
  if (!body.address || typeof body.address !== "string" || !isValidWalletAddress(body.address)) {
    return { ok: false, error: "Invalid wallet address" };
  }

  const rawCategoryId = body.categoryId;
  const categoryId =
    typeof rawCategoryId === "bigint"
      ? rawCategoryId.toString()
      : typeof rawCategoryId === "number"
        ? String(rawCategoryId)
        : typeof rawCategoryId === "string"
          ? rawCategoryId.trim()
          : "";

  if (!/^\d+$/.test(categoryId)) {
    return { ok: false, error: "Invalid category id" };
  }

  return {
    ok: true,
    payload: {
      normalizedAddress: normalizeWalletAddress(body.address),
      categoryId,
    },
  };
}

export function hashCategoryFollowPayload(payload: CategoryFollowPayload) {
  return hashSignedActionPayload([payload.normalizedAddress, payload.categoryId]);
}

export function buildCategoryFollowChallengeMessage(params: {
  action: string;
  address: `0x${string}`;
  payloadHash: string;
  nonce: string;
  expiresAt: Date;
}) {
  return buildSignedActionMessage({
    title: FOLLOW_CATEGORY_CHALLENGE_TITLE,
    action: params.action,
    address: params.address,
    payloadHash: params.payloadHash,
    nonce: params.nonce,
    expiresAt: params.expiresAt,
  });
}
