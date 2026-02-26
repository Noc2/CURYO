import type { RatingStrategy } from "./types.js";

function extractWikipediaTitle(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith("wikipedia.org")) return null;
    const match = parsed.pathname.match(/^\/wiki\/(.+)/);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

// WikiProject quality assessment grades → score
const GRADE_SCORES: Record<string, number> = {
  FA: 10, // Featured Article
  GA: 8, // Good Article
  A: 7,
  B: 6,
  C: 4,
  Start: 2,
  Stub: 1,
};

export const wikipediaStrategy: RatingStrategy = {
  name: "wikipedia",

  canRate: (url) => extractWikipediaTitle(url) !== null,

  async getScore(url) {
    const title = extractWikipediaTitle(url);
    if (!title) return null;

    // Try WikiProject quality assessment first
    try {
      const res = await fetch(
        `https://en.wikipedia.org/w/api.php?action=query&prop=pageassessments&titles=${encodeURIComponent(title)}&format=json`,
      );
      if (res.ok) {
        const data = await res.json();
        const pages = data.query?.pages ?? {};
        const page = Object.values(pages)[0] as any;
        const assessments = page?.pageassessments ?? {};

        // Find the highest quality grade across all WikiProjects
        let bestScore = 0;
        for (const project of Object.values(assessments) as any[]) {
          const grade = project.class;
          if (grade && GRADE_SCORES[grade] && GRADE_SCORES[grade] > bestScore) {
            bestScore = GRADE_SCORES[grade];
          }
        }

        if (bestScore > 0) return bestScore;
      }
    } catch {
      // Fall through to pageviews
    }

    // Fallback: use pageview count (log scale)
    try {
      const end = new Date();
      const start = new Date(Date.now() - 30 * 86400000); // 30 days ago
      const fmt = (d: Date) =>
        `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;

      const res = await fetch(
        `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/all-agents/${encodeURIComponent(title)}/monthly/${fmt(start)}/${fmt(end)}`,
      );
      if (!res.ok) return null;

      const data = await res.json();
      const totalViews = (data.items ?? []).reduce(
        (sum: number, item: any) => sum + (item.views ?? 0),
        0,
      );

      if (totalViews === 0) return null;

      // Log scale: 100 views → 2, 1K → 3, 10K → 4, 100K → 5, 1M → 6, 10M → 7
      return Math.min(10, Math.max(0, Math.log10(totalViews) - 1));
    } catch {
      return null;
    }
  },
};
