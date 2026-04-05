#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { MissingDockerComposeError, ensureLocalDatabase, formatDatabaseTarget, resolveNextDatabaseConfig } from "./dev-db.mjs";

const currentFile = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(currentFile), "..");
const nextProjectDir = path.join(repoRoot, "packages", "nextjs");
const nextDevLockPath = path.join(nextProjectDir, ".next-dev.lock");
const yarnCommand = process.platform === "win32" ? "yarn.cmd" : "yarn";
const baseServices = [
  {
    name: "Ponder",
    label: "ponder",
    color: "\u001b[36m",
    command: yarnCommand,
    args: ["ponder:dev"],
  },
  {
    name: "Next",
    label: "next",
    color: "\u001b[33m",
    command: yarnCommand,
    args: ["start"],
  },
];
const keeperService = {
  name: "Keeper",
  label: "keeper",
  color: "\u001b[35m",
  command: yarnCommand,
  args: ["keeper:dev"],
};
const resetColor = "\u001b[0m";
const managedChildren = [];
let shuttingDown = false;

function pidIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error instanceof Error && "code" in error && error.code === "EPERM";
  }
}

function readActiveNextDevLock() {
  if (!existsSync(nextDevLockPath)) return null;

  try {
    const raw = readFileSync(nextDevLockPath, "utf8");
    const parsed = JSON.parse(raw);
    if (typeof parsed?.pid === "number" && pidIsAlive(parsed.pid)) {
      return parsed;
    }
  } catch {
    // Ignore malformed/stale locks here. Next's own preflight handles cleanup.
  }

  return null;
}

function prefixOutput(stream, target, prefix) {
  let buffer = "";

  stream.on("data", chunk => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      target.write(`${prefix} ${line}\n`);
    }
  });

  stream.on("end", () => {
    if (buffer) {
      target.write(`${prefix} ${buffer}\n`);
    }
  });
}

function warnIfMissing(filePath, message) {
  if (!existsSync(filePath)) {
    console.warn(`[dev-stack] ${message}`);
  }
}

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return {};
  }

  const values = {};
  const raw = readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }

  return values;
}

function resolveKeeperStartupStatus() {
  const keeperEnvPath = path.join(repoRoot, "packages", "keeper", ".env.local");
  const envFromFile = parseEnvFile(keeperEnvPath);
  const env = { ...envFromFile, ...process.env };
  const missing = [];

  if (!env.RPC_URL?.trim()) {
    missing.push("RPC_URL");
  }
  if (!env.CHAIN_ID?.trim()) {
    missing.push("CHAIN_ID");
  }

  const hasKeystoreAccount = Boolean(env.KEYSTORE_ACCOUNT?.trim());
  const hasPrivateKey = Boolean(env.KEEPER_PRIVATE_KEY?.trim());
  if (!hasKeystoreAccount && !hasPrivateKey) {
    missing.push("KEYSTORE_ACCOUNT or KEEPER_PRIVATE_KEY");
  }
  if (hasKeystoreAccount && !env.KEYSTORE_PASSWORD?.trim()) {
    missing.push("KEYSTORE_PASSWORD");
  }

  return {
    keeperEnvPath,
    enabled: missing.length === 0,
    missing,
  };
}

function printMissingDockerHelp(databaseConfig) {
  console.error("[dev-stack] Docker is not available for the local Postgres helper.");
  console.error("[dev-stack] Choose one of these next steps:");
  console.error("[dev-stack]  1. Install Docker Desktop, then rerun `yarn dev:stack`.");
  console.error(
    `[dev-stack]  2. Start Postgres yourself at ${databaseConfig.host}:${databaseConfig.port}/${databaseConfig.databaseName}, set DATABASE_URL, then run \`yarn dev:stack --skip-db\`.`,
  );
}

function outputIndicatesFailure(output) {
  return (
    /(^|\n)\s*(Error|error):/m.test(output) ||
    /severity:\s*['"]FATAL['"]/i.test(output) ||
    /connect\s+(EPERM|ECONNREFUSED|ETIMEDOUT|EHOSTUNREACH|ENOTFOUND)\b/i.test(output)
  );
}

function outputHasMissingRoleError(output) {
  return /role\s+"[^"]+"\s+does not exist/i.test(output);
}

