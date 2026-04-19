import "dotenv/config";
import { getSharedDeploymentAddress as getSharedArtifactAddress } from "@curyo/contracts/deployments";
import { isAddress } from "viem";
import type { BotRoundConfigOverrides } from "./roundConfig.js";

export type BotRole = "submit" | "rate";

export interface BotIdentityConfig {
  keystoreAccount?: string;
  keystorePassword?: string;
  privateKey?: `0x${string}`;
}

export type SubmissionRewardAsset = "crep" | "usdc";

export interface BotX402Config {
  apiUrl?: string;
  maxPaymentUsdc?: bigint;
  thirdwebClientId?: string;
  usdcTokenAddress?: `0x${string}`;
}

const CONTRACT_ENV_NAMES = {
  categoryRegistry: "CATEGORY_REGISTRY_ADDRESS",
  contentRegistry: "CONTENT_REGISTRY_ADDRESS",
  crepToken: "CREP_TOKEN_ADDRESS",
  questionRewardPoolEscrow: "QUESTION_REWARD_POOL_ESCROW_ADDRESS",
  roundRewardDistributor: "ROUND_REWARD_DISTRIBUTOR_ADDRESS",
  voterIdNFT: "VOTER_ID_NFT_ADDRESS",
  votingEngine: "VOTING_ENGINE_ADDRESS",
} as const;

export type BotContractKey = keyof typeof CONTRACT_ENV_NAMES;

