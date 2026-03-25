#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(currentFile), "..");

function printUsage() {
  console.log(`Usage: yarn yeet -- [title] [options]

Create or update a draft pull request for the current repo.

Options:
  -t, --title <title>        PR title (or pass as first positional argument)
  -F, --body-file <file>     Read PR body from a file
  -B, --base <branch>        Base branch (default: main)
  -H, --head <branch>        Head branch to use when detached or overriding
      --fill                 Fill title/body from commit messages
      --fill-first           Fill from the first commit
      --fill-verbose         Fill with verbose commit messages
      --automation           Add the codex-automation label as well as codex
      --dry-run              Print the commands that would run
  -h, --help                 Show this help

Examples:
  yarn yeet -- "Add retry coverage for gotoWithRetry"
  yarn yeet -- --fill --body-file /tmp/pr.md
  yarn yeet -- "Fix flaky profile test" --automation
`);
}

function fail(message, exitCode = 1) {
  console.error(`[yeet] ${message}`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const parsed = {
    automation: false,
    base: "main",
    bodyFile: null,
    dryRun: false,
    fillMode: null,
    head: null,
    title: null,
  };

  const positional = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }

    if (arg === "--automation") {
      parsed.automation = true;
      continue;
    }

    if (arg === "--dry-run") {
      parsed.dryRun = true;
      continue;
    }

    if (arg === "--fill" || arg === "--fill-first" || arg === "--fill-verbose") {
      if (parsed.fillMode) {
        fail("Use only one of --fill, --fill-first, or --fill-verbose.");
      }
      parsed.fillMode = arg;
      continue;
    }

    if (arg === "--title" || arg === "-t") {
      parsed.title = argv[index + 1] ?? fail("Missing value for --title.");
      index += 1;
      continue;
    }

    if (arg === "--body-file" || arg === "-F") {
      parsed.bodyFile = argv[index + 1] ?? fail("Missing value for --body-file.");
      index += 1;
      continue;
    }

    if (arg === "--base" || arg === "-B") {
      parsed.base = argv[index + 1] ?? fail("Missing value for --base.");
      index += 1;
      continue;
    }

    if (arg === "--head" || arg === "-H") {
      parsed.head = argv[index + 1] ?? fail("Missing value for --head.");
      index += 1;
      continue;
    }

    if (arg.startsWith("-")) {
      fail(`Unknown option: ${arg}`);
    }

    positional.push(arg);
  }

  if (!parsed.title && positional.length > 0) {
    parsed.title = positional.join(" ");
  }

  if (!parsed.title && !parsed.fillMode) {
    fail("Provide a title or use one of the --fill flags.");
  }

  return parsed;
}

function run(command, args, options = {}) {
  const { allowFailure = false, capture = false, dryRun = false } = options;
  const pretty = [command, ...args].join(" ");

  if (dryRun) {
    console.log(pretty);
    return { status: 0, stdout: "", stderr: "" };
  }

  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: capture ? "pipe" : "inherit",
  });

  if (result.error) {
    fail(`Failed to run \`${pretty}\`: ${result.error.message}`);
  }

  if (!allowFailure && result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  return result;
}

function requireCommand(command) {
  const result = run("command", ["-v", command], { allowFailure: true, capture: true });
  if (result.status !== 0) {
    fail(`Missing required command: ${command}`);
  }
}

function getCurrentBranch() {
  const result = run("git", ["symbolic-ref", "--quiet", "--short", "HEAD"], {
    allowFailure: true,
    capture: true,
  });
  if (result.status !== 0) {
    return null;
  }
  return result.stdout.trim() || null;
}

function getExistingPullRequest(branch) {
  const result = run("gh", ["pr", "view", branch, "--json", "number,url"], {
    allowFailure: true,
    capture: true,
  });

  if (result.status !== 0) {
    return null;
  }

  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  requireCommand("git");
  requireCommand("gh");

  const auth = run("gh", ["auth", "status"], { allowFailure: true, capture: true, dryRun: args.dryRun });
  if (auth.status !== 0) {
    console.error(auth.stdout || auth.stderr);
    fail("GitHub CLI is installed but not authenticated in this shell. Run `gh auth login` first.");
  }

  const branch = args.head || getCurrentBranch();
  if (!branch) {
    fail("Detached HEAD detected. Re-run with `--head <branch>` so yeet knows what branch to push.");
  }

  if (branch === "main" || branch === "master") {
    fail(`Refusing to open a PR from \`${branch}\`. Create or select a feature branch first.`);
  }

  const labels = args.automation ? ["codex", "codex-automation"] : ["codex"];

  run("git", ["push", "-u", "origin", `HEAD:${branch}`], { dryRun: args.dryRun });

  const existing = getExistingPullRequest(branch);
  if (existing) {
    const editArgs = ["pr", "edit", branch];
    if (args.title) {
      editArgs.push("--title", args.title);
    }
    if (args.bodyFile) {
      editArgs.push("--body-file", args.bodyFile);
    }
    if (labels.length > 0) {
      editArgs.push("--add-label", labels.join(","));
    }

    run("gh", editArgs, { dryRun: args.dryRun });

    const existingUrl = existing.url ? ` ${existing.url}` : "";
    console.log(`[yeet] Updated existing PR for branch \`${branch}\`.${existingUrl}`);
    return;
  }

  const createArgs = ["pr", "create", "--draft", "--base", args.base, "--head", branch];

  if (args.title) {
    createArgs.push("--title", args.title);
  }
  if (args.bodyFile) {
    createArgs.push("--body-file", args.bodyFile);
  }
  if (args.fillMode) {
    createArgs.push(args.fillMode);
  }
  for (const label of labels) {
    createArgs.push("--label", label);
  }

  run("gh", createArgs, { dryRun: args.dryRun });
}

main();
