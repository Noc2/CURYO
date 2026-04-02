import { getAddress } from "viem";
import { getFreeTransactionLimit, getServerEnvironmentScope } from "~~/lib/env/server";

type ErrorWithCause = Error & {
  code?: string;
  cause?: unknown;
};

const STORE_UNAVAILABLE_ERROR_CODES = new Set([
  "28000",
  "42P01",
  "ECONNREFUSED",
  "EPERM",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENOTFOUND",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "CERT_HAS_EXPIRED",
  "ERR_TLS_CERT_ALTNAME_INVALID",
]);

function normalizeWalletAddress(address: string) {
  return getAddress(address) as `0x${string}`;
}

export function isFreeTransactionStoreUnavailableError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as ErrorWithCause;
  if (candidate.code && STORE_UNAVAILABLE_ERROR_CODES.has(candidate.code)) {
    return true;
  }

  return isFreeTransactionStoreUnavailableError(candidate.cause);
}

export function buildUnavailableFreeTransactionSummary(params: { address: string; chainId: number }) {
  return {
    chainId: params.chainId,
    environment: getServerEnvironmentScope(),
    limit: getFreeTransactionLimit(),
    used: 0,
    remaining: 0,
    verified: false,
    exhausted: false,
    walletAddress: normalizeWalletAddress(params.address),
    voterIdTokenId: null,
  };
}

export function buildVerifiedFreeTransactionFallbackSummary(params: {
  address: string;
  chainId: number;
  voterIdTokenId: string;
}) {
  const limit = getFreeTransactionLimit();

  return {
    chainId: params.chainId,
    environment: getServerEnvironmentScope(),
    limit,
    used: 0,
    remaining: limit,
    verified: true,
    exhausted: false,
    walletAddress: normalizeWalletAddress(params.address),
    voterIdTokenId: params.voterIdTokenId,
  };
}
