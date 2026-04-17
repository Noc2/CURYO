"use client";

import { encodeAbiParameters, keccak256, toHex } from "viem";

const RESERVED_SUBMISSION_STORAGE_PREFIX = "curyo:reserved-submission:";
const RESERVED_SUBMISSION_SECRET_STORAGE_KEY = `${RESERVED_SUBMISSION_STORAGE_PREFIX}secret`;

type SubmissionDraft = {
  categoryId: bigint;
  contextUrl: string;
  description: string;
  imageUrls: string[];
  rewardAmount: bigint;
  rewardAsset: number;
  submissionKey: `0x${string}`;
  tags: string;
  title: string;
  videoUrl: string;
};

type StoredSubmissionReservation = {
  categoryId: string;
  chainId: number;
  contextUrl: string;
  description: string;
  imageUrls: string[];
  rewardAmount: string;
  rewardAsset: number;
  revealCommitment: `0x${string}`;
  salt: `0x${string}`;
  submissionKey: `0x${string}`;
  tags: string;
  title: string;
  videoUrl: string;
};

function isHexValue(value: unknown): value is `0x${string}` {
  return typeof value === "string" && value.startsWith("0x");
}

function createRandomHex32(): `0x${string}` {
  const bytes = new Uint8Array(32);
  window.crypto.getRandomValues(bytes);
  return toHex(bytes);
}

function getSubmissionReservationSecret(): `0x${string}` {
  const existingSecret = window.localStorage.getItem(RESERVED_SUBMISSION_SECRET_STORAGE_KEY);
  if (isHexValue(existingSecret)) {
    return existingSecret;
  }

  const nextSecret = createRandomHex32();
  window.localStorage.setItem(RESERVED_SUBMISSION_SECRET_STORAGE_KEY, nextSecret);
  return nextSecret;
}

export function buildSubmissionReservationStorageKey(
  address: `0x${string}`,
  chainId: number,
  submissionKey: `0x${string}`,
): string {
  return `${RESERVED_SUBMISSION_STORAGE_PREFIX}${keccak256(
    encodeAbiParameters(
      [{ type: "address" }, { type: "uint256" }, { type: "bytes32" }],
      [address, BigInt(chainId), submissionKey],
    ),
  )}`;
}

export function deriveSubmissionReservationSalt(
  draft: SubmissionDraft,
  submitterAddress: `0x${string}`,
  chainId: number,
): `0x${string}` {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "uint256" },
        { type: "address" },
        { type: "bytes32" },
        { type: "string" },
        { type: "string" },
        { type: "string" },
        { type: "uint256" },
        { type: "uint8" },
        { type: "uint256" },
      ],
      [
        getSubmissionReservationSecret(),
        BigInt(chainId),
        submitterAddress,
        draft.submissionKey,
        draft.title,
        draft.description,
        draft.tags,
        draft.categoryId,
        draft.rewardAsset,
        draft.rewardAmount,
      ],
    ),
  );
}

export function buildSubmissionRevealCommitment(
  draft: SubmissionDraft,
  salt: `0x${string}`,
  submitterAddress: `0x${string}`,
): `0x${string}` {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "string" },
        { type: "string" },
        { type: "string" },
        { type: "uint256" },
        { type: "bytes32" },
        { type: "address" },
        { type: "uint8" },
        { type: "uint256" },
      ],
      [
        draft.submissionKey,
        draft.title,
        draft.description,
        draft.tags,
        draft.categoryId,
        salt,
        submitterAddress,
        draft.rewardAsset,
        draft.rewardAmount,
      ],
    ),
  );
}

export function createStoredSubmissionReservation(
  draft: SubmissionDraft,
  salt: `0x${string}`,
  revealCommitment: `0x${string}`,
  chainId: number,
): StoredSubmissionReservation {
  return {
    categoryId: draft.categoryId.toString(),
    chainId,
    contextUrl: draft.contextUrl,
    description: draft.description,
    imageUrls: draft.imageUrls,
    rewardAmount: draft.rewardAmount.toString(),
    rewardAsset: draft.rewardAsset,
    revealCommitment,
    salt,
    submissionKey: draft.submissionKey,
    tags: draft.tags,
    title: draft.title,
    videoUrl: draft.videoUrl,
  };
}

function stringArraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function submissionReservationMatchesDraft(
  reservation: StoredSubmissionReservation,
  draft: SubmissionDraft,
): boolean {
  return (
    reservation.categoryId === draft.categoryId.toString() &&
    reservation.contextUrl === draft.contextUrl &&
    reservation.description === draft.description &&
    reservation.rewardAmount === draft.rewardAmount.toString() &&
    reservation.rewardAsset === draft.rewardAsset &&
    reservation.submissionKey === draft.submissionKey &&
    reservation.tags === draft.tags &&
    reservation.title === draft.title &&
    reservation.videoUrl === draft.videoUrl &&
    stringArraysEqual(reservation.imageUrls, draft.imageUrls)
  );
}

function readStoredSubmissionReservationValue(storageKey: string): unknown {
  if (typeof window === "undefined") return null;

  const rawValue = window.localStorage.getItem(storageKey);
  if (!rawValue) {
    return null;
  }

  return JSON.parse(rawValue);
}

function parseStoredSubmissionReservation(value: unknown): StoredSubmissionReservation | null {
  const parsedValue = value as Partial<StoredSubmissionReservation>;
  if (
    typeof parsedValue.categoryId !== "string" ||
    typeof parsedValue.chainId !== "number" ||
    (typeof parsedValue.contextUrl !== "string" && typeof (parsedValue as { url?: unknown }).url !== "string") ||
    typeof parsedValue.description !== "string" ||
    !isHexValue(parsedValue.revealCommitment) ||
    typeof parsedValue.rewardAmount !== "string" ||
    typeof parsedValue.rewardAsset !== "number" ||
    ![0, 1].includes(parsedValue.rewardAsset) ||
    !isHexValue(parsedValue.salt) ||
    !isHexValue(parsedValue.submissionKey) ||
    typeof parsedValue.tags !== "string" ||
    typeof parsedValue.title !== "string"
  ) {
    return null;
  }

  const legacyUrl = (parsedValue as { url?: unknown }).url;
  const contextUrl = typeof parsedValue.contextUrl === "string" ? parsedValue.contextUrl : (legacyUrl as string);

  return {
    ...parsedValue,
    contextUrl,
    imageUrls: Array.isArray(parsedValue.imageUrls)
      ? parsedValue.imageUrls.filter((url): url is string => typeof url === "string")
      : contextUrl
        ? [contextUrl]
        : [],
    videoUrl: typeof parsedValue.videoUrl === "string" ? parsedValue.videoUrl : "",
  } as StoredSubmissionReservation;
}

export function getStoredSubmissionReservation(storageKey: string): StoredSubmissionReservation | null {
  try {
    return parseStoredSubmissionReservation(readStoredSubmissionReservationValue(storageKey));
  } catch {
    return null;
  }
}

export function setStoredSubmissionReservation(storageKey: string, reservation: StoredSubmissionReservation) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey, JSON.stringify(reservation));
}

export function clearStoredSubmissionReservation(storageKey: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(storageKey);
}