function runDbPush(databaseConfig) {
  if (databaseConfig.isMemory) {
    console.log("[dev-stack] Skipping Next.js schema push for the in-memory development database.");
    return;
  }

  console.log(`[dev-stack] Applying the Next.js database schema at ${formatDatabaseTarget(databaseConfig)}...`);

  const result = spawnSync(yarnCommand, ["workspace", "@curyo/nextjs", "db:push"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      DATABASE_URL: databaseConfig.url,
    },
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  const combinedOutput = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0 || outputIndicatesFailure(combinedOutput)) {
    if (databaseConfig.isLocal && outputHasMissingRoleError(combinedOutput)) {
      throw new Error(
        `Failed to apply the Next.js database schema against ${formatDatabaseTarget(databaseConfig)} because the local Postgres volume was initialized with different credentials. ` +
          "Run `yarn dev:db:reset` once, then rerun `yarn dev:stack`.",
      );
    }

    throw new Error(
      `Failed to apply the Next.js database schema against ${formatDatabaseTarget(databaseConfig)}. ` +
        "If you are using your own local Postgres, set DATABASE_URL to a valid role/password and rerun with `yarn dev:stack --skip-db`.",
    );
  }
}

function spawnService(service, extraEnv = {}) {
  const prefix = `${service.color}[${service.label}]${resetColor}`;
  const child = spawn(service.command, service.args, {
    cwd: repoRoot,
    env: {
      ...process.env,
      ...extraEnv,
    },
    stdio: ["inherit", "pipe", "pipe"],
  });

  managedChildren.push(child);
  prefixOutput(child.stdout, process.stdout, prefix);
  prefixOutput(child.stderr, process.stderr, prefix);

  child.on("exit", (code, signal) => {
    if (shuttingDown) return;

    const suffix = signal ? `signal ${signal}` : `code ${code ?? 0}`;
    console.error(`[dev-stack] ${service.name} exited with ${suffix}. Shutting down the rest of the stack.`);
    shutdown(code ?? 1);
  });

  child.on("error", error => {
    if (shuttingDown) return;

    console.error(`[dev-stack] Failed to start ${service.name}: ${error.message}`);
    shutdown(1);
  });
}

async function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of managedChildren) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }

  await new Promise(resolve => setTimeout(resolve, 2_000));

  for (const child of managedChildren) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
    }
  }

  process.exit(exitCode);
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(`Usage: node scripts/dev-stack.mjs [--skip-db]

Starts the local app stack:
  - local Postgres for the Next app
  - Next.js schema push
  - Ponder
  - Next.js
  - Keeper (when configured)

Options:
  --skip-db  Do not start the local Postgres container
`);
    return;
  }

  const databaseConfig = resolveNextDatabaseConfig();
  const skipDb = process.argv.includes("--skip-db");
  const activeNextDevLock = readActiveNextDevLock();
  const keeperStartup = resolveKeeperStartupStatus();

  warnIfMissing(
    path.join(repoRoot, "packages", "ponder", ".env.local"),
    "packages/ponder/.env.local is missing. Ponder will use defaults where it can, but RPC/network settings may be incomplete.",
  );

  if (activeNextDevLock) {
    console.error(
      `[dev-stack] Next is already running for this workspace (PID ${activeNextDevLock.pid}). ` +
        "Stop that process before running `yarn dev:stack` so the full stack can start cleanly.",
    );
    process.exit(1);
  }

  if (skipDb) {
    console.log(`[dev-stack] Skipping local Postgres. Using ${formatDatabaseTarget(databaseConfig)}.`);
  } else {
    try {
      const localDbResult = await ensureLocalDatabase(databaseConfig);
      if (localDbResult.skipped) {
        console.log(`[dev-stack] Skipping local Postgres because ${localDbResult.reason}.`);
      }
    } catch (error) {
      if (error instanceof MissingDockerComposeError) {
        printMissingDockerHelp(databaseConfig);
        process.exit(1);
      }
      throw error;
    }
  }

  runDbPush(databaseConfig);

  const services = keeperStartup.enabled ? [...baseServices, keeperService] : baseServices;
  if (!keeperStartup.enabled) {
    console.log(
      `[dev-stack] Skipping Keeper because ${keeperStartup.missing.join(", ")} is not configured in the environment or ${path.relative(repoRoot, keeperStartup.keeperEnvPath)}.`,
    );
  }

  console.log(`[dev-stack] Starting ${services.map(service => service.name).join(", ")}...`);
  console.log("[dev-stack] Deployment stays separate. Point your env files at the chain you already deployed to.");

  process.on("SIGINT", () => shutdown(0));
  process.on("SIGTERM", () => shutdown(0));

  for (const service of services) {
    spawnService(service, {
      ...(service.label === "next" ? { DATABASE_URL: databaseConfig.url } : {}),
    });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(error => {
    console.error(`[dev-stack] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
