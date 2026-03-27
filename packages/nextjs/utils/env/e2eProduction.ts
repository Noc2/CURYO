type E2EProductionEnv = {
  CURYO_E2E_PRODUCTION_BUILD?: string;
  NEXT_PUBLIC_CURYO_E2E_PRODUCTION_BUILD?: string;
};

const LOCALHOST_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

export function isLocalE2EProductionBuildEnabled(env: E2EProductionEnv = process.env as E2EProductionEnv): boolean {
  return env.CURYO_E2E_PRODUCTION_BUILD === "true" || env.NEXT_PUBLIC_CURYO_E2E_PRODUCTION_BUILD === "true";
}

export function isLocalE2EWalletBridgeEnabled(params: {
  hostname?: string;
  isProduction: boolean;
  localE2EProductionBuild?: boolean;
}): boolean {
  if (!params.hostname || !LOCALHOST_HOSTNAMES.has(params.hostname)) {
    return false;
  }

  return !params.isProduction || params.localE2EProductionBuild === true;
}
