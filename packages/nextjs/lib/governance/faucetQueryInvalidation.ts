import type { QueryKey } from "@tanstack/react-query";
import { FREE_TRANSACTION_ALLOWANCE_QUERY_KEY } from "~~/hooks/useFreeTransactionAllowance";

const FAUCET_REFRESH_READ_FUNCTIONS = new Set(["balanceOf", "hasClaimed", "hasVoterId", "getTokenId"]);

function normalizeAddress(value: unknown): string | null {
  return typeof value === "string" ? value.toLowerCase() : null;
}

export function shouldRefreshAfterFaucetClaim(queryKey: QueryKey, address?: string): boolean {
  const normalizedAddress = normalizeAddress(address);
  if (!normalizedAddress || queryKey.length === 0) {
    return false;
  }

  const [scope, params] = queryKey;

  if (scope === FREE_TRANSACTION_ALLOWANCE_QUERY_KEY[0]) {
    return normalizeAddress(queryKey[1]) === normalizedAddress;
  }

  if (scope === "wallet-hrep-balance") {
    return normalizeAddress(queryKey[1]) === normalizedAddress;
  }

  if (!Array.isArray(queryKey) || scope !== "readContract" || typeof params !== "object" || params === null) {
    return false;
  }

  const functionName =
    "functionName" in params && typeof params.functionName === "string" ? params.functionName : undefined;
  const args = "args" in params && Array.isArray(params.args) ? params.args : [];

  return Boolean(
    functionName && FAUCET_REFRESH_READ_FUNCTIONS.has(functionName) && normalizeAddress(args[0]) === normalizedAddress,
  );
}
