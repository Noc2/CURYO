import { randomBytes } from "node:crypto";
import { encodeAbiParameters, getAddress, isHex, keccak256, stringToHex } from "viem";
import type { ContentFeedbackType } from "~~/lib/feedback/types";

export const CONTENT_FEEDBACK_HASH_DOMAIN = "curyo.content-feedback.v1";

export interface ContentFeedbackHashInput {
  chainId: number;
  contentId: string;
  roundId: string;
  authorAddress: `0x${string}`;
  feedbackType: ContentFeedbackType;
  body: string;
  sourceUrl: string | null;
  clientNonce: `0x${string}`;
}

export interface ContentFeedbackHashMetadata {
  chainId: number;
  roundId: string;
  clientNonce: `0x${string}`;
  feedbackHash: `0x${string}`;
}

function isBytes32Hex(value: unknown): value is `0x${string}` {
  return typeof value === "string" && isHex(value, { strict: true }) && value.length === 66;
}

export function createContentFeedbackNonce(): `0x${string}` {
  return `0x${randomBytes(32).toString("hex")}`;
}

export function normalizeContentFeedbackHashMetadata(input: {
  chainId?: unknown;
  roundId?: unknown;
  clientNonce?: unknown;
  feedbackHash?: unknown;
}): { ok: true; metadata: ContentFeedbackHashMetadata } | { ok: false; error: string } {
  const chainId =
    typeof input.chainId === "number"
      ? input.chainId
      : typeof input.chainId === "string"
        ? Number.parseInt(input.chainId, 10)
        : Number.NaN;
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    return { ok: false, error: "Invalid chainId" };
  }

  const roundId =
    typeof input.roundId === "bigint"
      ? input.roundId.toString()
      : typeof input.roundId === "number"
        ? Number.isSafeInteger(input.roundId) && input.roundId > 0
          ? String(input.roundId)
          : null
        : typeof input.roundId === "string" && /^\d+$/.test(input.roundId.trim())
          ? input.roundId.trim().replace(/^0+(?=\d)/, "")
          : null;
  if (!roundId || roundId === "0") {
    return { ok: false, error: "Invalid roundId" };
  }

  if (!isBytes32Hex(input.clientNonce)) {
    return { ok: false, error: "Invalid feedback nonce" };
  }
  if (!isBytes32Hex(input.feedbackHash)) {
    return { ok: false, error: "Invalid feedback hash" };
  }

  return {
    ok: true,
    metadata: {
      chainId,
      roundId,
      clientNonce: input.clientNonce.toLowerCase() as `0x${string}`,
      feedbackHash: input.feedbackHash.toLowerCase() as `0x${string}`,
    },
  };
}

export function buildContentFeedbackHash(input: ContentFeedbackHashInput): `0x${string}` {
  const bodyHash = keccak256(stringToHex(input.body));
  const sourceUrlHash = keccak256(stringToHex(input.sourceUrl ?? ""));

  return keccak256(
    encodeAbiParameters(
      [
        { type: "string" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "address" },
        { type: "string" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "bytes32" },
      ],
      [
        CONTENT_FEEDBACK_HASH_DOMAIN,
        BigInt(input.chainId),
        BigInt(input.contentId),
        BigInt(input.roundId),
        getAddress(input.authorAddress),
        input.feedbackType,
        bodyHash,
        sourceUrlHash,
        input.clientNonce,
      ],
    ),
  ).toLowerCase() as `0x${string}`;
}
