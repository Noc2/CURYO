import { config as loadDotenv } from "dotenv";
import { isAddress } from "viem";

loadDotenv({ path: ".env.local", override: false });
loadDotenv();

const CHAIN_NAMES: Record<number, string> = {
  31337: "Foundry",
  11142220: "Celo Sepolia",
  42220: "Celo",
};

const isProduction = process.env.NODE_ENV === "production";

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function requireUrlEnv(name: string, errors: string[]): string {
  const value = readEnv(name);
  if (!value) {
    errors.push(`${name} is required`);
    return "";
  }

  try {
    const url = new URL(value);
    const isLocalhost =
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "::1";

    if (isProduction && isLocalhost) {
      errors.push(`${name} must not point to localhost in production`);
    }
  } catch {
    errors.push(`${name} must be a valid URL`);
  }

  return value;
}

function requireIntEnv(name: string, errors: string[]): number {
  const value = readEnv(name);
  if (!value) {
    errors.push(`${name} is required`);
    return 0;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    errors.push(`${name} must be a positive integer`);
    return 0;
  }

  return parsed;
}

function requireAddressEnv(name: string, errors: string[]): `0x${string}` {
  const value = readEnv(name);
  if (!value) {
    errors.push(`${name} is required`);
    return "0x0000000000000000000000000000000000000000";
  }

  if (!isAddress(value)) {
    errors.push(`${name} must be a valid address`);
    return "0x0000000000000000000000000000000000000000";
  }

  return value as `0x${string}`;
}

function loadConfig() {
  const errors: string[] = [];
  const chainId = requireIntEnv("CHAIN_ID", errors);
  const keystoreAccount = readEnv("KEYSTORE_ACCOUNT");
  const privateKey = readEnv("KEEPER_PRIVATE_KEY") as `0x${string}` | undefined;

  if (!keystoreAccount && !privateKey) {
    errors.push("KEYSTORE_ACCOUNT or KEEPER_PRIVATE_KEY is required");
  }

  const loadedConfig = {
    // Network
    rpcUrl: requireUrlEnv("RPC_URL", errors),
    chainId,
    chainName: readEnv("CHAIN_NAME") || CHAIN_NAMES[chainId] || `Chain ${chainId}`,

    // Contracts
    contracts: {
      votingEngine: requireAddressEnv("VOTING_ENGINE_ADDRESS", errors),
      contentRegistry: requireAddressEnv("CONTENT_REGISTRY_ADDRESS", errors),
    },

    // Wallet
    keystoreAccount,
    keystorePassword: process.env.KEYSTORE_PASSWORD,
    privateKey,

    // Keeper behavior
    intervalMs: Number.parseInt(process.env.KEEPER_INTERVAL_MS || "30000", 10),
    startupJitterMs: Number.parseInt(process.env.KEEPER_STARTUP_JITTER_MS || "0", 10),

    // Tuning
    dormancyPeriod: BigInt(process.env.DORMANCY_PERIOD || String(30 * 24 * 60 * 60)),

    // Monitoring
    metricsPort: Number.parseInt(process.env.METRICS_PORT || "9090", 10),
    metricsEnabled: process.env.METRICS_ENABLED !== "false",

    // Logging
    logFormat: (process.env.LOG_FORMAT || "json") as "json" | "text",
  };

  if (errors.length > 0) {
    throw new Error(`Invalid keeper configuration:\n- ${errors.join("\n- ")}`);
  }

  return loadedConfig;
}

export const config = loadConfig();
