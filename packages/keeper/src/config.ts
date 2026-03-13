import deployedContracts from "@curyo/contracts/deployedContracts";
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
const sharedDeployments = deployedContracts as Record<number, Record<string, { address?: string }>>;

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

function readPositiveIntEnv(name: string, fallback: string, errors: string[]): number {
  const value = readEnv(name) || fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    errors.push(`${name} must be a positive integer`);
    return Number.parseInt(fallback, 10);
  }

  return parsed;
}

function readNonNegativeIntEnv(name: string, fallback: string, errors: string[]): number {
  const value = readEnv(name) || fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    errors.push(`${name} must be a non-negative integer`);
    return Number.parseInt(fallback, 10);
  }

  return parsed;
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

function getSharedDeploymentAddress(chainId: number, contractName: string): `0x${string}` | undefined {
  const address = sharedDeployments[chainId]?.[contractName]?.address;
  if (!address || !isAddress(address)) {
    return undefined;
  }

  return address as `0x${string}`;
}

function resolveContractAddress(params: {
  chainId: number;
  envName: string;
  contractName: string;
  errors: string[];
  warnings: string[];
}): `0x${string}` {
  const { chainId, envName, contractName, errors, warnings } = params;
  const sharedAddress = getSharedDeploymentAddress(chainId, contractName);
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
    dormancyPeriod: BigInt(process.env.DORMANCY_PERIOD || String(30 * 24 * 60 * 60)),
    minGasBalanceWei: process.env.MIN_GAS_BALANCE_WEI || "10000000000000000", // 0.01 CELO
    maxGasPerTx: readPositiveIntEnv("MAX_GAS_PER_TX", "2000000", errors),

    // Monitoring
    metricsPort: Number.parseInt(process.env.METRICS_PORT || "9090", 10),
    metricsBindAddress: readEnv("METRICS_BIND_ADDRESS") || "127.0.0.1",
    metricsEnabled: process.env.METRICS_ENABLED !== "false",

    // Logging
    logFormat: (process.env.LOG_FORMAT || "json") as "json" | "text",
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
