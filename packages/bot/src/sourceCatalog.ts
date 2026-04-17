interface BotCategoryCatalogEntry {
  authRequirement: string;
  categoryId: bigint;
  categoryName: string;
  sourceName: string;
  strategyName?: string;
}

const CATEGORY_CATALOG: readonly BotCategoryCatalogEntry[] = [
  {
    authRequirement: "requires YOUTUBE_API_KEY",
    categoryId: 5n,
    categoryName: "Media",
    sourceName: "youtube",
    strategyName: "youtube",
  },
];

export function getSubmitSourceCatalog(): readonly BotCategoryCatalogEntry[] {
  return CATEGORY_CATALOG;
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

export function getVoteStrategyCatalog(): readonly Required<Pick<BotCategoryCatalogEntry, "categoryId" | "categoryName" | "sourceName" | "strategyName">>[] {
  return CATEGORY_CATALOG.filter(
    (entry): entry is BotCategoryCatalogEntry & { strategyName: string } => Boolean(entry.strategyName),
  ).map(entry => ({
    categoryId: entry.categoryId,
    categoryName: entry.categoryName,
    sourceName: entry.sourceName,
    strategyName: entry.strategyName,
  }));
}
