interface BotCategoryCatalogEntry {
  authRequirement: string;
  categoryId: bigint;
  categoryName: string;
  sourceName: string;
  strategyName?: string;
  supportsSubmit: boolean;
  supportsVote: boolean;
}

const CATEGORY_CATALOG: readonly BotCategoryCatalogEntry[] = [
  {
    authRequirement: "requires YOUTUBE_API_KEY",
    categoryId: 5n,
    categoryName: "Media",
    sourceName: "youtube",
    strategyName: "youtube",
    supportsSubmit: true,
    supportsVote: true,
  },
  {
    authRequirement: "requires TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET",
    categoryId: 5n,
    categoryName: "Media",
    sourceName: "twitch",
    supportsSubmit: true,
    supportsVote: false,
  },
  {
    authRequirement: "public",
    categoryId: 1n,
    categoryName: "Products",
    sourceName: "scryfall",
    strategyName: "scryfall",
    supportsSubmit: true,
    supportsVote: true,
  },
  {
    authRequirement: "requires TMDB_API_KEY",
    categoryId: 5n,
    categoryName: "Media",
    sourceName: "tmdb",
    strategyName: "tmdb",
    supportsSubmit: true,
    supportsVote: true,
  },
  {
    authRequirement: "public",
    categoryId: 10n,
    categoryName: "General",
    sourceName: "wikipedia-people",
    strategyName: "wikipedia",
    supportsSubmit: true,
    supportsVote: true,
  },
  {
    authRequirement: "requires RAWG_API_KEY",
    categoryId: 1n,
    categoryName: "Products",
    sourceName: "rawg",
    strategyName: "rawg",
    supportsSubmit: true,
    supportsVote: true,
  },
  {
    authRequirement: "public",
    categoryId: 5n,
    categoryName: "Media",
    sourceName: "openlibrary",
    strategyName: "openlibrary",
    supportsSubmit: true,
    supportsVote: true,
  },
  {
    authRequirement: "public",
    categoryId: 7n,
    categoryName: "AI Answers",
    sourceName: "huggingface",
    strategyName: "huggingface",
    supportsSubmit: true,
    supportsVote: true,
  },
  {
    authRequirement: "public",
    categoryId: 1n,
    categoryName: "Products",
    sourceName: "coingecko",
    strategyName: "coingecko",
    supportsSubmit: true,
    supportsVote: true,
  },
  {
    authRequirement: "submit automation not implemented yet",
    categoryId: 5n,
    categoryName: "Media",
    sourceName: "twitter",
    strategyName: "twitter",
    supportsSubmit: false,
    supportsVote: true,
  },
  {
    authRequirement: "requires GITHUB_TOKEN",
    categoryId: 8n,
    categoryName: "Developer Docs",
    sourceName: "github",
    strategyName: "github",
    supportsSubmit: true,
    supportsVote: true,
  },
  {
    authRequirement: "submit automation not implemented yet",
    categoryId: 5n,
    categoryName: "Media",
    sourceName: "spotify",
    supportsSubmit: false,
    supportsVote: false,
  },
  {
    authRequirement: "submit automation not implemented yet",
    categoryId: 8n,
    categoryName: "Developer Docs",
    sourceName: "npm",
    supportsSubmit: false,
    supportsVote: false,
  },
  {
    authRequirement: "submit automation not implemented yet",
    categoryId: 8n,
    categoryName: "Developer Docs",
    sourceName: "pypi",
    supportsSubmit: false,
    supportsVote: false,
  },
];

export function getCategoryCoverageCatalog(): readonly BotCategoryCatalogEntry[] {
  return CATEGORY_CATALOG;
}

export function getSubmitSourceCatalog(): readonly BotCategoryCatalogEntry[] {
  return CATEGORY_CATALOG.filter(entry => entry.supportsSubmit);
}

export function getSubmitCategoryCatalog(): readonly Pick<BotCategoryCatalogEntry, "categoryId" | "categoryName">[] {
  return Array.from(
    new Map(
      getSubmitSourceCatalog().map(entry => [
        entry.categoryId.toString(),
        { categoryId: entry.categoryId, categoryName: entry.categoryName },
      ]),
    ).values(),
  ).sort((a, b) => Number(a.categoryId - b.categoryId));
}

export function getPendingSubmitCoverageCatalog(): readonly BotCategoryCatalogEntry[] {
  return CATEGORY_CATALOG.filter(entry => !entry.supportsSubmit);
}

export function getVoteStrategyCatalog(): readonly Required<Pick<BotCategoryCatalogEntry, "categoryId" | "categoryName" | "sourceName" | "strategyName">>[] {
  return CATEGORY_CATALOG.filter(
    (entry): entry is BotCategoryCatalogEntry & { strategyName: string } => entry.supportsVote && Boolean(entry.strategyName),
  ).map(entry => ({
    categoryId: entry.categoryId,
    categoryName: entry.categoryName,
    sourceName: entry.sourceName,
    strategyName: entry.strategyName,
  }));
}
