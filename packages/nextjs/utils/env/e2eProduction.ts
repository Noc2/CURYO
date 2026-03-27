type E2EProductionEnv = {
  CURYO_E2E_PRODUCTION_BUILD?: string;
  NEXT_PUBLIC_CURYO_E2E_PRODUCTION_BUILD?: string;
};

export function isLocalE2EProductionBuildEnabled(env: E2EProductionEnv = process.env as E2EProductionEnv): boolean {
  return env.CURYO_E2E_PRODUCTION_BUILD === "true" || env.NEXT_PUBLIC_CURYO_E2E_PRODUCTION_BUILD === "true";
}
