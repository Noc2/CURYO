import type { ContentMetadataResult } from "./types";
import { isDirectImageUrl } from "~~/lib/contentMedia";
import { getThumbnailUrl } from "~~/utils/platforms";

const MAX_METADATA_BYTES = 256_000;
const METADATA_TIMEOUT_MS = 3_500;

function isHttpsUrl(url: string): boolean {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

function decodeHtmlAttribute(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function extractMetaTagContent(html: string, propertyName: string): string | null {
  const escapedName = propertyName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const metaPattern = new RegExp(`<meta\\s+[^>]*(?:property|name)=["']${escapedName}["'][^>]*>`, "i");
  const tag = html.match(metaPattern)?.[0];
  if (!tag) return null;

  const content = tag.match(/\scontent=["']([^"']+)["']/i)?.[1];
  return content ? decodeHtmlAttribute(content.trim()) : null;
}

function resolveThumbnailUrl(baseUrl: string, candidate: string | null): string | null {
  if (!candidate) return null;
  try {
    const resolved = new URL(candidate, baseUrl);
    return resolved.protocol === "https:" ? resolved.toString() : null;
  } catch {
    return null;
  }
}

async function readResponsePrefix(response: Response): Promise<string> {
  if (!response.body) return response.text();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (totalBytes < MAX_METADATA_BYTES) {
      const { done, value } = await reader.read();
      if (done || !value) break;

      const remaining = MAX_METADATA_BYTES - totalBytes;
      const chunk = value.length > remaining ? value.slice(0, remaining) : value;
      chunks.push(chunk);
      totalBytes += chunk.length;
      if (value.length > remaining) break;
    }
  } finally {
    reader.cancel().catch(() => {});
  }

  return new TextDecoder().decode(Buffer.concat(chunks));
}

async function resolveGenericPageThumbnail(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": "CuryoBot/1.0 (+https://curyo.xyz)",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(METADATA_TIMEOUT_MS),
    });
    if (!response.ok) return null;

    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (contentType && !contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      return null;
    }

    const html = await readResponsePrefix(response);
    return (
      resolveThumbnailUrl(url, extractMetaTagContent(html, "og:image:secure_url")) ??
      resolveThumbnailUrl(url, extractMetaTagContent(html, "og:image")) ??
      resolveThumbnailUrl(url, extractMetaTagContent(html, "twitter:image"))
    );
  } catch {
    return null;
  }
}

export async function resolveContentMetadata(url: string): Promise<ContentMetadataResult> {
  if (!isHttpsUrl(url)) {
    return { thumbnailUrl: null };
  }

  if (isDirectImageUrl(url)) {
    return { thumbnailUrl: url };
  }

  const platformThumbnail = getThumbnailUrl(url);
  if (platformThumbnail) {
    return { thumbnailUrl: platformThumbnail };
  }

  return { thumbnailUrl: await resolveGenericPageThumbnail(url) };
}

export async function resolveContentMetadataBatch(urls: string[]): Promise<Record<string, ContentMetadataResult>> {
  const uniqueUrls = [...new Set(urls.filter(isHttpsUrl))];
  const entries = await Promise.all(uniqueUrls.map(async url => [url, await resolveContentMetadata(url)] as const));
  return Object.fromEntries(entries);
}
