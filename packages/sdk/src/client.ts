import { resolveClientConfig } from "./config";
import type { CuryoClientConfig, CuryoSdkOptions } from "./types";

export interface CuryoClient {
  config: CuryoClientConfig;
}

export function createCuryoClient(options: CuryoSdkOptions = {}): CuryoClient {
  return {
    config: resolveClientConfig(options),
  };
}
