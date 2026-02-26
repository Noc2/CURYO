import "dotenv/config";

export const config = {
  // Network
  rpcUrl: process.env.RPC_URL || "https://forno.celo-sepolia.celo-testnet.org",
  chainId: parseInt(process.env.CHAIN_ID || "11142220"),
  chainName: process.env.CHAIN_NAME || "Celo Sepolia",

  // Contracts (required — validated at startup in index.ts)
  contracts: {
    votingEngine: process.env.VOTING_ENGINE_ADDRESS as `0x${string}` | undefined,
    contentRegistry: process.env.CONTENT_REGISTRY_ADDRESS as `0x${string}` | undefined,
  },

  // Wallet (keystore preferred, raw key fallback)
  keystoreAccount: process.env.KEYSTORE_ACCOUNT,
  keystorePassword: process.env.KEYSTORE_PASSWORD,
  privateKey: process.env.KEEPER_PRIVATE_KEY as `0x${string}` | undefined,

  // Keeper behavior
  intervalMs: parseInt(process.env.KEEPER_INTERVAL_MS || "30000"),
  startupJitterMs: parseInt(process.env.KEEPER_STARTUP_JITTER_MS || "0"),
  tlockMock: process.env.TLOCK_MOCK === "true",

  // Tuning
  unrevealedBatchSize: BigInt(process.env.UNREVEALED_BATCH_SIZE || "50"),
  dormancyPeriod: BigInt(process.env.DORMANCY_PERIOD || String(30 * 24 * 60 * 60)),
  roundLookback: BigInt(process.env.ROUND_LOOKBACK || "5"),

  // Monitoring
  metricsPort: parseInt(process.env.METRICS_PORT || "9090"),
  metricsEnabled: process.env.METRICS_ENABLED !== "false",

  // Logging
  logFormat: (process.env.LOG_FORMAT || "json") as "json" | "text",
};
