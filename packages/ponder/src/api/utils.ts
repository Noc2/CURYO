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
  return isNaN(parsed) || parsed < 0 ? 0 : parsed;
}

/** Validate Ethereum address format (0x + 40 hex chars). */
export function isValidAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/i.test(value);
}
