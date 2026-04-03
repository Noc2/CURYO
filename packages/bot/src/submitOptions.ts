export interface SubmitRunOptions {
  category?: string;
  maxSubmissions?: number;
  source?: string;
}

interface SubmitCatalogEntry {
  availability: string;
  categoryId: number;
  categoryName: string;
  sourceName: string;
}

interface ParsedSubmitCommand {
  help?: boolean;
  options: SubmitRunOptions;
}

const SUBMIT_SOURCE_CATALOG: SubmitCatalogEntry[] = [
  { categoryId: 1, categoryName: "YouTube", sourceName: "youtube", availability: "requires YOUTUBE_API_KEY" },
  {
    categoryId: 2,
    categoryName: "Twitch",
    sourceName: "twitch",
    availability: "requires TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET",
  },
  {
    categoryId: 3,
    categoryName: "Magic: The Gathering",
    sourceName: "scryfall",
    availability: "public",
  },
  { categoryId: 4, categoryName: "Movies", sourceName: "tmdb", availability: "requires TMDB_API_KEY" },
  { categoryId: 5, categoryName: "People", sourceName: "wikipedia-people", availability: "public" },
  { categoryId: 6, categoryName: "Games", sourceName: "rawg", availability: "requires RAWG_API_KEY" },
  { categoryId: 7, categoryName: "Books", sourceName: "openlibrary", availability: "public" },
  { categoryId: 8, categoryName: "AI", sourceName: "huggingface", availability: "public" },
  { categoryId: 9, categoryName: "Crypto Tokens", sourceName: "coingecko", availability: "public" },
];

const SUBMIT_CATEGORY_CATALOG = Array.from(
  new Map(
    SUBMIT_SOURCE_CATALOG.map(entry => [
      entry.categoryId,
      { categoryId: entry.categoryId, categoryName: entry.categoryName },
    ]),
  ).values(),
);

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
      `  ${entry.sourceName.padEnd(SUBMIT_SOURCE_NAME_WIDTH)} -> ${entry.categoryName} (${entry.availability})`,
  ).join("\n");

  return `Usage: yarn bot submit [options]

Discover trending content and submit it to ContentRegistry.

Options:
  --category <id|name>       Limit submission to one category (for example: 4, Movies, "Crypto Tokens")
  --source <name>            Limit submission to one source adapter (for example: tmdb, coingecko)
  --max-submissions <count>  Override the per-run submission cap for this execution
  -h, --help                 Show this help

Available categories:
${categories}

Available sources:
${sources}

Examples:
  yarn workspace @curyo/bot submit --category Movies --source tmdb --max-submissions 3
  yarn workspace @curyo/bot submit --category 9 --max-submissions 2`;
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

    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }

    throw new Error(`Unexpected positional argument: ${arg}`);
  }

  return { options };
}
