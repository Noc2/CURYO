import { getTmdbApiKey } from "~~/lib/env/server";
import { ResponseTooLargeError, readResponseJson, readResponseText } from "~~/utils/fetchBodyLimit";

/**
 * Shared embed resolution logic.
 * Used by /api/thumbnail and /api/url-validation routes.
 */

export interface EmbedResult {
  thumbnailUrl: string | null;
  title?: string;
  description?: string;
  imageUrl?: string;
  authors?: string[];
  releaseYear?: string;
  symbol?: string;
  stars?: number;
  forks?: number;
  language?: string;
}

const CACHE_OPTIONS = { next: { revalidate: 86400 } }; // 24h cache
const MAX_RESPONSE_BYTES = 1024 * 1024; // 1 MB cap on external API responses
const MAX_AUTHORS = 3; // Cap author lookups per book (limits amplification)
const MAX_DESCRIPTION_LENGTH = 500;

/** Fetch JSON with a response-size guard to prevent memory abuse. */
async function safeFetchJson(url: string, options?: RequestInit): Promise<any> {
  try {
    const res = await fetch(url, { ...CACHE_OPTIONS, ...options });
    if (!res.ok) return null;
    return await readResponseJson(res, MAX_RESPONSE_BYTES);
  } catch (error) {
    if (error instanceof ResponseTooLargeError) {
      return null;
    }
    throw error;
  }
}

/** Fetch text with a response-size guard to prevent memory abuse. */
async function safeFetchText(url: string, options?: RequestInit): Promise<string | null> {
  try {
    const res = await fetch(url, { ...CACHE_OPTIONS, ...options });
    if (!res.ok) return null;
    return await readResponseText(res, MAX_RESPONSE_BYTES);
  } catch (error) {
    if (error instanceof ResponseTooLargeError) {
      return null;
    }
    throw error;
  }
}

export async function resolveEmbed(
  type: string,
  id: string | null,
  metadata?: Record<string, unknown>,
): Promise<EmbedResult> {
  if (!id) return { thumbnailUrl: null };

  try {
    switch (type) {
      case "wikipedia":
        return await resolveWikipedia(id);
      case "tmdb":
        return await resolveTmdb(id);
      case "openlibrary":
        return await resolveOpenLibrary(id, metadata);
      case "coingecko":
        return await resolveCoinGecko(id);
      case "huggingface":
        return await resolveHuggingFace(id, metadata);
      case "rawg":
        return await resolveRawg(id);
      case "twitter":
        return await resolveTwitter(id);
      case "github":
        return await resolveGitHub(id);
      default:
        return { thumbnailUrl: null };
    }
  } catch {
    return { thumbnailUrl: null };
  }
}

async function resolveWikipedia(title: string): Promise<EmbedResult> {
  const data = await safeFetchJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
  if (!data) return { thumbnailUrl: null };

  return {
    thumbnailUrl: data?.thumbnail?.source ?? null,
    imageUrl: data?.thumbnail?.source ?? undefined,
    title: data?.title,
    description: (data?.description ?? data?.extract)?.slice(0, MAX_DESCRIPTION_LENGTH),
  };
}

async function resolveTmdb(movieId: string): Promise<EmbedResult> {
  const apiKey = getTmdbApiKey();
  if (!apiKey) {
    console.warn("[thumbnail] TMDB_API_KEY not configured — skipping TMDB lookup");
    return { thumbnailUrl: null };
  }

  const data = await safeFetchJson(`https://api.themoviedb.org/3/movie/${movieId}?api_key=${apiKey}`);
  if (!data) return { thumbnailUrl: null };

  const posterPath = data?.poster_path;
  return {
    thumbnailUrl: posterPath ? `https://image.tmdb.org/t/p/w300${posterPath}` : null,
    imageUrl: posterPath ? `https://image.tmdb.org/t/p/w500${posterPath}` : undefined,
    title: data?.title,
    description: data?.overview?.slice(0, MAX_DESCRIPTION_LENGTH),
    releaseYear: data?.release_date ? data.release_date.split("-")[0] : undefined,
  };
}