const REQUIRED_CONTRACTS_BY_ROLE: Record<BotRole, BotContractKey[]> = {
  submit: ["crepToken", "contentRegistry", "questionRewardPoolEscrow"],
  rate: ["crepToken", "votingEngine", "voterIdNFT"],
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

function readOptionalUrlEnv(name: string, errors: string[]): string | undefined {
  const value = readEnv(name);
  if (!value) {
    return undefined;
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

function requirePositiveIntegerEnv(name: string, errors: string[]): number {
  const value = readEnv(name);
  if (!value) {
    errors.push(`${name} is required`);
    return 0;
  }

  if (!/^\d+$/.test(value)) {
    errors.push(`${name} must be a positive integer`);
    return 0;
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    errors.push(`${name} must be a positive integer`);
    return 0;
  }

  return parsed;
}

function parsePositiveNumberEnv(name: string, fallback: number, errors: string[]): number {
  const value = readEnv(name);
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    errors.push(`${name} must be a finite positive number`);
    return fallback;
  }

  return parsed;
}

function parseOptionalPositiveIntegerEnv(name: string, fallback: number, errors: string[]): number {
  const value = readEnv(name);
  if (!value) {
    return fallback;
  }

  if (!/^\d+$/.test(value)) {
    errors.push(`${name} must be a positive integer`);
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    errors.push(`${name} must be a positive integer`);
    return fallback;
  }

  return parsed;
}

function parsePositiveBigIntEnv(name: string, fallback: bigint, errors: string[]): bigint {
  const value = readEnv(name);
  if (!value) {
    return fallback;
  }

  if (!/^\d+$/.test(value)) {
    errors.push(`${name} must be a positive integer`);
    return fallback;
  }

  const parsed = BigInt(value);
  if (parsed <= 0n) {
    errors.push(`${name} must be a positive integer`);
    return fallback;
  }

  return parsed;
}

function parseNonNegativeBigIntEnv(name: string, fallback: bigint, errors: string[]): bigint {
  const value = readEnv(name);
  if (!value) {
    return fallback;
  }

  if (!/^\d+$/.test(value)) {
    errors.push(`${name} must be a non-negative integer`);
    return fallback;
  }

  const parsed = BigInt(value);
  if (parsed < 0n) {
    errors.push(`${name} must be a non-negative integer`);
    return fallback;
  }

  return parsed;
}

function parseOptionalPositiveBigIntEnv(name: string, errors: string[]): bigint | undefined {
  const value = readEnv(name);
  if (!value) {
    return undefined;
  }

  if (!/^\d+$/.test(value)) {
    errors.push(`${name} must be a positive integer`);
    return undefined;
  }

  const parsed = BigInt(value);
  if (parsed <= 0n) {
    errors.push(`${name} must be a positive integer`);
    return undefined;
  }

  return parsed;
}

function parseSubmissionRewardAssetEnv(name: string, fallback: SubmissionRewardAsset, errors: string[]) {
  const value = readEnv(name)?.toLowerCase();
  if (!value) {
    return fallback;
  }

  if (value !== "crep" && value !== "usdc") {
    errors.push(`${name} must be either "crep" or "usdc"`);
    return fallback;
  }

  return value;
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

function resolveOptionalContractAddress(params: {
  chainId: number;
  envName: string;
  contractName: string;
  errors: string[];
  warnings: string[];
}): `0x${string}` | undefined {
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

  return readOptionalAddressEnv(envName, errors);
}

function loadConfig() {
  const errors: string[] = [];
  const warnings: string[] = [];
  const chainId = requirePositiveIntegerEnv("CHAIN_ID", errors);

  const loadedConfig = {
    // Network
    rpcUrl: requireUrlEnv("RPC_URL", errors),
    chainId,

    // Contracts
    contracts: {
      crepToken: resolveOptionalContractAddress({
        chainId,
        envName: "CREP_TOKEN_ADDRESS",
        contractName: "CuryoReputation",
        errors,
        warnings,
      }),
      contentRegistry: resolveOptionalContractAddress({
        chainId,
        envName: "CONTENT_REGISTRY_ADDRESS",
        contractName: "ContentRegistry",
        errors,
        warnings,
      }),
      questionRewardPoolEscrow: resolveOptionalContractAddress({
        chainId,
        envName: "QUESTION_REWARD_POOL_ESCROW_ADDRESS",
        contractName: "QuestionRewardPoolEscrow",
        errors,
        warnings,
      }),
      votingEngine: resolveOptionalContractAddress({
        chainId,
        envName: "VOTING_ENGINE_ADDRESS",
        contractName: "RoundVotingEngine",
        errors,
        warnings,
      }),
      roundRewardDistributor: resolveOptionalContractAddress({
        chainId,
        envName: "ROUND_REWARD_DISTRIBUTOR_ADDRESS",
        contractName: "RoundRewardDistributor",
        errors,
        warnings,
      }),
      voterIdNFT: resolveOptionalContractAddress({
        chainId,
        envName: "VOTER_ID_NFT_ADDRESS",
        contractName: "VoterIdNFT",
        errors,
        warnings,
      }),
      categoryRegistry: resolveOptionalContractAddress({
        chainId,
        envName: "CATEGORY_REGISTRY_ADDRESS",
        contractName: "CategoryRegistry",
        errors,
        warnings,
      }),
    },

    // Bot identities
    submitBot: {
      keystoreAccount: readEnv("SUBMIT_KEYSTORE_ACCOUNT"),
      keystorePassword: process.env.SUBMIT_KEYSTORE_PASSWORD,
      privateKey: readEnv("SUBMIT_PRIVATE_KEY") as `0x${string}` | undefined,
    } satisfies BotIdentityConfig,

    rateBot: {
      keystoreAccount: readEnv("RATE_KEYSTORE_ACCOUNT"),
      keystorePassword: process.env.RATE_KEYSTORE_PASSWORD,
      privateKey: readEnv("RATE_PRIVATE_KEY") as `0x${string}` | undefined,
    } satisfies BotIdentityConfig,

    // Ponder
    ponderUrl: readOptionalUrlEnv("PONDER_URL", errors),

    // External APIs
    youtubeApiKey: readEnv("YOUTUBE_API_KEY"),

    // Voting
    voteStake: parsePositiveBigIntEnv("VOTE_STAKE", 1000000n, errors),
    voteThreshold: parsePositiveNumberEnv("VOTE_THRESHOLD", 5.0, errors),
    voteFrontendAddress: readOptionalAddressEnv("RATE_FRONTEND_ADDRESS", errors),
    // Limits
    maxVotesPerRun: parseOptionalPositiveIntegerEnv("MAX_VOTES_PER_RUN", 10, errors),
    maxSubmissionsPerRun: parseOptionalPositiveIntegerEnv("MAX_SUBMISSIONS_PER_RUN", 5, errors),
    maxSubmissionsPerCategory: parseOptionalPositiveIntegerEnv("MAX_SUBMISSIONS_PER_CATEGORY", 3, errors),
    submitRewardAsset: parseSubmissionRewardAssetEnv("SUBMIT_REWARD_ASSET", "usdc", errors),
    submitRewardRequiredVoters: parseOptionalPositiveIntegerEnv("SUBMIT_REWARD_REQUIRED_VOTERS", 3, errors),
    submitRewardRequiredSettledRounds: parseOptionalPositiveIntegerEnv(
      "SUBMIT_REWARD_REQUIRED_SETTLED_ROUNDS",
      1,
      errors,
    ),
    submitRewardPoolExpiresAt: parseNonNegativeBigIntEnv("SUBMIT_REWARD_POOL_EXPIRES_AT", 0n, errors),
    submitRoundConfig: {
      epochDuration: parseOptionalPositiveBigIntEnv("SUBMIT_ROUND_BLIND_PHASE_SECONDS", errors),
      maxDuration: parseOptionalPositiveBigIntEnv("SUBMIT_ROUND_MAX_DURATION_SECONDS", errors),
      minVoters: parseOptionalPositiveBigIntEnv("SUBMIT_ROUND_MIN_VOTERS", errors),
      maxVoters: parseOptionalPositiveBigIntEnv("SUBMIT_ROUND_MAX_VOTERS", errors),
    } satisfies BotRoundConfigOverrides,
    x402: {
      apiUrl: readOptionalUrlEnv("X402_API_URL", errors),
      maxPaymentUsdc: parseOptionalPositiveBigIntEnv("X402_MAX_PAYMENT_USDC", errors),
      thirdwebClientId: readEnv("THIRDWEB_CLIENT_ID") ?? readEnv("NEXT_PUBLIC_THIRDWEB_CLIENT_ID"),
      usdcTokenAddress: readOptionalAddressEnv("X402_USDC_TOKEN_ADDRESS", errors),
    } satisfies BotX402Config,
  };

  if (errors.length > 0) {
    throw new Error(`Invalid bot configuration:\n- ${errors.join("\n- ")}`);
  }

  for (const warning of warnings) {
    console.warn(`[Bot] WARN: ${warning}`);
  }

  if (!loadedConfig.youtubeApiKey) {
    console.warn("[Bot] WARN: YOUTUBE_API_KEY is not configured — submit and rating sources will return no items");
  }

  return loadedConfig;
}

export const config = loadConfig();

export function getIdentityConfig(role: BotRole): BotIdentityConfig {
  return role === "submit" ? config.submitBot : config.rateBot;
}

export function getRequiredContractKeys(role: BotRole): readonly BotContractKey[] {
  return REQUIRED_CONTRACTS_BY_ROLE[role];
}

export function getContractEnvName(contractKey: BotContractKey): string {
  return CONTRACT_ENV_NAMES[contractKey];
}

/** Validate required config for a given bot role. Call at startup. */
export function validateConfig(role: BotRole): void {
  const errors: string[] = [];

  const identity = getIdentityConfig(role);
  if (!identity.keystoreAccount && !identity.privateKey) {
    const prefix = role === "submit" ? "SUBMIT" : "RATE";
    errors.push(`${prefix}_KEYSTORE_ACCOUNT or ${prefix}_PRIVATE_KEY is required`);
  }

  if (role === "rate" && !config.ponderUrl) {
    errors.push("PONDER_URL is required");
  }

  for (const contractKey of getRequiredContractKeys(role)) {
    if (!config.contracts[contractKey]) {
      errors.push(`${getContractEnvName(contractKey)} is required`);
    }
  }

  if (errors.length > 0) {
    errors.forEach(e => log.error(e));
    process.exit(1);
  }
}

export const log = {
  info: (msg: string) => console.log(`[Bot] ${msg}`),
  warn: (msg: string) => console.warn(`[Bot] WARN: ${msg}`),
  error: (msg: string) => console.error(`[Bot] ERROR: ${msg}`),
  debug: (msg: string) => {
    if (process.env.DEBUG) console.log(`[Bot] DEBUG: ${msg}`);
  },
};
