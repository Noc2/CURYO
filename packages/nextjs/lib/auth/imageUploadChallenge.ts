import "server-only";
import { getMaxImageUploadSizeBytes, isSupportedImageUploadMimeType } from "~~/lib/auth/imageUploadChallenge.shared";
import { buildSignedActionMessage, hashSignedActionPayload } from "~~/lib/auth/signedActions";
import { isValidWalletAddress, normalizeWalletAddress } from "~~/lib/watchlist/contentWatch";

export const IMAGE_UPLOAD_CHALLENGE_TITLE = "Curyo image upload";
export const UPLOAD_IMAGE_ACTION = "attachments:upload_image";

export type ImageUploadChallengePayload = {
  attachmentId: string;
  filename: string;
  mimeType: string;
  normalizedAddress: `0x${string}`;
  sha256: string;
  sizeBytes: number;
};

type NormalizedResult<TPayload> = { ok: true; payload: TPayload } | { ok: false; error: string };

const ATTACHMENT_ID_PATTERN = /^att_[A-Za-z0-9_-]{16,80}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export function normalizeImageUploadChallengeInput(
  body: Record<string, unknown>,
): NormalizedResult<ImageUploadChallengePayload> {
  const address = typeof body.address === "string" ? body.address.trim() : "";
  if (!address || !isValidWalletAddress(address)) {
    return { ok: false, error: "Invalid wallet address." };
  }

  const attachmentId = typeof body.attachmentId === "string" ? body.attachmentId.trim() : "";
  if (!ATTACHMENT_ID_PATTERN.test(attachmentId)) {
    return { ok: false, error: "Invalid attachment id." };
  }

  const filename = typeof body.filename === "string" ? body.filename.trim().slice(0, 180) : "";
  if (!filename) {
    return { ok: false, error: "Filename is required." };
  }

  const mimeType = typeof body.mimeType === "string" ? body.mimeType.trim().toLowerCase() : "";
  if (!isSupportedImageUploadMimeType(mimeType)) {
    return { ok: false, error: "Unsupported image type." };
  }

  const sizeBytes = typeof body.sizeBytes === "number" ? body.sizeBytes : Number(body.sizeBytes);
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > getMaxImageUploadSizeBytes()) {
    return { ok: false, error: "Image is too large." };
  }

  const sha256 = typeof body.sha256 === "string" ? body.sha256.trim().toLowerCase() : "";
  if (!SHA256_PATTERN.test(sha256)) {
    return { ok: false, error: "Invalid image hash." };
  }

  return {
    ok: true,
    payload: {
      attachmentId,
      filename,
      mimeType,
      normalizedAddress: normalizeWalletAddress(address),
      sha256,
      sizeBytes,
    },
  };
}

export function hashImageUploadChallengePayload(payload: ImageUploadChallengePayload) {
  return hashSignedActionPayload([
    payload.normalizedAddress,
    payload.attachmentId,
    payload.filename,
    payload.mimeType,
    String(payload.sizeBytes),
    payload.sha256,
  ]);
}

export function buildImageUploadChallengeMessage(params: {
  payload: ImageUploadChallengePayload;
  payloadHash: string;
  nonce: string;
  expiresAt: Date;
}) {
  return buildSignedActionMessage({
    title: IMAGE_UPLOAD_CHALLENGE_TITLE,
    action: UPLOAD_IMAGE_ACTION,
    address: params.payload.normalizedAddress,
    payloadHash: params.payloadHash,
    nonce: params.nonce,
    expiresAt: params.expiresAt,
  });
}
