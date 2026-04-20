import { config } from "./config.js";
import { fetchWithTimeout } from "./utils.js";

interface PonderContentItem {
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
  roundEpochDuration?: number;
  roundMaxDuration?: number;
  roundMinVoters?: number;
  roundMaxVoters?: number;
}

interface PonderRoundItem {
  id: string;
  contentId: string;
  roundId: string;
  state: number;
  voteCount: number;
  revealedCount: number;
  totalStake: string;
  upPool: string;
  downPool: string;
  upCount: number;
  downCount: number;
  upWins: boolean | null;
  settledAt: string | null;
}

export interface PonderVoteItem {
  id: string;
  contentId: string;
  roundId: string;
  voter: string;
  isUp: boolean | null;
  stake: string;
  epochIndex: number;
  revealed: boolean;
  roundState: number | null;
  roundUpWins: boolean | null;
}

interface PonderPage<TItem> {
  items: TItem[];
  total: number;
  limit: number;
  offset: number;
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

async function getAllPages<TItem>(
  loadPage: (offset: number) => Promise<PonderPage<TItem>>,
): Promise<TItem[]> {
  const items: TItem[] = [];
  let offset = 0;

  while (true) {
    const page = await loadPage(offset);
    items.push(...page.items);
    offset += page.items.length;

    if (page.items.length === 0 || offset >= page.total) {
      return items;
    }
  }
}

export const ponder = {
  getContent: (params?: Record<string, string>) =>
    ponderGet<{ items: PonderContentItem[]; total: number; limit: number; offset: number; hasMore: boolean }>(
      "/content",
      params,
    ),

  getContentById: (id: string) =>
    ponderGet<{ content: PonderContentItem }>(`/content/${id}`),

  getRounds: (params?: Record<string, string>) =>
    ponderGet<PonderPage<PonderRoundItem>>("/rounds", params),

  getVotes: (params?: Record<string, string>) =>
    ponderGet<PonderPage<PonderVoteItem> & { settledTotal: number }>("/votes", params),

  getCategories: () =>
    ponderGet<{ items: any[] }>("/categories", { status: "1" }),

  getAllContent(params?: Record<string, string>) {
    return getAllPages(offset =>
      this.getContent({
        ...params,
        limit: "200",
        offset: String(offset),
      }),
    );
  },

  getAllRounds(params?: Record<string, string>) {
    return getAllPages(offset =>
      this.getRounds({
        ...params,
        limit: "200",
        offset: String(offset),
      }),
    );
  },

  getAllVotes(params?: Record<string, string>) {
    return getAllPages(offset =>
      this.getVotes({
        ...params,
        limit: "200",
        offset: String(offset),
      }),
    );
  },

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
