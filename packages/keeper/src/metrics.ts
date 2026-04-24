/**
 * Prometheus-compatible metrics endpoint and health check.
 * Uses only Node.js builtins — no external dependencies.
 */
import { createServer, type IncomingMessage, type ServerResponse, type Server } from "http";
import type { KeeperResult } from "./keeper.js";

// --- Counters ---
const counters: Record<string, number> = {
  keeper_rounds_settled_total: 0,
  keeper_rounds_cancelled_total: 0,
  keeper_rounds_reveal_failed_finalized_total: 0,
  keeper_votes_revealed_total: 0,
  keeper_unrevealed_cleanup_batches_total: 0,
  keeper_content_marked_dormant_total: 0,
  keeper_runs_total: 0,
  keeper_errors_total: 0,
  keeper_decrypt_failures_total: 0,
};

// --- Gauges ---
const gauges: Record<string, number> = {
  keeper_last_run_duration_seconds: 0,
  keeper_last_successful_run_timestamp: 0,
  keeper_is_running: 0,
  keeper_wallet_balance_wei: 0,
  keeper_consensus_reserve_wei: 0,
};

const startTime = Date.now();
let consecutiveErrors = 0;
let lastRunTime: Date | null = null;
let healthThresholdMs = 90_000; // 3x default 30s interval

export function setHealthThreshold(intervalMs: number) {
  healthThresholdMs = intervalMs * 3;
}

export function incrementCounter(name: string, amount = 1) {
  if (name in counters) {
    counters[name] += amount;
  }
}

export function setGauge(name: string, value: number) {
  if (name in gauges) {
    gauges[name] = value;
  }
}

export function getConsecutiveErrors(): number {
  return consecutiveErrors;
}

/** Record the result of a keeper run. */
export function recordRun(result: KeeperResult, durationMs: number) {
  counters.keeper_runs_total++;
  counters.keeper_rounds_settled_total += result.roundsSettled;
  counters.keeper_rounds_cancelled_total += result.roundsCancelled;
  counters.keeper_rounds_reveal_failed_finalized_total += result.roundsRevealFailedFinalized;
  counters.keeper_votes_revealed_total += result.votesRevealed;
  counters.keeper_unrevealed_cleanup_batches_total += result.cleanupBatchesProcessed;
  counters.keeper_content_marked_dormant_total += result.contentMarkedDormant;
  gauges.keeper_last_run_duration_seconds = durationMs / 1000;
  gauges.keeper_last_successful_run_timestamp = Date.now() / 1000;
  consecutiveErrors = 0;
  lastRunTime = new Date();
}

/** Record a keeper error. */
export function recordError() {
  counters.keeper_errors_total++;
  consecutiveErrors++;
}

// --- Prometheus text format ---
function renderMetrics(): string {
  const lines: string[] = [];

  const counterHelp: Record<string, string> = {
    keeper_rounds_settled_total: "Total rounds settled by keeper",
    keeper_rounds_cancelled_total: "Total rounds cancelled by keeper",
    keeper_rounds_reveal_failed_finalized_total: "Total rounds finalized as RevealFailed by keeper",
    keeper_votes_revealed_total: "Total votes revealed by keeper",
    keeper_unrevealed_cleanup_batches_total: "Total unrevealed-vote cleanup batches processed by keeper",
    keeper_content_marked_dormant_total: "Total content items marked dormant",
    keeper_runs_total: "Total keeper run cycles",
    keeper_errors_total: "Total keeper run errors",
    keeper_decrypt_failures_total: "Total tlock decryption failures",
  };

  for (const [name, value] of Object.entries(counters)) {
    lines.push(`# HELP ${name} ${counterHelp[name] || name}`);
    lines.push(`# TYPE ${name} counter`);
    lines.push(`${name} ${value}`);
  }

  const gaugeHelp: Record<string, string> = {
    keeper_last_run_duration_seconds: "Duration of the last keeper run in seconds",
    keeper_last_successful_run_timestamp: "Unix timestamp of last successful run",
    keeper_is_running: "Whether a keeper run is currently in progress",
    keeper_wallet_balance_wei: "Keeper wallet native balance in wei",
    keeper_consensus_reserve_wei: "RoundVotingEngine consensus reserve balance in HREP base units",
  };

  for (const [name, value] of Object.entries(gauges)) {
    lines.push(`# HELP ${name} ${gaugeHelp[name] || name}`);
    lines.push(`# TYPE ${name} gauge`);
    lines.push(`${name} ${value}`);
  }

  return lines.join("\n") + "\n";
}

export function getMetricsText(): string {
  return renderMetrics();
}

// --- Health check ---
function isHealthy(): boolean {
  if (!lastRunTime) return false;
  return Date.now() - lastRunTime.getTime() < healthThresholdMs;
}

function renderHealth(): { status: number; body: string } {
  const healthy = isHealthy();
  const body = JSON.stringify({
    status: healthy ? "ok" : "unhealthy",
    uptime: Math.floor((Date.now() - startTime) / 1000),
    lastRun: lastRunTime?.toISOString() ?? null,
    lastRunDuration: gauges.keeper_last_run_duration_seconds,
    consecutiveErrors,
    totalRuns: counters.keeper_runs_total,
    roundsRevealFailedFinalized: counters.keeper_rounds_reveal_failed_finalized_total,
    cleanupBatchesProcessed: counters.keeper_unrevealed_cleanup_batches_total,
    decryptFailures: counters.keeper_decrypt_failures_total,
    walletBalanceWei: String(BigInt(Math.round(gauges.keeper_wallet_balance_wei))),
    consensusReserveWei: String(BigInt(Math.round(gauges.keeper_consensus_reserve_wei))),
  });
  return { status: healthy ? 200 : 503, body };
}

export function getHealthSnapshot(): { status: number; body: string } {
  return renderHealth();
}

// --- HTTP server ---
function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.url === "/metrics" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "text/plain; version=0.0.4; charset=utf-8" });
    res.end(renderMetrics());
  } else if (req.url === "/health" && req.method === "GET") {
    const { status, body } = renderHealth();
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(body);
  } else {
    res.writeHead(404);
    res.end("Not Found\n");
  }
}

export function startMetricsServer(port: number, bindAddress = "127.0.0.1"): Server {
  const server = createServer(handler);
  server.listen(port, bindAddress);
  return server;
}
