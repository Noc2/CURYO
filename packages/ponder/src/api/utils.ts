import { getCanonicalUrlParts, getUrlLookupCandidates } from "../urlCanonicalization.js";

export { getCanonicalUrlParts, getUrlLookupCandidates } from "../urlCanonicalization.js";

export const MAX_PAGINATION_OFFSET = 50_000;
const MIN_CONTENT_SEARCH_QUERY_LENGTH = 3;

const LIKELY_URL_SEARCH_PATTERN = /^[a-z0-9.-]+\.[a-z]{2,}(?:[/?#:].*)?$/i;

/** Safely parse a BigInt from a query/path parameter, returning null on invalid input. */
export function safeBigInt(value: string): bigint | null {
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

/** Safely parse pagination limit with defaults and clamping. */
export function safeLimit(value: string | undefined, defaultVal: number, max: number): number {
  const parsed = parseInt(value ?? String(defaultVal));
  if (isNaN(parsed) || parsed < 1) return defaultVal;
  return Math.min(parsed, max);
}

/** Safely parse pagination offset, returning 0 for invalid values. */
export function safeOffset(value: string | undefined): number {
  const parsed = parseInt(value ?? "0");
  if (isNaN(parsed) || parsed < 0) return 0;
  if (parsed > MAX_PAGINATION_OFFSET) return Number.NaN;
  return parsed;
}

/** Validate Ethereum address format (0x + 40 hex chars). */
export function isValidAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/i.test(value);
}

export function isLikelyUrlSearchQuery(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;

  if (getUrlLookupCandidates(trimmed) !== null) {
    return true;
  }

  return LIKELY_URL_SEARCH_PATTERN.test(trimmed);
}

export function normalizeContentSearchQuery(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  if (trimmed.length < MIN_CONTENT_SEARCH_QUERY_LENGTH && !isLikelyUrlSearchQuery(trimmed)) {
    return null;
  }

  return trimmed.toLowerCase();
}