async function resolveOpenLibrary(id: string, metadata?: Record<string, unknown>): Promise<EmbedResult> {
  const olType = metadata?.olType === "books" ? "books" : "works";
  let data = await safeFetchJson(`https://openlibrary.org/${olType}/${id}.json`);
  if (!data) return { thumbnailUrl: null };

  // Handle JSON-level redirects for merged/moved works
  if (data.type?.key === "/type/redirect" && data.location) {
    // Validate redirect path starts with a known prefix to prevent path manipulation
    const loc = String(data.location);
    if (!/^\/(works|books|authors)\/OL\d+\w?$/.test(loc)) {
      return { thumbnailUrl: null };
    }
    data = await safeFetchJson(`https://openlibrary.org${loc}.json`);
    if (!data) return { thumbnailUrl: null };
  }

  // Extract description (can be string or { value: string })
  let description: string | undefined;
  if (typeof data.description === "string") {
    description = data.description;
  } else if (data.description?.value) {
    description = data.description.value;
  } else if (typeof data.first_sentence === "string") {
    description = data.first_sentence;
  } else if (data.first_sentence?.value) {
    description = data.first_sentence.value;
  }

  // Extract cover URLs
  const coverId = data.covers?.[0];
  const hasCover = coverId && coverId !== -1;
  const thumbnailUrl = hasCover ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg` : null;
  const imageUrl = hasCover ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg` : undefined;

  // Resolve author names server-side (cap to prevent amplification)
  let authors: string[] | undefined;
  const authorEntries = (data.authors ?? []).slice(0, MAX_AUTHORS);
  if (authorEntries.length > 0) {
    const authorPromises = authorEntries.map(
      async (author: { author?: { key: string }; key?: string; name?: string }) => {
        if (author.name) return author.name;
        const authorKey = author.author?.key || author.key;
        if (!authorKey) return null;
        // Validate author key format to prevent arbitrary fetches
        if (!/^\/authors\/OL\d+A$/.test(authorKey)) return null;
        try {
          const authorData = await safeFetchJson(`https://openlibrary.org${authorKey}.json`);
          return (authorData?.name as string) ?? null;
        } catch {
          return null;
        }
      },
    );
    const resolved = await Promise.all(authorPromises);
    const filtered = resolved.filter((name): name is string => name !== null);
    if (filtered.length > 0) authors = filtered;
  }

  return {
    thumbnailUrl,
    imageUrl,
    title: data.title,
    description: description?.slice(0, MAX_DESCRIPTION_LENGTH),
    authors,
  };
}

async function resolveCoinGecko(coinId: string): Promise<EmbedResult> {
  const data = await safeFetchJson(
    `https://api.coingecko.com/api/v3/coins/${coinId}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false&sparkline=false`,
  );
  if (!data) {
    return {
      thumbnailUrl: null,
      symbol: coinId.toUpperCase().replace(/-/g, ""),
    };
  }

  return {
    thumbnailUrl: data?.image?.small ?? null,
    imageUrl: data?.image?.large ?? undefined,
    title: data?.name,
    symbol: data?.symbol?.toUpperCase(),
  };
}

async function resolveHuggingFace(modelId: string, metadata?: Record<string, unknown>): Promise<EmbedResult> {
  const author = (metadata?.author as string) || modelId.split("/")[0];

  // Fetch model metadata from HuggingFace API
  let title: string | undefined;
  let description: string | undefined;

  try {
    const modelData = await safeFetchJson(`https://huggingface.co/api/models/${encodeURIComponent(modelId)}`);
    if (modelData) {
      title = modelData.modelId ?? modelId;
      const parts: string[] = [];
      if (modelData.pipeline_tag) parts.push(modelData.pipeline_tag.replace(/-/g, " "));
      if (modelData.library_name) parts.push(`(${modelData.library_name})`);
      if (parts.length > 0) description = parts.join(" ");
    }
  } catch {
    // Continue with fallback
  }

  // Fetch org avatar by scraping the org page HTML
  let avatarUrl: string | null = null;
  try {
    const html = await safeFetchText(`https://huggingface.co/${encodeURIComponent(author)}`);
    if (html) {
      const avatarMatch = html.match(/https:\/\/cdn-avatars\.huggingface\.co\/[^"'\s]+/);
      if (avatarMatch) {
        avatarUrl = avatarMatch[0];
      }
    }
  } catch {
    // No avatar available
  }

  return {
    thumbnailUrl: avatarUrl,
    imageUrl: avatarUrl ?? undefined,
    title: title ?? modelId,
    description,
  };
}

async function resolveRawg(slug: string): Promise<EmbedResult> {
  const apiKey = process.env.RAWG_API_KEY;
  if (!apiKey) {
    console.warn("[thumbnail] RAWG_API_KEY not configured — skipping RAWG lookup");
    return { thumbnailUrl: null };
  }

  const data = await safeFetchJson(`https://api.rawg.io/api/games/${slug}?key=${apiKey}`);
  if (!data) return { thumbnailUrl: null };

  return {
    thumbnailUrl: data?.background_image ?? null,
    imageUrl: data?.background_image ?? undefined,
    title: data?.name,
    description: data?.description_raw?.slice(0, 200),
  };
}

async function resolveGitHub(repoSlug: string): Promise<EmbedResult> {
  const data = await safeFetchJson(`https://api.github.com/repos/${repoSlug}`);
  if (!data) return { thumbnailUrl: null };

  return {
    thumbnailUrl: data?.owner?.avatar_url ?? null,
    imageUrl: data?.owner?.avatar_url ?? undefined,
    title: data?.full_name,
    description: data?.description,
    stars: data?.stargazers_count,
    forks: data?.forks_count,
    language: data?.language,
  };
}

function getSyndicationToken(id: string): string {
  return ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, "");
}

async function resolveTwitter(tweetId: string): Promise<EmbedResult> {
  const token = getSyndicationToken(tweetId);
  const data = await safeFetchJson(
    `https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&lang=en&token=${token}`,
  );
  if (!data?.user) return { thumbnailUrl: null };

  return {
    thumbnailUrl: data.user.profile_image_url_https ?? null,
    imageUrl: data.user.profile_image_url_https?.replace("_normal", "_400x400") ?? undefined,
    title: `@${data.user.screen_name}`,
    description: data.text?.slice(0, 200),
  };
}
