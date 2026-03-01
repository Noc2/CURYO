import "dotenv/config";

export type BotRole = "submit" | "rate";

export interface BotIdentityConfig {
  keystoreAccount?: string;
  keystorePassword?: string;
  privateKey?: `0x${string}`;
}

export const config = {
  // Network
  rpcUrl: process.env.RPC_URL || "https://forno.celo-sepolia.celo-testnet.org",
  chainId: parseInt(process.env.CHAIN_ID || "11142220"),

  // Contracts (env override with Celo Sepolia fallbacks)
  contracts: {
    crepToken: (process.env.CREP_TOKEN_ADDRESS || "0x82ab8d0f060bA7eEE8611aB6fd1c1901db49C70E") as `0x${string}`,
    contentRegistry: (process.env.CONTENT_REGISTRY_ADDRESS || "0xD414e85c03336f3A0d38E9De5484f119798d6cEB") as `0x${string}`,
    votingEngine: (process.env.VOTING_ENGINE_ADDRESS || "0x326BfA5E83f0208F9522b2A4445c06F9Af401EfD") as `0x${string}`,
    voterIdNFT: (process.env.VOTER_ID_NFT_ADDRESS || "0xfE9a781216D615f7e68E35F6A3c64D59Cd0346AA") as `0x${string}`,
    categoryRegistry: (process.env.CATEGORY_REGISTRY_ADDRESS || "0xce8E381c80948a36a15fa1BbE3fd7d2c2447837f") as `0x${string}`,
  },

  // Bot identities
  submitBot: {
    keystoreAccount: process.env.SUBMIT_KEYSTORE_ACCOUNT,
    keystorePassword: process.env.SUBMIT_KEYSTORE_PASSWORD,
    privateKey: process.env.SUBMIT_PRIVATE_KEY as `0x${string}` | undefined,
  } satisfies BotIdentityConfig,

  rateBot: {
    keystoreAccount: process.env.RATE_KEYSTORE_ACCOUNT,
    keystorePassword: process.env.RATE_KEYSTORE_PASSWORD,
    privateKey: process.env.RATE_PRIVATE_KEY as `0x${string}` | undefined,
  } satisfies BotIdentityConfig,

  // Ponder
  ponderUrl: process.env.PONDER_URL || "http://localhost:42069",

  // External APIs
  tmdbApiKey: process.env.TMDB_API_KEY,
  youtubeApiKey: process.env.YOUTUBE_API_KEY,
  twitchClientId: process.env.TWITCH_CLIENT_ID,
  twitchClientSecret: process.env.TWITCH_CLIENT_SECRET,
  rawgApiKey: process.env.RAWG_API_KEY,

  // Voting
  voteStake: BigInt(process.env.VOTE_STAKE || "1000000"), // 1 cREP default
  voteThreshold: parseFloat(process.env.VOTE_THRESHOLD || "5.0"),
  // Limits
  maxVotesPerRun: parseInt(process.env.MAX_VOTES_PER_RUN || "10"),
  maxSubmissionsPerRun: parseInt(process.env.MAX_SUBMISSIONS_PER_RUN || "5"),
  maxSubmissionsPerCategory: parseInt(process.env.MAX_SUBMISSIONS_PER_CATEGORY || "3"),
};

export function getIdentityConfig(role: BotRole): BotIdentityConfig {
  return role === "submit" ? config.submitBot : config.rateBot;
}

/** Validate required config for a given bot role. Call at startup. */
export function validateConfig(role: BotRole): void {
  const errors: string[] = [];

  if (!config.contracts.votingEngine) errors.push("VOTING_ENGINE_ADDRESS is required");
  if (!config.contracts.contentRegistry) errors.push("CONTENT_REGISTRY_ADDRESS is required");
  if (!config.ponderUrl) errors.push("PONDER_URL is required");

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
