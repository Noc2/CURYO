/**
 * Curyo Keeper — standalone stateless round settlement service.
 *
 * Iterates on-chain content, reveals tlock votes, settles or reveal-fails eligible rounds,
 * cleans up unrevealed terminal-round commits, cancels expired rounds, and sweeps dormant content.
 *
 * Usage:
 *   npx tsx src/index.ts        # start the keeper loop
 *   npx tsx watch src/index.ts  # restart on file changes (dev)
 */
import { config } from "./config.js";
import { createLogger } from "./logger.js";
import { publicClient, getWalletClient, getAccount, chain, validateKeeperConnectivity } from "./client.js";
import { resolveRounds, validateKeeperContracts } from "./keeper.js";
import { claimConfiguredFrontendFees } from "./frontend-fees.js";
import { RoundVotingEngineAbi } from "@curyo/contracts/abis";
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
    votingEngine: config.contracts.votingEngine,
    contentRegistry: config.contracts.contentRegistry,
    intervalMs: config.intervalMs,
    metricsEnabled: config.metricsEnabled,
    frontendFeesEnabled: config.frontendFees.enabled,
    frontendFeeAddress: config.frontendFees.frontendAddress ?? account.address,
  });

  await validateKeeperConnectivity(publicClient);
  await validateKeeperContracts(publicClient, config.contracts.votingEngine, config.contracts.contentRegistry);
  logger.info("Keeper contract connectivity verified");

  const walletClient = getWalletClient();

  // Start metrics server
  let metricsServer: ReturnType<typeof startMetricsServer> | undefined;
  if (config.metricsEnabled) {
    setHealthThreshold(config.intervalMs);
    metricsServer = startMetricsServer(config.metricsPort, config.metricsBindAddress);
    logger.info("Metrics server started", {
      port: config.metricsPort,
      bindAddress: config.metricsBindAddress,
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

  async function updateOperationalGauges() {
    const [balanceResult, consensusReserveResult] = await Promise.allSettled([
      publicClient.getBalance({ address: account.address }),
      publicClient.readContract({
        address: config.contracts.votingEngine,
        abi: RoundVotingEngineAbi,
        functionName: "consensusReserve",
      }),
    ]);

    if (balanceResult.status === "fulfilled") {
      const balance = balanceResult.value;
      setGauge("keeper_wallet_balance_wei", Number(balance));
      if (balance < MIN_BALANCE) {
        logger.warn("Keeper wallet balance low", {
          balance: balance.toString(),
          minRequired: MIN_BALANCE.toString(),
        });
      }
    } else {
      logger.warn("Failed to check wallet balance", { error: balanceResult.reason?.message || String(balanceResult.reason) });
    }

    if (consensusReserveResult.status === "fulfilled") {
      setGauge("keeper_consensus_reserve_wei", Number(consensusReserveResult.value));
    } else {
      logger.warn("Failed to read consensus reserve", {
        error: consensusReserveResult.reason?.message || String(consensusReserveResult.reason),
      });
    }
  }

  async function tick() {
    if (isRunning || shuttingDown) return;
    isRunning = true;
    setGauge("keeper_is_running", 1);
    const start = Date.now();

    try {
      await updateOperationalGauges();

      const result = await resolveRounds(publicClient, walletClient, chain, account, logger);
      const frontendFeeResult = config.frontendFees.enabled
        ? await claimConfiguredFrontendFees(publicClient, walletClient, chain, account, logger)
        : null;
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
      if (frontendFeeResult && (frontendFeeResult.roundsClaimed > 0 || frontendFeeResult.withdrawals > 0)) {
        logger.info("Frontend fee sweep complete", {
          frontendAddress: frontendFeeResult.frontendAddress,
          roundsClaimed: frontendFeeResult.roundsClaimed,
          withdrawals: frontendFeeResult.withdrawals,
          withdrawnAmount: frontendFeeResult.withdrawnAmount.toString(),
        });
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
