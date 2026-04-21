import { getSharedDeploymentAddress as getSharedArtifactAddress } from "@curyo/contracts/deployments";
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
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function parseBooleanEnv(value: string | undefined, fallback: boolean, label: string): boolean {
  if (value === undefined) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;

  throw new Error(`${label} must be a boolean-like value`);
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

  return parseIntegerEnv(name, value, "positive", 0, errors);
}

function readPositiveIntEnv(name: string, fallback: string, errors: string[]): number {
  const value = readEnv(name) || fallback;
  return parseIntegerEnv(name, value, "positive", Number(fallback), errors);
}

function readNonNegativeIntEnv(name: string, fallback: string, errors: string[]): number {
  const value = readEnv(name) || fallback;
  return parseIntegerEnv(name, value, "non-negative", Number(fallback), errors);
}

function parseIntegerEnv(
  name: string,
  value: string,
  kind: "positive" | "non-negative",
  fallback: number,
  errors: string[],
): number {
  const parsed = Number(value);
  const isValidInteger = /^\d+$/.test(value) && Number.isSafeInteger(parsed);
  const isValidRange = kind === "positive" ? parsed > 0 : parsed >= 0;

  if (!isValidInteger || !isValidRange) {
    errors.push(`${name} must be a ${kind} integer`);
    return fallback;
  }

  return parsed;
}

function readPositiveBigIntEnv(name: string, fallback: string, errors: string[]): bigint {
  return BigInt(readBigIntStringEnv(name, fallback, "positive", errors));
}

function readNonNegativeBigIntStringEnv(name: string, fallback: string, errors: string[]): string {
  return readBigIntStringEnv(name, fallback, "non-negative", errors);
}

function readBigIntStringEnv(
  name: string,
  fallback: string,
  kind: "positive" | "non-negative",
  errors: string[],
): string {
  const value = readEnv(name) || fallback;
  const isValidInteger = /^\d+$/.test(value);
  const parsed = isValidInteger ? BigInt(value) : null;
  const isValidRange = parsed !== null && (kind === "positive" ? parsed > 0n : parsed >= 0n);

  if (!isValidInteger || !isValidRange) {
    errors.push(`${name} must be a ${kind} integer`);
    return fallback;
  }

  return value;
}

function requireAddressEnv(name: string, errors: string[]): `0x${string}` {
  const value = readEnv(name);
  if (!value) {
    errors.push(`${name} is required`);
    return ZERO_ADDRESS;
  }

  if (!isAddress(value)) {
    errors.push(`${name} must be a valid address`);
    return ZERO_ADDRESS;
  }

  return value as `0x${string}`;
}

function readOptionalAddressEnv(name: string, errors: string[]): `0x${string}` | undefined {
  const value = readEnv(name);
  if (!value) {
    return undefined;
  }

  if (!isAddress(value)) {
    errors.push(`${name} must be a valid address`);
    return undefined;
  }

  return value as `0x${string}`;
}

function resolveContractAddress(params: {
  chainId: number;
  envName: string;
  contractName: string;
  errors: string[];
  warnings: string[];
}): `0x${string}` {
  const { chainId, envName, contractName, errors, warnings } = params;
  const sharedAddress = getSharedArtifactAddress(chainId, contractName);
  const envValue = readEnv(envName);

  if (sharedAddress) {
    if (envValue) {
      if (isAddress(envValue)) {
        if (envValue.toLowerCase() !== sharedAddress.toLowerCase()) {
          warnings.push(
            `Ignoring ${envName}=${envValue} for chain ${chainId}; using ${contractName} from shared deployment artifacts (${sharedAddress}).`,
          );
        }
      } else {
        warnings.push(
          `Ignoring invalid ${envName} value for chain ${chainId}; using ${contractName} from shared deployment artifacts (${sharedAddress}).`,
        );
      }
    }

    return sharedAddress;
  }

  return requireAddressEnv(envName, errors);
}

