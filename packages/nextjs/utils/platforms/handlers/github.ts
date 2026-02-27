import type { PlatformHandler, PlatformInfo } from "../types";

/**
 * Extract owner/repo from GitHub repository URLs.
 * Supported formats:
 *  - https://github.com/ethereum/go-ethereum
 *  - https://www.github.com/facebook/react
 *  - https://github.com/owner/repo/tree/main/src (deep paths still resolve to owner/repo)
 */
function extractGitHubRepo(url: string): { owner: string; repo: string } | null {
  try {
    const parsed = new URL(url);

    if (!parsed.hostname.endsWith("github.com")) {
      return null;
    }

    // Match /{owner}/{repo} path segments
    const pathMatch = parsed.pathname.match(/^\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/);
    if (!pathMatch) return null;

    const owner = pathMatch[1];
    const repo = pathMatch[2];

    // Exclude GitHub site pages that aren't repositories
    const reservedPaths = new Set([
      "settings",
      "explore",
      "topics",
      "trending",
      "collections",
      "sponsors",
      "issues",
      "pulls",
      "marketplace",
      "features",
      "enterprise",
      "pricing",
      "login",
      "signup",
      "join",
      "organizations",
      "notifications",
      "new",
      "about",
      "contact",
      "security",
      "customer-stories",
    ]);
    if (reservedPaths.has(owner)) return null;

    return { owner, repo };
  } catch {
    return null;
  }
}

export const githubHandler: PlatformHandler = {
  matches(url: string): boolean {
    return extractGitHubRepo(url) !== null;
  },

  extract(url: string): PlatformInfo {
    const result = extractGitHubRepo(url);

    return {
      type: "github",
      id: result ? `${result.owner}/${result.repo}` : null,
      url,
      thumbnailUrl: null, // Fetched async via /api/thumbnail
      embedUrl: null,
      metadata: result ? { owner: result.owner, repo: result.repo } : undefined,
    };
  },

  getThumbnail(): string | null {
    return null;
  },

  getEmbedUrl(): string | null {
    return null;
  },

  getCanonicalUrl(url: string): string {
    const result = extractGitHubRepo(url);
    return result ? `https://github.com/${result.owner}/${result.repo}` : url;
  },
};
