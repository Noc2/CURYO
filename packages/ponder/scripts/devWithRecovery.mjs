import { spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ponderDir = join(__dirname, "..");
const pgliteDir = join(ponderDir, ".ponder", "pglite");
const LOCALHOST_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);
const DEFAULT_PONDER_URL = "http://127.0.0.1:42069";
const PONDER_SHUTDOWN_ERROR_MARKER = "PONDER_SHUTDOWN_ERROR_STUCK";
const SHUTDOWN_STATUS_GRACE_MS = 10_000;
const SHUTDOWN_STATUS_POLL_MS = 2_000;
const SHUTDOWN_STATUS_TIMEOUT_MS = 1_500;

function isLocalHardhatRpc(env = process.env) {
  const network = env.PONDER_NETWORK ?? "hardhat";
  if (network !== "hardhat") return false;

  const rpcUrl = env.PONDER_RPC_URL_31337 ?? "http://127.0.0.1:8545";

  try {
    const { hostname } = new URL(rpcUrl);
    return LOCALHOST_HOSTNAMES.has(hostname);
  } catch {
    return false;
  }
}

function isRecoverableLocalReset(output, env = process.env) {
  return isLocalHardhatRpc(env) && output.includes("BlockNotFoundError") && output.includes("could not be found");
}

export function getRecoveryReason(output, env = process.env) {
  if (output.includes(PONDER_SHUTDOWN_ERROR_MARKER)) {
    return "stuck Ponder database shutdown state";
  }

  const hasWalRecovery = output.includes("InitWalRecovery");
  const hasPgliteAbort =
    output.includes("RuntimeError: Aborted()") && output.includes("@electric-sql/pglite");
  if (hasWalRecovery || hasPgliteAbort) {
    return "corrupted PGlite state";
  }
  if (isRecoverableLocalReset(output, env)) {
    return "stale local Ponder sync state after the hardhat/anvil chain was reset";
  }
  return null;
}

export function shouldResetPglite(output, env = process.env) {
  const reason = getRecoveryReason(output, env);
  return reason === "corrupted PGlite state" || reason === "stale local Ponder sync state after the hardhat/anvil chain was reset";
}

export function shouldRecover(output, env = process.env) {
  return getRecoveryReason(output, env) !== null;
}

function resolvePonderStatusUrl(env = process.env) {
  const rawUrl = env.PONDER_STATUS_URL ?? env.NEXT_PUBLIC_PONDER_URL ?? DEFAULT_PONDER_URL;

  try {
    const url = new URL(rawUrl);
    url.pathname = "/status";
    url.search = "";
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

function shouldPollPonderStatus(statusUrl, env = process.env) {
  if (!statusUrl) return false;
  if (!isLocalHardhatRpc(env)) return false;

  return LOCALHOST_HOSTNAMES.has(statusUrl.hostname);
}

async function fetchStatusText(statusUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SHUTDOWN_STATUS_TIMEOUT_MS);

  try {
    const response = await fetch(statusUrl, { signal: controller.signal });
    return {
      ok: response.ok,
      text: await response.text(),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function runDevRaw() {
  return new Promise((resolve, reject) => {
    const child = spawn("yarn", ["run", "dev:raw"], {
      cwd: ponderDir,
      stdio: ["inherit", "pipe", "pipe"],
      env: process.env,
    });

    let combinedOutput = "";
    let shutdownRequested = false;

    const capture = (chunk) => {
      combinedOutput += chunk.toString();
      if (combinedOutput.length > 128_000) {
        combinedOutput = combinedOutput.slice(-128_000);
      }
    };

    child.stdout.on("data", (chunk) => {
      capture(chunk);
      process.stdout.write(chunk);
    });

    child.stderr.on("data", (chunk) => {
      capture(chunk);
      process.stderr.write(chunk);
    });

    const statusUrl = resolvePonderStatusUrl(process.env);
    let monitorInFlight = false;
    const startedAt = Date.now();
    const monitor = shouldPollPonderStatus(statusUrl, process.env)
      ? setInterval(async () => {
          if (monitorInFlight || shutdownRequested || child.exitCode !== null || child.signalCode !== null) return;
          if (Date.now() - startedAt < SHUTDOWN_STATUS_GRACE_MS) return;

          monitorInFlight = true;
          try {
            const { ok, text } = await fetchStatusText(statusUrl);
            if (!ok && text.includes("ShutdownError")) {
              const message =
                `\nWarning: Detected Ponder ShutdownError from ${statusUrl.href}. ` +
                "Stopping the stuck process so devWithRecovery can retry.\n";
              capture(`${message}${PONDER_SHUTDOWN_ERROR_MARKER}\n`);
              process.stderr.write(message);

              child.kill("SIGTERM");
              setTimeout(() => {
                if (child.exitCode === null && child.signalCode === null) {
                  child.kill("SIGKILL");
                }
              }, 5_000).unref();
            }
          } catch {
            // Ponder is often not listening yet during startup; keep polling.
          } finally {
            monitorInFlight = false;
          }
        }, SHUTDOWN_STATUS_POLL_MS)
      : null;

    monitor?.unref();

    const forwardSignal = (signal) => {
      shutdownRequested = true;
      if (!child.killed) {
        child.kill(signal);
      }
    };

    process.once("SIGINT", forwardSignal);
    process.once("SIGTERM", forwardSignal);

    child.on("error", (error) => {
      if (monitor) clearInterval(monitor);
      process.removeListener("SIGINT", forwardSignal);
      process.removeListener("SIGTERM", forwardSignal);
      reject(error);
    });

    child.on("close", (code) => {
      if (monitor) clearInterval(monitor);
      process.removeListener("SIGINT", forwardSignal);
      process.removeListener("SIGTERM", forwardSignal);
      resolve({ code: code ?? 1, output: combinedOutput, shutdownRequested });
    });
  });
}

function resetPgliteIfPresent() {
  if (!existsSync(pgliteDir)) return false;
  rmSync(pgliteDir, { recursive: true, force: true });
  return true;
}

async function main() {
  const firstRun = await runDevRaw();
  const recoveryReason = getRecoveryReason(firstRun.output, process.env);
  if (firstRun.code === 0 || firstRun.shutdownRequested || !recoveryReason) {
    process.exit(firstRun.code);
  }

  if (shouldResetPglite(firstRun.output, process.env)) {
    const removed = resetPgliteIfPresent();
    if (!removed) {
      process.exit(firstRun.code);
    }

    console.warn(
      `\nWarning: Detected ${recoveryReason}. Resetting packages/ponder/.ponder/pglite and retrying once...\n`,
    );
  } else {
    console.warn(`\nWarning: Detected ${recoveryReason}. Retrying Ponder once...\n`);
  }

  const secondRun = await runDevRaw();
  process.exit(secondRun.code);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
