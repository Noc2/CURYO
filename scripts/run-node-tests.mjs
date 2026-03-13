import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const TEST_FILE_RE = /\.(test|spec)\.(ts|tsx)$/;
const IGNORED_DIRS = new Set(["node_modules", ".next"]);
const scriptDir = dirname(fileURLToPath(import.meta.url));
const preloadModule = join(scriptDir, "register-node-test-env.mjs");

function collectTests(dir, results) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      collectTests(join(dir, entry.name), results);
      continue;
    }

    if (TEST_FILE_RE.test(entry.name)) {
      results.push(relative(process.cwd(), join(dir, entry.name)));
    }
  }
}

const roots = process.argv.slice(2);
if (roots.length === 0) {
  console.error("Usage: node scripts/run-node-tests.mjs <dir> [dir...]");
  process.exit(1);
}

const files = [];
for (const root of roots) {
  collectTests(resolve(process.cwd(), root), files);
}

files.sort();

if (files.length === 0) {
  console.error(`No test files found under: ${roots.join(", ")}`);
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  ["--import", preloadModule, "--import", "tsx", "--test", ...files],
  {
    stdio: "inherit",
    cwd: process.cwd(),
  },
);

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
