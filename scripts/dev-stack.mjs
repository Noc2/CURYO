#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { ensureLocalDatabase, formatDatabaseTarget, resolveNextDatabaseConfig } from "./dev-db.mjs";

const currentFile = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(currentFile), "..");
const yarnCommand = process.platform === "win32" ? "yarn.cmd" : "yarn";
const services = [
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
  {
    name: "Keeper",
    label: "keeper",
    color: "\u001b[35m",
    command: yarnCommand,
    args: ["keeper:dev"],
  },
];
const resetColor = "\u001b[0m";
const managedChildren = [];
let shuttingDown = false;

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

function runDbPush(databaseUrl) {
  console.log("[dev-stack] Applying the Next.js database schema...");

  const result = spawnSync(yarnCommand, ["workspace", "@curyo/nextjs", "db:push"], {
    cwd: repoRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
    },
  });

  if (result.status !== 0) {
    throw new Error("Failed to apply the Next.js database schema.");
  }
}

function spawnService(service) {
  const prefix = `${service.color}[${service.label}]${resetColor}`;
  const child = spawn(service.command, service.args, {
    cwd: repoRoot,
    env: process.env,
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
  - Keeper

Options:
  --skip-db  Do not start the local Postgres container
`);
    return;
  }

  const databaseConfig = resolveNextDatabaseConfig();
  const skipDb = process.argv.includes("--skip-db");

  warnIfMissing(
    path.join(repoRoot, "packages", "ponder", ".env.local"),
    "packages/ponder/.env.local is missing. Ponder will use defaults where it can, but RPC/network settings may be incomplete.",
  );
  warnIfMissing(
    path.join(repoRoot, "packages", "keeper", ".env.local"),
    "packages/keeper/.env.local is missing. Keeper needs RPC_URL, CHAIN_ID, and a wallet before it can start.",
  );

  if (skipDb) {
    console.log(`[dev-stack] Skipping local Postgres. Using ${formatDatabaseTarget(databaseConfig)}.`);
  } else {
    const localDbResult = await ensureLocalDatabase();
    if (localDbResult.skipped) {
      console.log(`[dev-stack] Skipping local Postgres because ${localDbResult.reason}.`);
    }
  }

  runDbPush(databaseConfig.url);

  console.log("[dev-stack] Starting Ponder, Next.js, and Keeper...");
  console.log("[dev-stack] Deployment stays separate. Point your env files at the chain you already deployed to.");

  process.on("SIGINT", () => shutdown(0));
  process.on("SIGTERM", () => shutdown(0));

  for (const service of services) {
    spawnService(service);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(error => {
    console.error(`[dev-stack] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
