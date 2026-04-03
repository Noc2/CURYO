import { config } from "../config.js";
import {
  calculateGitHubRepoScore,
  createGitHubApiHeaders,
  extractGitHubRepo,
  type GitHubRepoMetadata,
} from "../github.js";
import { fetchWithTimeout } from "../utils.js";
import type { RatingStrategy } from "./types.js";

export const githubStrategy: RatingStrategy = {
  name: "github",

  canRate: (url: string) => extractGitHubRepo(url) !== null,

  async getScore(url: string): Promise<number | null> {
    const repo = extractGitHubRepo(url);
    if (!repo || !config.githubToken) {
      return null;
    }

    try {
      const res = await fetchWithTimeout(`https://api.github.com/repos/${repo.owner}/${repo.repo}`, 15_000, {
        headers: createGitHubApiHeaders(config.githubToken),
      });
      if (!res.ok) {
        return null;
      }

      const data = (await res.json()) as GitHubRepoMetadata;
      return calculateGitHubRepoScore(data);
    } catch {
      return null;
    }
  },
};
