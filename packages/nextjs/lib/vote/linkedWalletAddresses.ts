import { ZERO_ADDRESS } from "~~/utils/scaffold-eth/common";

export function normalizeLinkedWalletAddress(address?: string | null): string | null {
  const trimmed = address?.trim();
  if (!trimmed) return null;

  const normalized = trimmed.toLowerCase();
  if (normalized === ZERO_ADDRESS.toLowerCase()) {
    return null;
  }

  return normalized;
}

export function buildLinkedWalletAddresses(...addresses: Array<string | null | undefined>): string[] {
  const values = new Set<string>();

  for (const address of addresses) {
    const normalized = normalizeLinkedWalletAddress(address);
    if (normalized) {
      values.add(normalized);
    }
  }

  return Array.from(values);
}
