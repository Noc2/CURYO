import { spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ponderDir = join(__dirname, "..");
const pgliteDir = join(ponderDir, ".ponder", "pglite");
const LOCALHOST_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

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

export function shouldRecover(output, env = process.env) {
  return getRecoveryReason(output, env) !== null;
}

function runDevRaw() {
  return new Promise((resolve, reject) => {
    const child = spawn("yarn", ["run", "dev:raw"], {
      cwd: ponderDir,
      stdio: ["inherit", "pipe", "pipe"],
      env: process.env,
    });

    let combinedOutput = "";

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

    const forwardSignal = (signal) => {
      if (!child.killed) {
        child.kill(signal);
      }
    };

    process.once("SIGINT", forwardSignal);
    process.once("SIGTERM", forwardSignal);

    child.on("error", (error) => {
      process.removeListener("SIGINT", forwardSignal);
      process.removeListener("SIGTERM", forwardSignal);
      reject(error);
    });

    child.on("close", (code) => {
      process.removeListener("SIGINT", forwardSignal);
      process.removeListener("SIGTERM", forwardSignal);
      resolve({ code: code ?? 1, output: combinedOutput });
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
  if (firstRun.code === 0 || !recoveryReason) {
    process.exit(firstRun.code);
  }

  const removed = resetPgliteIfPresent();
  if (!removed) {
    process.exit(firstRun.code);
  }

  console.warn(
    `\nWarning: Detected ${recoveryReason}. Resetting packages/ponder/.ponder/pglite and retrying once...\n`,
  );
  const secondRun = await runDevRaw();
  process.exit(secondRun.code);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
