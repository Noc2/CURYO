import { resolveClientConfig } from "./config";
import { createCuryoReadClient, type CuryoReadClient } from "./read";
import type { CuryoClientConfig, CuryoSdkOptions } from "./types";

export interface CuryoClient {
  config: CuryoClientConfig;
  read: CuryoReadClient;
}

export function createCuryoClient(options: CuryoSdkOptions = {}): CuryoClient {
  const config = resolveClientConfig(options);

  return {
    config,
    read: createCuryoReadClient(config),
  };
}
