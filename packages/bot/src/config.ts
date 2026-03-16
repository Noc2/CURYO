import "dotenv/config";
import { isAddress } from "viem";

export type BotRole = "submit" | "rate";

export interface BotIdentityConfig {
  keystoreAccount?: string;
  keystorePassword?: string;
  privateKey?: `0x${string}`;
}

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

  const loadedConfig = {
    // Network
    rpcUrl: requireUrlEnv("RPC_URL", errors),
    chainId: requireIntEnv("CHAIN_ID", errors),

    // Contracts
    contracts: {
      crepToken: requireAddressEnv("CREP_TOKEN_ADDRESS", errors),
      contentRegistry: requireAddressEnv("CONTENT_REGISTRY_ADDRESS", errors),
      votingEngine: requireAddressEnv("VOTING_ENGINE_ADDRESS", errors),
      voterIdNFT: requireAddressEnv("VOTER_ID_NFT_ADDRESS", errors),
      categoryRegistry: requireAddressEnv("CATEGORY_REGISTRY_ADDRESS", errors),
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
    ponderUrl: requireUrlEnv("PONDER_URL", errors),

    // External APIs
    tmdbApiKey: readEnv("TMDB_API_KEY"),
    youtubeApiKey: readEnv("YOUTUBE_API_KEY"),
    twitchClientId: readEnv("TWITCH_CLIENT_ID"),
    twitchClientSecret: readEnv("TWITCH_CLIENT_SECRET"),
    rawgApiKey: readEnv("RAWG_API_KEY"),

    // Voting
    voteStake: BigInt(process.env.VOTE_STAKE || "1000000"),
    voteThreshold: Number.parseFloat(process.env.VOTE_THRESHOLD || "5.0"),
    // Limits
    maxVotesPerRun: Number.parseInt(process.env.MAX_VOTES_PER_RUN || "10", 10),
    maxSubmissionsPerRun: Number.parseInt(process.env.MAX_SUBMISSIONS_PER_RUN || "5", 10),
    maxSubmissionsPerCategory: Number.parseInt(process.env.MAX_SUBMISSIONS_PER_CATEGORY || "3", 10),
  };

  if (errors.length > 0) {
    throw new Error(`Invalid bot configuration:\n- ${errors.join("\n- ")}`);
  }

  const hasApiKey =
    loadedConfig.tmdbApiKey || loadedConfig.youtubeApiKey || loadedConfig.twitchClientId || loadedConfig.rawgApiKey;
  if (!hasApiKey) {
    console.warn(
      "[Bot] WARN: No keyed content-source API keys configured — public sources still work, but some sources and rating strategies will be unavailable",
    );
  }

  return loadedConfig;
}

export const config = loadConfig();

export function getIdentityConfig(role: BotRole): BotIdentityConfig {
  return role === "submit" ? config.submitBot : config.rateBot;
}

/** Validate required config for a given bot role. Call at startup. */
export function validateConfig(role: BotRole): void {
  const errors: string[] = [];

  const identity = getIdentityConfig(role);
  if (!identity.keystoreAccount && !identity.privateKey) {
    const prefix = role === "submit" ? "SUBMIT" : "RATE";
    errors.push(`${prefix}_KEYSTORE_ACCOUNT or ${prefix}_PRIVATE_KEY is required`);
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
