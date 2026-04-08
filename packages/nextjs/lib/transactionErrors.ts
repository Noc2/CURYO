function collectErrorText(value: unknown, seen: Set<unknown>, depth = 0): string[] {
  if (depth > 10) return [];
  if (value === null || value === undefined) return [];

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return [String(value)];
  }

  if (typeof value !== "object") return [];
  if (seen.has(value)) return [];
  seen.add(value);

  const parts: string[] = [];

  if (value instanceof Error) {
    parts.push(value.name, value.message);
  }

  for (const nested of Object.values(value as Record<string, unknown>)) {
    parts.push(...collectErrorText(nested, seen, depth + 1));
  }

  return parts;
}

export function isInsufficientFundsError(error: unknown) {
  const haystack = collectErrorText(error, new Set()).join(" ").toLowerCase();

  return (
    haystack.includes("insufficient funds") ||
    haystack.includes("exceeds the balance of the account") ||
    haystack.includes("gas * gas fee + value")
  );
}

export function isFreeTransactionExhaustedError(error: unknown) {
  const haystack = collectErrorText(error, new Set()).join(" ").toLowerCase();

  return (
    haystack.includes("free transactions used up") || haystack.includes("transactions are not sponsored right now")
  );
}

export function isUnsupportedRpcMethodError(error: unknown) {
  const haystack = collectErrorText(error, new Set()).join(" ").toLowerCase();

  return haystack.includes("this request method is not supported");
}

export function isWalletRpcOverloadedError(error: unknown) {
  const haystack = collectErrorText(error, new Set()).join(" ").toLowerCase();

  return (
    haystack.includes("rpc endpoint returned too many errors") ||
    haystack.includes("consider using a different rpc endpoint")
  );
}

export function getGasBalanceErrorMessage(nativeTokenSymbol: string, options?: { canSponsorTransactions?: boolean }) {
  if (options?.canSponsorTransactions) {
    return `Gas is sponsored for now. If it still fails, add some ${nativeTokenSymbol} and retry.`;
  }

  return `Add some ${nativeTokenSymbol} for gas, then retry.`;
}
