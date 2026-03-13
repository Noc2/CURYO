import type { PlatformHandler, PlatformInfo } from "../types";
import { matchesHostname } from "~~/utils/urlHosts";

/**
 * Extract work or edition ID from Open Library URL formats.
 * Supported formats:
 *  - https://openlibrary.org/works/OL45883W/Fantastic_Mr_Fox
 *  - https://openlibrary.org/works/OL45883W
 *  - https://openlibrary.org/books/OL7353617M/Fantastic_Mr._Fox
 */
function extractOpenLibraryId(url: string): { type: "works" | "books"; id: string } | null {
  try {
    const parsed = new URL(url);

    if (!matchesHostname(parsed.hostname, "openlibrary.org")) {
      return null;
    }

    // Match /works/{workId} or /books/{editionId}
    const worksMatch = parsed.pathname.match(/^\/works\/(OL\d+W)/);
    if (worksMatch) {
      return { type: "works", id: worksMatch[1] };
    }

    const booksMatch = parsed.pathname.match(/^\/books\/(OL\d+M)/);
    if (booksMatch) {
      return { type: "books", id: booksMatch[1] };
    }

    return null;
  } catch {
    return null;
  }
}

export const openLibraryHandler: PlatformHandler = {
  matches(url: string): boolean {
    return extractOpenLibraryId(url) !== null;
  },

  extract(url: string): PlatformInfo {
    const result = extractOpenLibraryId(url);

    return {
      type: "openlibrary",
      id: result ? result.id : null,
      url,
      thumbnailUrl: null, // Resolved later by shared metadata enrichment or the embed fallback fetch
      embedUrl: null, // No iframe embed for Open Library
      metadata: result ? { olId: result.id, olType: result.type } : undefined,
    };
  },

  getThumbnail(info: PlatformInfo): string | null {
    if (!info.id) return null;
    // Edition IDs (OL*M) work reliably with the covers API
    // Work IDs (OL*W) often return a 1x1 pixel placeholder, so skip those
    if (info.id.endsWith("M")) {
      return `https://covers.openlibrary.org/b/olid/${info.id}-M.jpg`;
    }
    return null;
  },

  getEmbedUrl(): string | null {
    // Open Library doesn't support iframe embedding
    return null;
  },

  getCanonicalUrl(url: string): string {
    const result = extractOpenLibraryId(url);
    return result ? `https://openlibrary.org/${result.type}/${result.id}` : url;
  },
};
