/**
 * Curyo Keeper — standalone stateless round settlement service.
 *
 * Iterates on-chain content, calls trySettle() for active rounds,
 * cancels expired rounds, and sweeps dormant content.
 *
 * Usage:
 *   npx tsx src/index.ts        # one-shot start
 *   npx tsx watch src/index.ts  # restart on file changes (dev)
 */
import { config } from "./config.js";
import { createLogger } from "./logger.js";
import { publicClient, getWalletClient, getAccount, chain } from "./client.js";
import { resolveRounds } from "./keeper.js";
import {
  startMetricsServer,
  setHealthThreshold,
  recordRun,
  recordError,
  setGauge,
  getConsecutiveErrors,
} from "./metrics.js";

const logger = createLogger(config.logFormat);

// --- Validate required config ---
function validateConfig() {
  if (!config.contracts.votingEngine) {
    logger.error("VOTING_ENGINE_ADDRESS is required");
    process.exit(1);
  }
  if (!config.contracts.contentRegistry) {
    logger.error("CONTENT_REGISTRY_ADDRESS is required");
    process.exit(1);
  }
}

async function main() {
  validateConfig();

  const account = getAccount();
  logger.info("Keeper starting", {
    chain: config.chainName,
    chainId: config.chainId,
    account: account.address,
    intervalMs: config.intervalMs,
    metricsEnabled: config.metricsEnabled,
  });

  const walletClient = getWalletClient();

  // Start metrics server
  let metricsServer: ReturnType<typeof startMetricsServer> | undefined;
  if (config.metricsEnabled) {
    setHealthThreshold(config.intervalMs);
    metricsServer = startMetricsServer(config.metricsPort);
    logger.info("Metrics server started", {
      port: config.metricsPort,
      endpoints: ["/metrics", "/health"],
    });
  }

  // Startup jitter for redundancy staggering
  if (config.startupJitterMs > 0) {
    const jitter = Math.floor(Math.random() * config.startupJitterMs);
    logger.info("Startup jitter", { delayMs: jitter });
    await new Promise(r => setTimeout(r, jitter));
  }

  // --- Run loop ---
  let isRunning = false;

  async function tick() {
    if (isRunning) return;
    isRunning = true;
    setGauge("keeper_is_running", 1);
    const start = Date.now();

    try {
      const result = await resolveRounds(publicClient, walletClient, chain, account, logger);
      const duration = Date.now() - start;
      recordRun(result, duration);

      // Log summary only when something happened
      const total =
        result.roundsSettled +
        result.roundsCancelled +
        result.contentMarkedDormant;
      if (total > 0) {
        logger.info("Run complete", { ...result, durationMs: duration });
      }
    } catch (err: any) {
      recordError();
      logger.error("Run failed", {
        error: err.message,
        consecutiveErrors: getConsecutiveErrors(),
      });
    } finally {
      isRunning = false;
      setGauge("keeper_is_running", 0);
    }
  }

  // Initial run
  await tick();

  // Interval
  const intervalId = setInterval(tick, config.intervalMs);

  // Graceful shutdown
  function shutdown(signal: string) {
    logger.info("Shutting down", { signal });
    clearInterval(intervalId);
    metricsServer?.close();
    process.exit(0);
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch(err => {
  logger.error("Fatal error", { error: err.message });
  process.exit(1);
});
