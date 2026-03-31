export type CuryoFetch = typeof fetch;

export interface CuryoSdkOptions {
  chainId?: number;
  apiBaseUrl?: string;
  frontendCode?: `0x${string}`;
  fetchImpl?: CuryoFetch;
  timeoutMs?: number;
}

export interface CuryoClientConfig {
  chainId?: number;
  apiBaseUrl?: string;
  frontendCode?: `0x${string}`;
  fetchImpl: CuryoFetch;
  timeoutMs: number;
}
