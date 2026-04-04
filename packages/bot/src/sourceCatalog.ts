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
    categoryId: 1n,
    categoryName: "YouTube",
    sourceName: "youtube",
    strategyName: "youtube",
    supportsSubmit: true,
    supportsVote: true,
  },
  {
    authRequirement: "requires TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET",
    categoryId: 2n,
    categoryName: "Twitch",
    sourceName: "twitch",
    supportsSubmit: true,
    supportsVote: false,
  },
  {
    authRequirement: "public",
    categoryId: 3n,
    categoryName: "Magic: The Gathering",
    sourceName: "scryfall",
    strategyName: "scryfall",
    supportsSubmit: true,
    supportsVote: true,
  },
  {
    authRequirement: "requires TMDB_API_KEY",
    categoryId: 4n,
    categoryName: "Movies",
    sourceName: "tmdb",
    strategyName: "tmdb",
    supportsSubmit: true,
    supportsVote: true,
  },
  {
    authRequirement: "public",
    categoryId: 5n,
    categoryName: "People",
    sourceName: "wikipedia-people",
    strategyName: "wikipedia",
    supportsSubmit: true,
    supportsVote: true,
  },
  {
    authRequirement: "requires RAWG_API_KEY",
    categoryId: 6n,
    categoryName: "Games",
    sourceName: "rawg",
    strategyName: "rawg",
    supportsSubmit: true,
    supportsVote: true,
  },
  {
    authRequirement: "public",
    categoryId: 7n,
    categoryName: "Books",
    sourceName: "openlibrary",
    strategyName: "openlibrary",
    supportsSubmit: true,
    supportsVote: true,
  },
  {
    authRequirement: "public",
    categoryId: 8n,
    categoryName: "AI",
    sourceName: "huggingface",
    strategyName: "huggingface",
    supportsSubmit: true,
    supportsVote: true,
  },
  {
    authRequirement: "public",
    categoryId: 9n,
    categoryName: "Crypto Tokens",
    sourceName: "coingecko",
    strategyName: "coingecko",
    supportsSubmit: true,
    supportsVote: true,
  },
  {
    authRequirement: "submit automation not implemented yet",
    categoryId: 10n,
    categoryName: "Tweets",
    sourceName: "twitter",
    strategyName: "twitter",
    supportsSubmit: false,
    supportsVote: true,
  },
  {
    authRequirement: "requires GITHUB_TOKEN",
    categoryId: 11n,
    categoryName: "GitHub Repos",
    sourceName: "github",
    strategyName: "github",
    supportsSubmit: true,
    supportsVote: true,
  },
  {
    authRequirement: "submit automation not implemented yet",
    categoryId: 12n,
    categoryName: "Spotify Podcasts",
    sourceName: "spotify",
    supportsSubmit: false,
    supportsVote: false,
  },
  {
    authRequirement: "submit automation not implemented yet",
    categoryId: 13n,
    categoryName: "npm Packages",
    sourceName: "npm",
    supportsSubmit: false,
    supportsVote: false,
  },
  {
    authRequirement: "submit automation not implemented yet",
    categoryId: 14n,
    categoryName: "PyPI Packages",
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
  );
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
