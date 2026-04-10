import { eq, inArray } from "drizzle-orm";
import { db } from "~~/lib/db";
import { type ContentMetadata, contentMetadata } from "~~/lib/db/schema";
import { detectPlatform, getThumbnailUrl } from "~~/utils/platforms";
import { type EmbedResult, resolveEmbed } from "~~/utils/resolveEmbed";

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const IMAGE_REQUIRED_CACHE_TYPES = new Set(["coingecko", "huggingface"]);

function toEmbedResult(cached: ContentMetadata): EmbedResult {
  return {
    thumbnailUrl: cached.thumbnailUrl,
    ...(cached.title && { title: cached.title }),
    ...(cached.description && { description: cached.description }),
    ...(cached.imageUrl && { imageUrl: cached.imageUrl }),
    ...(cached.authors && { authors: JSON.parse(cached.authors) }),
    ...(cached.releaseYear && { releaseYear: cached.releaseYear }),
    ...(cached.symbol && { symbol: cached.symbol }),
    ...(cached.stars != null && { stars: cached.stars }),
    ...(cached.forks != null && { forks: cached.forks }),
    ...(cached.language && { language: cached.language }),
  };
}

function getTimestampMs(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

export function shouldReuseCachedContentMetadata(
  url: string,
  cached: Pick<ContentMetadata, "thumbnailUrl" | "imageUrl" | "fetchedAt">,
  nowMs = Date.now(),
): boolean {
  if (nowMs - getTimestampMs(cached.fetchedAt) >= CACHE_TTL_MS) {
    return false;
  }

  const platform = detectPlatform(url);
  if (IMAGE_REQUIRED_CACHE_TYPES.has(platform.type) && !cached.thumbnailUrl && !cached.imageUrl) {
    return false;
  }

  return true;
}

function isHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

async function persistContentMetadata(url: string, result: EmbedResult) {
  if (!result.thumbnailUrl && !result.title && !result.description) {
    return;
  }

  try {
    await db
      .insert(contentMetadata)
      .values({
        url,
        thumbnailUrl: result.thumbnailUrl,
        title: result.title ?? null,
        description: result.description ?? null,
        imageUrl: result.imageUrl ?? null,
        authors: result.authors ? JSON.stringify(result.authors) : null,
        releaseYear: result.releaseYear ?? null,
        symbol: result.symbol ?? null,
        stars: result.stars ?? null,
        forks: result.forks ?? null,
        language: result.language ?? null,
        fetchedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: contentMetadata.url,
        set: {
          thumbnailUrl: result.thumbnailUrl,
          title: result.title ?? null,
          description: result.description ?? null,
          imageUrl: result.imageUrl ?? null,
          authors: result.authors ? JSON.stringify(result.authors) : null,
          releaseYear: result.releaseYear ?? null,
          symbol: result.symbol ?? null,
          stars: result.stars ?? null,
          forks: result.forks ?? null,
          language: result.language ?? null,
          fetchedAt: new Date(),
        },
      });
  } catch (error) {
    console.warn("[thumbnail] cache write failed:", error);
  }
}

async function resolveFreshContentMetadata(url: string): Promise<EmbedResult> {
  const staticThumbnail = getThumbnailUrl(url);
  if (staticThumbnail) {
    return { thumbnailUrl: staticThumbnail };
  }

  const info = detectPlatform(url);
  const result = await resolveEmbed(info.type, info.id, info.metadata);
  await persistContentMetadata(url, result);
  return result;
}

export async function resolveContentMetadata(url: string): Promise<EmbedResult> {
  if (!isHttpUrl(url)) {
    return { thumbnailUrl: null };
  }

  try {
    const [cached] = await db.select().from(contentMetadata).where(eq(contentMetadata.url, url)).limit(1);
    if (cached && shouldReuseCachedContentMetadata(url, cached)) {
      return toEmbedResult(cached);
    }
  } catch (error) {
    console.warn("[thumbnail] cache read failed, falling through to resolver:", error);
  }

  return resolveFreshContentMetadata(url);
}

export async function resolveContentMetadataBatch(urls: string[]): Promise<Record<string, EmbedResult>> {
  const uniqueUrls = [...new Set(urls.filter(isHttpUrl))];
  const results: Record<string, EmbedResult> = {};

  if (uniqueUrls.length === 0) {
    return results;
  }

  const unresolved = new Set<string>();

  for (const url of uniqueUrls) {
    const staticThumbnail = getThumbnailUrl(url);
    if (staticThumbnail) {
      results[url] = { thumbnailUrl: staticThumbnail };
    } else {
      unresolved.add(url);
    }
  }

  if (unresolved.size === 0) {
    return results;
  }

  try {
    const cachedRows = await db
      .select()
      .from(contentMetadata)
      .where(inArray(contentMetadata.url, [...unresolved]));
    for (const cached of cachedRows) {
      if (!shouldReuseCachedContentMetadata(cached.url, cached)) continue;
      results[cached.url] = toEmbedResult(cached);
      unresolved.delete(cached.url);
    }
  } catch (error) {
    console.warn("[thumbnail] batch cache read failed, falling through to resolver:", error);
  }

  if (unresolved.size === 0) {
    return results;
  }

  const resolved = await Promise.all(
    [...unresolved].map(async url => {
      try {
        return [url, await resolveFreshContentMetadata(url)] as const;
      } catch {
        return [url, { thumbnailUrl: null } satisfies EmbedResult] as const;
      }
    }),
  );

  for (const [url, result] of resolved) {
    results[url] = result;
  }

  return results;
}
