import { buildSignedActionMessage, hashSignedActionPayload } from "~~/lib/auth/signedActions";
import type {
  ContentFeedbackChallengePayload,
  NormalizedContentFeedbackReadInput,
} from "~~/lib/feedback/contentFeedback";

export const CREATE_CONTENT_FEEDBACK_ACTION = "content-feedback:create";
export const READ_CONTENT_FEEDBACK_ACTION = "content-feedback:read";
export const CONTENT_FEEDBACK_CHALLENGE_TITLE = "Curyo feedback authorization";

export function hashContentFeedbackPayload(payload: ContentFeedbackChallengePayload): string {
  return hashSignedActionPayload([
    `chainId:${payload.chainId}`,
    `contentId:${payload.contentId}`,
    `roundId:${payload.roundId}`,
    `author:${payload.normalizedAddress}`,
    `feedbackType:${payload.feedbackType}`,
    `body:${payload.body}`,
    `sourceUrl:${payload.sourceUrl ?? ""}`,
    `clientNonce:${payload.clientNonce}`,
    `feedbackHash:${payload.feedbackHash}`,
  ]);
}

export function hashContentFeedbackReadPayload(payload: NormalizedContentFeedbackReadInput): string {
  return hashSignedActionPayload([`contentId:${payload.contentId}`, `address:${payload.normalizedAddress ?? ""}`]);
}

export function buildContentFeedbackChallengeMessage(params: {
  address: `0x${string}`;
  payloadHash: string;
  nonce: string;
  expiresAt: Date;
}): string {
  return buildSignedActionMessage({
    title: CONTENT_FEEDBACK_CHALLENGE_TITLE,
    action: CREATE_CONTENT_FEEDBACK_ACTION,
    address: params.address,
    payloadHash: params.payloadHash,
    nonce: params.nonce,
    expiresAt: params.expiresAt,
  });
}

export function buildContentFeedbackReadChallengeMessage(params: {
  address: `0x${string}`;
  payloadHash: string;
  nonce: string;
  expiresAt: Date;
}): string {
  return buildSignedActionMessage({
    title: CONTENT_FEEDBACK_CHALLENGE_TITLE,
    action: READ_CONTENT_FEEDBACK_ACTION,
    address: params.address,
    payloadHash: params.payloadHash,
    nonce: params.nonce,
    expiresAt: params.expiresAt,
  });
}