function loadConfig() {
  const errors: string[] = [];
  const warnings: string[] = [];
  const chainId = requireIntEnv("CHAIN_ID", errors);
  const keystoreAccount = readEnv("KEYSTORE_ACCOUNT");
  const privateKey = readEnv("KEEPER_PRIVATE_KEY") as `0x${string}` | undefined;
  const frontendFeeEnabled = parseBooleanEnv(readEnv("KEEPER_FRONTEND_FEE_ENABLED"), false, "KEEPER_FRONTEND_FEE_ENABLED");

  if (!keystoreAccount && !privateKey) {
    errors.push("KEYSTORE_ACCOUNT or KEEPER_PRIVATE_KEY is required");
  }

  const frontendFeeContracts =
    frontendFeeEnabled && chainId > 0
      ? {
          roundRewardDistributor: resolveContractAddress({
            chainId,
            envName: "ROUND_REWARD_DISTRIBUTOR_ADDRESS",
            contractName: "RoundRewardDistributor",
            errors,
            warnings,
          }),
          frontendRegistry: resolveContractAddress({
            chainId,
            envName: "FRONTEND_REGISTRY_ADDRESS",
            contractName: "FrontendRegistry",
            errors,
            warnings,
          }),
        }
      : null;

  const loadedConfig = {
    // Network
    rpcUrl: requireUrlEnv("RPC_URL", errors),
    chainId,
    chainName: readEnv("CHAIN_NAME") || CHAIN_NAMES[chainId] || `Chain ${chainId}`,

    // Contracts
    contracts: {
      votingEngine: resolveContractAddress({
        chainId,
        envName: "VOTING_ENGINE_ADDRESS",
        contractName: "RoundVotingEngine",
        errors,
        warnings,
      }),
      contentRegistry: resolveContractAddress({
        chainId,
        envName: "CONTENT_REGISTRY_ADDRESS",
        contractName: "ContentRegistry",
        errors,
        warnings,
      }),
    },

    // Wallet
    keystoreAccount,
    keystorePassword: process.env.KEYSTORE_PASSWORD,
    privateKey,

    // Keeper behavior
    intervalMs: readPositiveIntEnv("KEEPER_INTERVAL_MS", "30000", errors),
    startupJitterMs: readNonNegativeIntEnv("KEEPER_STARTUP_JITTER_MS", "0", errors),
    cleanupBatchSize: readPositiveIntEnv("KEEPER_CLEANUP_BATCH_SIZE", "25", errors),

    // Tuning
    dormancyPeriod: readPositiveBigIntEnv("DORMANCY_PERIOD", String(30 * 24 * 60 * 60), errors),
    minGasBalanceWei: readNonNegativeBigIntStringEnv("MIN_GAS_BALANCE_WEI", "10000000000000000", errors), // 0.01 CELO
    maxGasPerTx: readPositiveIntEnv("MAX_GAS_PER_TX", "2000000", errors),

    // Monitoring
    metricsPort: readPositiveIntEnv("METRICS_PORT", "9090", errors),
    metricsBindAddress: readEnv("METRICS_BIND_ADDRESS") || "127.0.0.1",
    metricsEnabled: process.env.METRICS_ENABLED !== "false",

    // Logging
    logFormat: (process.env.LOG_FORMAT || "json") as "json" | "text",

    // Hosted MCP frontend-fee ops
    frontendFees: {
      enabled: frontendFeeEnabled,
      frontendAddress: readOptionalAddressEnv("KEEPER_FRONTEND_ADDRESS", errors),
      lookbackRounds: readPositiveIntEnv("KEEPER_FRONTEND_FEE_LOOKBACK_ROUNDS", "8", errors),
      withdrawEnabled: parseBooleanEnv(readEnv("KEEPER_FRONTEND_FEE_WITHDRAW"), true, "KEEPER_FRONTEND_FEE_WITHDRAW"),
      contracts: frontendFeeContracts,
    },
  };

  if (errors.length > 0) {
    throw new Error(`Invalid keeper configuration:\n- ${errors.join("\n- ")}`);
  }

  for (const warning of warnings) {
    console.warn(`[keeper config] ${warning}`);
  }

  return loadedConfig;
}

export const config = loadConfig();
