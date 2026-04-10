import { eq, inArray } from "drizzle-orm";
import { getSafeHuggingFaceImageUrl } from "~~/lib/content/huggingFaceImage";
import { db } from "~~/lib/db";
import { type ContentMetadata, contentMetadata } from "~~/lib/db/schema";
import { detectPlatform, getThumbnailUrl } from "~~/utils/platforms";
import { type EmbedResult, resolveEmbed } from "~~/utils/resolveEmbed";

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const IMAGE_REQUIRED_CACHE_TYPES = new Set(["coingecko", "huggingface"]);

function sanitizeEmbedResultForUrl(url: string, result: EmbedResult): EmbedResult {
  if (detectPlatform(url).type !== "huggingface") {
    return result;
  }

  const thumbnailUrl = getSafeHuggingFaceImageUrl(result.thumbnailUrl);
  const imageUrl = getSafeHuggingFaceImageUrl(result.imageUrl);
  const sanitized: EmbedResult = {
    ...result,
    thumbnailUrl,
  };

  if (imageUrl) {
    sanitized.imageUrl = imageUrl;
  } else {
    delete sanitized.imageUrl;
  }

  return sanitized;
}

function toEmbedResult(cached: ContentMetadata): EmbedResult {
  return sanitizeEmbedResultForUrl(cached.url, {
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
  });
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
  const hasUsableImage =
    platform.type === "huggingface"
      ? Boolean(getSafeHuggingFaceImageUrl(cached.thumbnailUrl) || getSafeHuggingFaceImageUrl(cached.imageUrl))
      : Boolean(cached.thumbnailUrl || cached.imageUrl);

  if (IMAGE_REQUIRED_CACHE_TYPES.has(platform.type) && !hasUsableImage) {
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
  const sanitizedResult = sanitizeEmbedResultForUrl(url, result);

  if (!sanitizedResult.thumbnailUrl && !sanitizedResult.title && !sanitizedResult.description) {
    return;
  }

  try {
    await db
      .insert(contentMetadata)
      .values({
        url,
        thumbnailUrl: sanitizedResult.thumbnailUrl,
        title: sanitizedResult.title ?? null,
        description: sanitizedResult.description ?? null,
        imageUrl: sanitizedResult.imageUrl ?? null,
        authors: sanitizedResult.authors ? JSON.stringify(sanitizedResult.authors) : null,
        releaseYear: sanitizedResult.releaseYear ?? null,
        symbol: sanitizedResult.symbol ?? null,
        stars: sanitizedResult.stars ?? null,
        forks: sanitizedResult.forks ?? null,
        language: sanitizedResult.language ?? null,
        fetchedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: contentMetadata.url,
        set: {
          thumbnailUrl: sanitizedResult.thumbnailUrl,
          title: sanitizedResult.title ?? null,
          description: sanitizedResult.description ?? null,
          imageUrl: sanitizedResult.imageUrl ?? null,
          authors: sanitizedResult.authors ? JSON.stringify(sanitizedResult.authors) : null,
          releaseYear: sanitizedResult.releaseYear ?? null,
          symbol: sanitizedResult.symbol ?? null,
          stars: sanitizedResult.stars ?? null,
          forks: sanitizedResult.forks ?? null,
          language: sanitizedResult.language ?? null,
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
  const sanitizedResult = sanitizeEmbedResultForUrl(url, result);
  await persistContentMetadata(url, sanitizedResult);
  return sanitizedResult;
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
