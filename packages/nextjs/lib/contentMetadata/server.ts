import type { ContentMetadataResult } from "./types";
import { isDirectImageUrl } from "~~/lib/contentMedia";
import { getThumbnailUrl } from "~~/utils/platforms";

function isHttpsUrl(url: string): boolean {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

export async function resolveContentMetadata(url: string): Promise<ContentMetadataResult> {
  if (!isHttpsUrl(url)) {
    return { thumbnailUrl: null };
  }

  if (isDirectImageUrl(url)) {
    return { thumbnailUrl: url };
  }

  return { thumbnailUrl: getThumbnailUrl(url) };
}

export async function resolveContentMetadataBatch(urls: string[]): Promise<Record<string, ContentMetadataResult>> {
  const uniqueUrls = [...new Set(urls.filter(isHttpsUrl))];
  const entries = await Promise.all(uniqueUrls.map(async url => [url, await resolveContentMetadata(url)] as const));
  return Object.fromEntries(entries);
}
