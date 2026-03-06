/**
 * Curyo Keeper — standalone stateless round settlement service.
 *
 * Iterates on-chain content, reveals tlock votes and calls settleRound() for active rounds,
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

async function main() {
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
  let shuttingDown = false;

  const MIN_BALANCE = BigInt(config.minGasBalanceWei);

  async function tick() {
    if (isRunning || shuttingDown) return;
    isRunning = true;
    setGauge("keeper_is_running", 1);
    const start = Date.now();

    try {
      // Pre-flight: check wallet gas balance
      try {
        const balance = await publicClient.getBalance({ address: account.address });
        setGauge("keeper_wallet_balance_wei", Number(balance));
        if (balance < MIN_BALANCE) {
          logger.warn("Keeper wallet balance low", {
            balance: balance.toString(),
            minRequired: MIN_BALANCE.toString(),
          });
        }
      } catch (err: any) {
        logger.warn("Failed to check wallet balance", { error: err.message });
      }

      const result = await resolveRounds(publicClient, walletClient, chain, account, logger);
      const duration = Date.now() - start;
      recordRun(result, duration);

      // Log summary only when something happened
      const total =
        result.roundsSettled +
        result.roundsCancelled +
        result.votesRevealed +
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

  // Graceful shutdown — wait for in-flight tick to finish
  const SHUTDOWN_TIMEOUT_MS = 30_000;

  async function shutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info("Shutting down", { signal });
    clearInterval(intervalId);

    if (isRunning) {
      logger.info("Waiting for in-flight tick to complete...");
      const deadline = Date.now() + SHUTDOWN_TIMEOUT_MS;
      while (isRunning && Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 500));
      }
      if (isRunning) {
        logger.warn("Shutdown timeout — forcing exit with tick still running");
      }
    }

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
