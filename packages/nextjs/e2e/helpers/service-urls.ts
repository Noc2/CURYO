export const E2E_BASE_URL = process.env.E2E_BASE_URL?.trim() || "http://localhost:3000";

export const DEFAULT_E2E_RPC_URL = "http://127.0.0.1:8545";

export function resolveE2ERpcUrl(value: string | undefined | null): string {
  return value?.trim() || DEFAULT_E2E_RPC_URL;
}

export const E2E_RPC_URL = resolveE2ERpcUrl(process.env.E2E_RPC_URL);

export const E2E_KEEPER_URL = process.env.E2E_KEEPER_URL?.trim() || "http://localhost:9090";

export const E2E_KEEPER_HEALTH_URL = new URL("/health", E2E_KEEPER_URL).toString();

export const PONDER_URL = process.env.NEXT_PUBLIC_PONDER_URL?.trim() || "http://localhost:42069";
