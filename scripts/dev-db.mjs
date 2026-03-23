#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const LOCAL_HOSTNAMES = new Set(["127.0.0.1", "localhost", "::1"]);
const DEFAULT_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:5432/curyo_app";
const IN_MEMORY_DATABASE_URL = "memory:";
const currentFile = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(currentFile), "..");
const composeFile = path.join(repoRoot, "docker-compose.dev.yml");
const nextEnvLocalFile = path.join(repoRoot, "packages", "nextjs", ".env.local");
const postgresServiceName = "next-postgres";

export class MissingDockerComposeError extends Error {
  constructor() {
    super("Docker Compose is required. Install Docker Desktop or docker-compose to use local Postgres.");
    this.name = "MissingDockerComposeError";
  }
}

function stripMatchingQuotes(value) {
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) return {};

  const values = {};
  for (const rawLine of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = line.slice(0, separatorIndex).trim().replace(/^export\s+/, "");
    const value = stripMatchingQuotes(line.slice(separatorIndex + 1).trim());
    if (key) values[key] = value;
  }

  return values;
}

function isLegacyLocalDatabaseUrl(value) {
  return value === "file:local.db" || value.startsWith("file:") || value.startsWith("sqlite:");
}

export function resolveNextDatabaseConfig() {
  const envFileValues = parseEnvFile(nextEnvLocalFile);
  const envDatabaseUrl = process.env.DATABASE_URL?.trim();
  const fileDatabaseUrl = envFileValues.DATABASE_URL?.trim();
  const rawUrl = envDatabaseUrl || fileDatabaseUrl;
  const usesLegacyLocalDatabaseUrl = rawUrl ? isLegacyLocalDatabaseUrl(rawUrl) : false;
  const url = rawUrl ? (usesLegacyLocalDatabaseUrl ? IN_MEMORY_DATABASE_URL : rawUrl) : DEFAULT_DATABASE_URL;

  if (rawUrl && usesLegacyLocalDatabaseUrl) {
    const source = envDatabaseUrl ? "the current shell environment" : "packages/nextjs/.env.local";
    console.warn(
      `[dev-db] Mapping legacy SQLite DATABASE_URL (${rawUrl}) from ${source} to ${IN_MEMORY_DATABASE_URL}. ` +
        "Update it to `memory:` or a PostgreSQL URL when convenient.",
    );
  }

  if (url === IN_MEMORY_DATABASE_URL) {
    return {
      url,
      host: "memory",
      port: 0,
      databaseName: "memory",
      user: "memory",
      password: "",
      isLocal: false,
      isMemory: true,
    };
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`DATABASE_URL must be a valid PostgreSQL URL. Received: ${url}`);
  }

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error(`DATABASE_URL must use the postgres:// or postgresql:// scheme. Received: ${url}`);
  }

  const databaseName = parsed.pathname.replace(/^\//, "");
  if (!databaseName) {
    throw new Error(`DATABASE_URL must include a database name. Received: ${url}`);
  }

  return {
    url,
    host: parsed.hostname,
    port: Number.parseInt(parsed.port || "5432", 10),
    databaseName: decodeURIComponent(databaseName),
    user: decodeURIComponent(parsed.username || "postgres"),
    password: decodeURIComponent(parsed.password || ""),
    isLocal: LOCAL_HOSTNAMES.has(parsed.hostname),
    isMemory: false,
  };
}

export function formatDatabaseTarget(config) {
  if (config.isMemory) {
    return "in-memory database";
  }

  return `${config.user}@${config.host}:${config.port}/${config.databaseName}`;
}

function getComposeCommand() {
  const dockerCompose = spawnSync("docker", ["compose", "version"], {
    cwd: repoRoot,
    stdio: "ignore",
  });
  if (dockerCompose.status === 0) {
    return { command: "docker", args: ["compose"] };
  }

  const legacyCompose = spawnSync("docker-compose", ["version"], {
    cwd: repoRoot,
    stdio: "ignore",
  });
  if (legacyCompose.status === 0) {
    return { command: "docker-compose", args: [] };
  }

  throw new MissingDockerComposeError();
}

function getComposeEnv(config = resolveNextDatabaseConfig()) {
  return {
    ...process.env,
    CURYO_LOCAL_DB_NAME: config.databaseName,
    CURYO_LOCAL_DB_USER: config.user,
    CURYO_LOCAL_DB_PASSWORD: config.password,
    CURYO_LOCAL_DB_PORT: String(config.port),
  };
}

function runCompose(composeArgs, options = {}) {
  const compose = getComposeCommand();
  return spawnSync(compose.command, [...compose.args, "-f", composeFile, ...composeArgs], {
    cwd: repoRoot,
    stdio: options.stdio ?? "inherit",
    env: options.env ?? process.env,
  });
}

async function waitForDatabaseReady(config) {
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    const result = runCompose(["exec", "-T", postgresServiceName, "pg_isready", "-U", config.user, "-d", config.databaseName], {
      env: getComposeEnv(config),
      stdio: "ignore",
    });

    if (result.status === 0) {
      return;
    }

    await new Promise(resolve => setTimeout(resolve, 1_000));
  }

  throw new Error(`Local Postgres did not become ready at ${formatDatabaseTarget(config)} within 30 seconds.`);
}

export async function ensureLocalDatabase() {
  const config = resolveNextDatabaseConfig();

  if (config.isMemory) {
    return {
      skipped: true,
      config,
      reason: "DATABASE_URL uses the in-memory development database",
    };
  }

  if (!config.isLocal) {
    return {
      skipped: true,
      config,
      reason: `DATABASE_URL points to ${formatDatabaseTarget(config)}`,
    };
  }

  if (!config.password) {
    throw new Error(
      "Local DATABASE_URL must include a password for the Docker-managed Postgres container. Update packages/nextjs/.env.local or export DATABASE_URL with credentials.",
    );
  }

  console.log(`[dev-db] Starting local Postgres for ${formatDatabaseTarget(config)}...`);
  const upResult = runCompose(["up", "-d", postgresServiceName], { env: getComposeEnv(config) });
  if (upResult.status !== 0) {
    throw new Error("Failed to start the local Postgres container.");
  }

  await waitForDatabaseReady(config);
  console.log(`[dev-db] Local Postgres is ready at ${formatDatabaseTarget(config)}.`);

  return {
    skipped: false,
    config,
  };
}

export function stopLocalDatabase() {
  const result = runCompose(["down"]);
  if (result.status !== 0) {
    throw new Error("Failed to stop the local Postgres container.");
  }
}

export function streamLocalDatabaseLogs() {
  const result = runCompose(["logs", "-f", postgresServiceName]);
  process.exit(result.status ?? 0);
}

function printUsage() {
  console.log(`Usage: node scripts/dev-db.mjs [up|down|logs]

Commands:
  up    Start the local Postgres container for the Next app
  down  Stop the local Postgres container
  logs  Follow Postgres logs
`);
}

async function main() {
  const command = process.argv[2] ?? "up";

  if (command === "--help" || command === "-h" || command === "help") {
    printUsage();
    return;
  }

  if (command === "up") {
    const result = await ensureLocalDatabase();
    if (result.skipped) {
      console.log(`[dev-db] Skipping local Postgres because ${result.reason}.`);
    }
    return;
  }

  if (command === "down") {
    stopLocalDatabase();
    console.log("[dev-db] Local Postgres stopped.");
    return;
  }

  if (command === "logs") {
    streamLocalDatabaseLogs();
    return;
  }

  printUsage();
  process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(error => {
    console.error(`[dev-db] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
