import { getAddress } from "viem";
import { getFreeTransactionLimit, getServerEnvironmentScope } from "~~/lib/env/server";

type ErrorWithCause = Error & {
  code?: string;
  cause?: unknown;
};

export function isFreeTransactionStoreUnavailableError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as ErrorWithCause;
  if (
    candidate.code === "28000" ||
    candidate.code === "ECONNREFUSED" ||
    candidate.code === "EPERM" ||
    candidate.code === "ETIMEDOUT" ||
    candidate.code === "EHOSTUNREACH" ||
    candidate.code === "ENOTFOUND"
  ) {
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
    walletAddress: getAddress(params.address),
    voterIdTokenId: null,
  };
}
