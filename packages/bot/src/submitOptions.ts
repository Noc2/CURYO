import { getSubmitCategoryCatalog, getSubmitSourceCatalog } from "./sourceCatalog.js";

export interface SubmitRunOptions {
  category?: string;
  maxSubmissions?: number;
  source?: string;
  transport?: "onchain" | "x402";
}

interface ParsedSubmitCommand {
  help?: boolean;
  options: SubmitRunOptions;
}

const SUBMIT_SOURCE_CATALOG = getSubmitSourceCatalog();
const SUBMIT_CATEGORY_CATALOG = getSubmitCategoryCatalog();
const SUBMIT_SOURCE_NAME_WIDTH = Math.max(...SUBMIT_SOURCE_CATALOG.map(entry => entry.sourceName.length));

function parsePositiveIntegerOption(flag: string, value: string | undefined): number {
  if (!value) {
    throw new Error(`Missing value for ${flag}`);
  }

  if (!/^\d+$/.test(value)) {
    throw new Error(`${flag} must be a positive integer`);
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer`);
  }

  return parsed;
}

export function formatSubmitUsage(): string {
  const categories = SUBMIT_CATEGORY_CATALOG.map(
    entry => `  ${String(entry.categoryId).padEnd(2)} ${entry.categoryName}`,
  ).join("\n");
  const sources = SUBMIT_SOURCE_CATALOG.map(
    entry =>
      `  ${entry.sourceName.padEnd(SUBMIT_SOURCE_NAME_WIDTH)} -> ${entry.categoryName} (${entry.authRequirement})`,
  ).join("\n");

  return `Usage: yarn submit [options]

Discover trending content and submit it to ContentRegistry.

Options:
  --category <id|name>       Limit submission to one category (for example: 4, "Media")
  --source <name>            Limit submission to one source adapter (for example: youtube)
  --max-submissions <count>  Override the per-run submission cap for this execution
  --transport <onchain|x402> Submit directly on-chain or through the hosted x402 API
  -h, --help                 Show this help

Available categories:
${categories}

Available sources:
${sources}

Examples:
  yarn submit --category "Media" --source youtube --max-submissions 3
  yarn workspace @curyo/bot submit --category "Media" --source youtube --max-submissions 3`;
}

export function parseSubmitCommandArgs(argv: string[]): ParsedSubmitCommand {
  const options: SubmitRunOptions = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      return { help: true, options };
    }

    if (arg === "--category") {
      options.category = argv[index + 1]?.trim();
      if (!options.category) {
        throw new Error("Missing value for --category");
      }
      index += 1;
      continue;
    }

    if (arg === "--source") {
      options.source = argv[index + 1]?.trim();
      if (!options.source) {
        throw new Error("Missing value for --source");
      }
      index += 1;
      continue;
    }

    if (arg === "--max-submissions") {
      options.maxSubmissions = parsePositiveIntegerOption(arg, argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--transport") {
      const transport = argv[index + 1]?.trim();
      if (transport !== "onchain" && transport !== "x402") {
        throw new Error("--transport must be either onchain or x402");
      }
      options.transport = transport;
      index += 1;
      continue;
    }

    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }

    throw new Error(`Unexpected positional argument: ${arg}`);
  }

  return { options };
}
