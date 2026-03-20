import { spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const projectDir = path.resolve(path.dirname(currentFile), "..");
const distDir = path.join(projectDir, ".next");
const lockFile = path.join(projectDir, ".next-dev.lock");
const requiredArtifacts = [
  path.join(distDir, "routes-manifest.json"),
  path.join(distDir, "server", "next-font-manifest.json"),
];
const supportedNodeMajor = 24;
const currentNodeMajor = Number.parseInt(process.versions.node.split(".")[0] ?? "", 10);
const nextCli = path.join(projectDir, "node_modules", "next", "dist", "bin", "next");

function pidIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error instanceof Error && "code" in error && error.code === "EPERM";
  }
}

function removeLock() {
  rmSync(lockFile, { force: true });
}

function readLock() {
  if (!existsSync(lockFile)) return null;
  try {
    const raw = readFileSync(lockFile, "utf8");
    const parsed = JSON.parse(raw);
    if (typeof parsed?.pid === "number") return parsed;
  } catch {
    // Ignore malformed lock files and replace them below.
  }
  return null;
}

if (currentNodeMajor !== supportedNodeMajor) {
  console.warn(
    `[dev-preflight] Node ${process.version} is outside the supported range (>=24 <25). Dev startup may be unstable.`,
  );
}

if (existsSync(distDir) && requiredArtifacts.some(file => !existsSync(file))) {
  rmSync(distDir, { recursive: true, force: true });
  console.warn("[dev-preflight] Removed stale .next output from an incomplete previous run.");
}

const activeLock = readLock();
if (activeLock && activeLock.pid !== process.pid) {
  if (pidIsAlive(activeLock.pid)) {
    console.error(
      `[dev-preflight] Another Next dev server is already running for this workspace (PID ${activeLock.pid}).\nStop it before starting a second instance to avoid flaky .next manifest/cache errors.`,
    );
    process.exit(1);
  }

  removeLock();
  console.warn("[dev-preflight] Removed stale dev lock from an earlier crashed run.");
}

writeFileSync(
  lockFile,
  JSON.stringify(
    {
      pid: process.pid,
      startedAt: new Date().toISOString(),
    },
    null,
    2,
  ),
);

let cleanedUp = false;
let childProcess;

function cleanupAndExit(code) {
  if (!cleanedUp) {
    cleanedUp = true;
    removeLock();
  }
  process.exit(code);
}

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    if (childProcess && !childProcess.killed) {
      childProcess.kill(signal);
      return;
    }
    cleanupAndExit(0);
  });
}

childProcess = spawn(process.execPath, [nextCli, "dev"], {
  cwd: projectDir,
  env: process.env,
  stdio: "inherit",
});

childProcess.on("exit", code => {
  cleanupAndExit(code ?? 1);
});
