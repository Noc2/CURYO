import { config } from "./config.js";
import { fetchWithTimeout } from "./utils.js";

export interface PonderContentItem {
  id: string;
  submitter: string;
  url: string;
  title: string;
  description: string;
  tags: string;
  categoryId: string;
  status: number;
  rating: number;
  createdAt: string;
  totalVotes: number;
  totalRounds: number;
}

function getPonderBaseUrl(): string {
  if (!config.ponderUrl) {
    throw new Error("PONDER_URL is required");
  }

  return config.ponderUrl;
}

async function ponderGet<T>(path: string, params?: Record<string, string | undefined>): Promise<T> {
  const url = new URL(`${getPonderBaseUrl()}${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(key, value);
    }
  }
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`Ponder ${res.status}: ${res.statusText}`);
  return res.json();
}

export const ponder = {
  getContent: (params?: Record<string, string>) =>
    ponderGet<{ items: PonderContentItem[]; total: number }>("/content", params),

  getContentById: (id: string) =>
    ponderGet<{ content: PonderContentItem }>(`/content/${id}`),

  getCategories: () =>
    ponderGet<{ items: any[] }>("/categories", { status: "1" }),

  async isAvailable(): Promise<boolean> {
    if (!config.ponderUrl) {
      return false;
    }

    try {
      await fetchWithTimeout(`${config.ponderUrl}/content?limit=1`, 5_000);
      return true;
    } catch {
      return false;
    }
  },
};
