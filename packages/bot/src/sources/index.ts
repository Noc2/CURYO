import type { ContentSource } from "./types.js";
import { youtubeSource } from "./youtube.js";
import { getSubmitSourceCatalog } from "../sourceCatalog.js";

const sourceImplementations = {
  youtube: youtubeSource,
} satisfies Record<string, ContentSource>;

const allSources: ContentSource[] = getSubmitSourceCatalog().map(entry => {
  const source = sourceImplementations[entry.sourceName as keyof typeof sourceImplementations];
  if (!source) {
    throw new Error(`Missing source implementation for ${entry.sourceName}`);
  }

  return source;
});

export function getAllSources(): ContentSource[] {
  return allSources;
}
