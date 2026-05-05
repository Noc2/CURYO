import { spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { createConnection } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ponderDir = join(__dirname, "..");
const pgliteDir = join(ponderDir, ".ponder", "pglite");
const LOCALHOST_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);
const DEFAULT_PONDER_URL = "http://127.0.0.1:42069";
const PONDER_SHUTDOWN_ERROR_MARKER = "PONDER_SHUTDOWN_ERROR_STUCK";
const PONDER_CLOSED_PGLITE_MARKER = "PONDER_CLOSED_PGLITE_STUCK";
const PONDER_PORT_FALLBACK_MARKER = "PONDER_CONFIGURED_PORT_FALLBACK_STUCK";
const SHUTDOWN_STATUS_GRACE_MS = 10_000;
const SHUTDOWN_STATUS_POLL_MS = 2_000;
const SHUTDOWN_STATUS_TIMEOUT_MS = 1_500;
const PONDER_PORT_RELEASE_TIMEOUT_MS = 10_000;
const PONDER_PORT_RELEASE_POLL_MS = 250;
const PONDER_PORT_CHECK_TIMEOUT_MS = 500;
const PONDER_PORT_FALLBACK_PATTERN = /\bPort (\d{1,5}) was in use, trying port (\d{1,5})\b/g;
const PONDER_SERVER_TRANSITION_PATTERN =
  /\b(Hot reload|Using PGlite database at|Port \d{1,5} was in use, trying port \d{1,5}|Started listening on port \d{1,5})\b/;

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
  if (output.includes(PONDER_CLOSED_PGLITE_MARKER) || output.includes("PGlite is closed")) {
    return "closed PGlite database handle";
  }
  if (output.includes(PONDER_PORT_FALLBACK_MARKER)) {
    return "Ponder moved off the configured port";
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
  return (
    reason === "corrupted PGlite state" ||
    reason === "stuck Ponder database shutdown state" ||
    reason === "closed PGlite database handle" ||
    reason === "Ponder moved off the configured port" ||
    reason === "stale local Ponder sync state after the hardhat/anvil chain was reset"
  );
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

export function outputIndicatesPonderServerTransition(output) {
  return PONDER_SERVER_TRANSITION_PATTERN.test(output);
}

export function outputIndicatesClosedPglite(output) {
  return output.includes("PGlite is closed");
}

export function outputIndicatesConfiguredPortFallback(output, statusUrl) {
  if (!statusUrl) return false;

  const configuredPort = getLocalPort(statusUrl);
  if (!configuredPort) return false;

  for (const match of output.matchAll(PONDER_PORT_FALLBACK_PATTERN)) {
    const attemptedPort = Number(match[1]);
    if (attemptedPort === configuredPort) return true;
  }

  return false;
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

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getLocalPort(statusUrl) {
  const port = Number(statusUrl.port || (statusUrl.protocol === "https:" ? 443 : 80));
  return Number.isInteger(port) && port > 0 ? port : null;
}

function canConnectToLocalPort(statusUrl) {
  const port = getLocalPort(statusUrl);
  if (!port) return Promise.resolve(false);

  return new Promise((resolve) => {
    let settled = false;
    const host = statusUrl.hostname === "localhost" ? "127.0.0.1" : statusUrl.hostname;
    const socket = createConnection({ host, port });

    const finish = (canConnect) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(canConnect);
    };

    socket.setTimeout(PONDER_PORT_CHECK_TIMEOUT_MS);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

async function waitForPonderPortRelease(statusUrl, env = process.env) {
  if (!shouldPollPonderStatus(statusUrl, env)) return true;

  const deadline = Date.now() + PONDER_PORT_RELEASE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (!(await canConnectToLocalPort(statusUrl))) return true;
    await wait(PONDER_PORT_RELEASE_POLL_MS);
  }

  return false;
}

function runDevRaw() {
  return new Promise((resolve, reject) => {
    const useProcessGroup = process.platform !== "win32";
    const child = spawn("yarn", ["run", "dev:raw"], {
      cwd: ponderDir,
      stdio: ["inherit", "pipe", "pipe"],
      env: process.env,
      detached: useProcessGroup,
    });

    let combinedOutput = "";
    let shutdownRequested = false;

    const stopChild = (signal) => {
      if (child.exitCode !== null || child.signalCode !== null) return;

      if (useProcessGroup && child.pid) {
        try {
          process.kill(-child.pid, signal);
          return;
        } catch {
          // Fall back to the direct child if the process group is already gone.
        }
      }

      child.kill(signal);
    };

    const startedAt = Date.now();
    const baseStatusUrl = resolvePonderStatusUrl(process.env);
    let hasActivePonderServer = false;
    let lastServerTransitionAt = startedAt;
    let recoveryStopRequested = false;

    const appendOutput = (text) => {
      combinedOutput += text;
      if (combinedOutput.length > 128_000) {
        combinedOutput = combinedOutput.slice(-128_000);
      }
    };

    const requestRecoveryStop = (message, marker) => {
      if (recoveryStopRequested || shutdownRequested || child.exitCode !== null || child.signalCode !== null) return;

      recoveryStopRequested = true;
      appendOutput(`${message}${marker}\n`);
      process.stderr.write(message);

      stopChild("SIGTERM");
      setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) {
          stopChild("SIGKILL");
        }
      }, 5_000).unref();
    };

    const capture = (chunk) => {
      const text = chunk.toString();
      appendOutput(text);

      if (outputIndicatesPonderServerTransition(text)) {
        lastServerTransitionAt = Date.now();
      }

      if (text.includes("Started listening on port")) {
        hasActivePonderServer = true;
      }

      if (outputIndicatesConfiguredPortFallback(text, baseStatusUrl)) {
        requestRecoveryStop(
          "\nWarning: Ponder moved off the configured port. Stopping it so devWithRecovery can clear the stale server and retry.\n",
          PONDER_PORT_FALLBACK_MARKER,
        );
      } else if (outputIndicatesClosedPglite(text)) {
        requestRecoveryStop(
          "\nWarning: Detected closed PGlite database handle. Stopping Ponder so devWithRecovery can reset local state and retry.\n",
          PONDER_CLOSED_PGLITE_MARKER,
        );
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

    let monitorInFlight = false;
    const monitor = shouldPollPonderStatus(baseStatusUrl, process.env)
      ? setInterval(async () => {
          if (monitorInFlight || shutdownRequested || child.exitCode !== null || child.signalCode !== null) return;
          if (!hasActivePonderServer || !baseStatusUrl) return;
          if (Date.now() - lastServerTransitionAt < SHUTDOWN_STATUS_GRACE_MS) return;

          const statusUrl = baseStatusUrl;

          monitorInFlight = true;
          try {
            const { ok, text } = await fetchStatusText(statusUrl);
            if (!ok && text.includes("ShutdownError")) {
              requestRecoveryStop(
                `\nWarning: Detected Ponder ShutdownError from ${statusUrl.href}. ` +
                  "Stopping the stuck process so devWithRecovery can retry.\n",
                PONDER_SHUTDOWN_ERROR_MARKER,
              );
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
      stopChild(signal);
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

  const releasedPort = await waitForPonderPortRelease(resolvePonderStatusUrl(process.env), process.env);
  if (!releasedPort) {
    console.warn("\nWarning: Ponder port is still occupied after recovery stop; retrying anyway...\n");
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
