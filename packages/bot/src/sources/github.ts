import { config, log } from "../config.js";
import { truncateContentDescription, truncateContentTitle } from "../contentLimits.js";
import {
  classifyGitHubRepo,
  createGitHubApiHeaders,
  formatGitHubRepoDescription,
  type GitHubRepoMetadata,
} from "../github.js";
import { fetchWithTimeout } from "../utils.js";
import type { ContentItem, ContentSource } from "./types.js";

const CATEGORY_ID = 7n;
const SEARCH_WINDOW_DAYS = 30;

interface GitHubSearchResponse {
  items?: GitHubRepoMetadata[];
}

function buildTrendingGitHubQuery(limit: number): string {
  const pushedAfter = new Date(Date.now() - SEARCH_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const params = new URLSearchParams({
    order: "desc",
    per_page: String(Math.min(Math.max(limit * 4, limit), 50)),
    q: `archived:false fork:false is:public stars:>=200 pushed:>=${pushedAfter}`,
    sort: "updated",
  });

  return `https://api.github.com/search/repositories?${params.toString()}`;
}

export const githubSource: ContentSource = {
  name: "github",
  categoryId: CATEGORY_ID,
  categoryName: "Documentation and Developer Help",

  async fetchTrending(limit: number): Promise<ContentItem[]> {
    if (!config.githubToken) {
      log.debug("GitHub source skipped: GITHUB_TOKEN not set");
      return [];
    }

    try {
      const res = await fetchWithTimeout(buildTrendingGitHubQuery(limit), 15_000, {
        headers: createGitHubApiHeaders(config.githubToken),
      });
      if (!res.ok) {
        log.warn(`GitHub API error: ${res.status} ${res.statusText}`);
        return [];
      }

      const data = (await res.json()) as GitHubSearchResponse;
      const items: ContentItem[] = [];
      const seenUrls = new Set<string>();

      for (const repo of data.items ?? []) {
        if (!repo.html_url || !repo.full_name || seenUrls.has(repo.html_url)) {
          continue;
        }

        seenUrls.add(repo.html_url);
        items.push({
          url: repo.html_url,
          title: truncateContentTitle(repo.full_name),
          description: truncateContentDescription(formatGitHubRepoDescription(repo)),
          tags: classifyGitHubRepo(repo),
          categoryId: CATEGORY_ID,
        });

        if (items.length >= limit) {
          break;
        }
      }

      return items;
    } catch (err: any) {
      log.warn(`GitHub source error: ${err.message}`);
      return [];
    }
  },
};
