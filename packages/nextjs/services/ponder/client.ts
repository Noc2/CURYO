import type { RoundState } from "@curyo/contracts/protocol";

const isProduction = process.env.NODE_ENV === "production";

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function isLocalhostHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function getPonderUrl(): string {
  const rawValue = readEnv("NEXT_PUBLIC_PONDER_URL") ?? (!isProduction ? "http://localhost:42069" : undefined);

  if (!rawValue) {
    throw new Error("NEXT_PUBLIC_PONDER_URL is required in production.");
  }

  let url: URL;
  try {
    url = new URL(rawValue);
  } catch {
    throw new Error("NEXT_PUBLIC_PONDER_URL must be a valid URL.");
  }

  if (isProduction && isLocalhostHostname(url.hostname)) {
    throw new Error("NEXT_PUBLIC_PONDER_URL must not point to localhost in production.");
  }

  return url.toString().replace(/\/$/, "");
}

const PONDER_URL = getPonderUrl();

let cachedAvailability: boolean | null = null;
let cacheExpiry = 0;
let availabilityPromise: Promise<boolean> | null = null;

const HEALTH_CHECK_TIMEOUT = 2000;
const CACHE_DURATION = 30_000;

export async function isPonderAvailable(): Promise<boolean> {
  if (cachedAvailability !== null && Date.now() < cacheExpiry) {
    return cachedAvailability;
  }

  if (availabilityPromise) {
    return availabilityPromise;
  }

  availabilityPromise = (async () => {
    try {
      const res = await fetch(`${PONDER_URL}/health`, {
        signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT),
      });
      cachedAvailability = res.ok;
    } catch {
      cachedAvailability = false;
    } finally {
      cacheExpiry = Date.now() + CACHE_DURATION;
      availabilityPromise = null;
    }

    return cachedAvailability;
  })();

  return availabilityPromise;
}

export function invalidatePonderCache() {
  cachedAvailability = null;
  cacheExpiry = 0;
  availabilityPromise = null;
}

export async function ponderGet<T>(path: string, params?: Record<string, string | undefined>): Promise<T> {
  const url = new URL(`${PONDER_URL}${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        url.searchParams.set(key, value);
      }
    }
  }
  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Ponder request failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

// ============================================================
// Typed API methods
// ============================================================

export interface PonderContentItem {
  id: string; // bigint serialized as string
  submitter: string;
  contentHash: string;
  url: string;
  title: string;
  description: string;
  tags: string;
  categoryId: string;
  status: number;
  rating: number;
  submitterStakeReturned: boolean;
  createdAt: string;
  lastActivityAt: string;
  dormantCount: number;
  reviver: string | null;
  totalVotes: number;
  totalRounds: number;
}

export interface PonderContentResponse {
  items: PonderContentItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface PonderContentQuery {
  [key: string]: string | undefined;
  categoryId?: string;
  contentIds?: string;
  limit?: string;
  offset?: string;
  search?: string;
  sortBy?: string;
  status?: string;
  submitter?: string;
}

export interface PonderRoundItem {
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
  losingPool: string | null;
  startTime: string | null;
  settledAt: string | null;
  title: string | null;
  description: string | null;
  url: string | null;
  submitter: string | null;
  categoryId: string | null;
}

export interface PonderRoundsResponse {
  items: PonderRoundItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface PonderRatingChange {
  id: string;
  contentId: string;
  oldRating: number;
  newRating: number;
  timestamp: string;
}

export interface PonderCategory {
  id: string;
  name: string;
  domain: string;
  submitter: string;
  status: number;
  proposalId: string | null;
  createdAt: string;
  totalVotes: number;
  totalContent: number;
}

export interface PonderProfile {
  address: string;
  name: string;
  imageUrl: string;
  strategy: string;
  createdAt: string;
  updatedAt: string;
  totalVotes: number;
  totalContent: number;
  totalRewardsClaimed: string;
}

export interface PonderProfileSummary {
  totalVotes: number;
  totalContent: number;
  totalRewardsClaimed: string;
}

export interface PonderProfileSubmissionItem {
  id: string;
  submitter: string;
  url: string;
  title: string;
  description: string;
  categoryId: string;
  categoryName: string | null;
  status: number;
  rating: number;
  createdAt: string;
  totalVotes: number;
  totalRounds: number;
}

export interface PonderDiscoverSignalsSettlingItem {
  id: string;
  contentId: string;
  roundId: string;
  title: string;
  description: string;
  url: string;
  submitter: string;
  categoryId: string;
  roundStartTime: string | null;
  estimatedSettlementTime: string | null;
  profileName: string | null;
  profileImageUrl: string | null;
  source: "watched" | "voted" | "watched_voted";
}

export interface PonderDiscoverSignalsSubmissionItem {
  contentId: string;
  title: string;
  description: string;
  url: string;
  createdAt: string;
  categoryId: string;
  submitter: string;
  profileName: string | null;
  profileImageUrl: string | null;
}

export interface PonderDiscoverSignalsResolutionItem {
  id: string;
  contentId: string;
  roundId: string;
  voter: string;
  isUp: boolean | null;
  title: string;
  description: string;
  url: string;
  settledAt: string | null;
  roundState: RoundState | null;
  roundUpWins: boolean | null;
  profileName: string | null;
  profileImageUrl: string | null;
  outcome: "won" | "lost" | "cancelled" | "tied" | "reveal_failed" | "resolved";
}

export interface PonderDiscoverSignalsResponse {
  settlingSoon: PonderDiscoverSignalsSettlingItem[];
  followedSubmissions: PonderDiscoverSignalsSubmissionItem[];
  followedResolutions: PonderDiscoverSignalsResolutionItem[];
}

export interface PonderFeaturedTodayItem {
  id: string;
  contentId: string;
  roundId: string;
  title: string;
  description: string;
  url: string;
  submitter: string;
  categoryId: string;
  voteCount: number;
  totalStake: string;
  roundStartTime: string | null;
  profileName: string | null;
  profileImageUrl: string | null;
  featuredReason: string;
}

export interface PonderSubmissionStakes {
  activeCount: number;
  submitter: string;
}

export interface PonderVotingStakes {
  activeStake: string;
  activeCount: number;
  voter: string;
}

export interface PonderRewardClaim {
  id: string;
  contentId: string;
  epochId: string | null;
  voter: string;
  stakeReturned: string;
  crepReward: string;
  claimedAt: string;
}

export interface PonderTokenTransfer {
  id: string;
  from: string;
  to: string;
  amount: string;
  blockNumber: string;
  timestamp: string;
}

export interface PonderTokenHolder {
  address: string;
  firstSeenAt: string;
}

export interface PonderTokenHoldersResponse {
  items: PonderTokenHolder[];
  total: number;
  limit: number;
  offset: number;
}

export interface PonderSubmitterRewardClaim {
  id: string;
  contentId: string;
  roundId: string;
  epochId: string | null;
  source: string;
  submitter: string;
  crepAmount: string;
  claimedAt: string;
}

export interface PonderVoterStats {
  voter: string;
  totalSettledVotes: number;
  totalWins: number;
  totalLosses: number;
  totalStakeWon: string;
  totalStakeLost: string;
  currentStreak: number;
  bestWinStreak: number;
  winRate: number;
}

export interface PonderVoterCategoryStats {
  id: string;
  voter: string;
  categoryId: string;
  totalSettledVotes: number;
  totalWins: number;
  totalLosses: number;
  totalStakeWon: string;
  totalStakeLost: string;
  categoryName: string | null;
  winRate: number;
}

export interface PonderAccuracyLeaderboardItem {
  voter: string;
  totalSettledVotes: number;
  totalWins: number;
  totalLosses: number;
  totalStakeWon: string;
  totalStakeLost: string;
  currentStreak?: number;
  bestWinStreak?: number;
  profileName: string | null;
  profileImageUrl: string | null;
  winRate: number;
}

export type PonderAccuracyLeaderboardWindow = "all" | "7d" | "30d" | "365d" | "season";

export interface PonderAccuracyLeaderboardResponse {
  items: PonderAccuracyLeaderboardItem[];
  categoryId?: string;
  window: PonderAccuracyLeaderboardWindow;
  startsAt: string | null;
  endsAt: string | null;
}

export interface PonderVoteItem {
  id: string;
  contentId: string;
  roundId: string;
  voter: string;
  isUp: boolean | null; // null until revealed
  stake: string;
  epochIndex: number; // 0=epoch-1 (100% weight), 1=epoch-2+ (25% weight)
  revealed: boolean;
  committedAt: string;
  revealedAt: string | null;
  roundStartTime: string | null;
  roundState: RoundState | null;
  roundUpWins: boolean | null;
}

export interface PonderVotesResponse {
  items: PonderVoteItem[];
  limit: number;
  offset: number;
  settledTotal: number;
  total: number;
}

export interface PonderProfileDetailResponse {
  profile: PonderProfile | null;
  summary: PonderProfileSummary;
  recentVotes: PonderVoteItem[];
  recentRewards: PonderRewardClaim[];
  recentSubmissions: PonderProfileSubmissionItem[];
}

export interface PonderVoterStreak {
  currentDailyStreak: number;
  bestDailyStreak: number;
  totalActiveDays: number;
  lastActiveDate: string | null;
  lastMilestoneDay: number;
  milestones: Array<{
    days: number;
    baseBonus: number;
  }>;
  nextMilestone: number | null;
  nextMilestoneBaseBonus: number | null;
}

export type PonderVoterStatsBatch = Record<string, PonderVoterStats>;

const PONDER_PAGE_LIMIT = 200;

async function getAllPages<TItem>(fetchPage: (offset: number) => Promise<{ items: TItem[] }>): Promise<TItem[]> {
  const items: TItem[] = [];
  let offset = 0;

  while (true) {
    const page = await fetchPage(offset);
    items.push(...page.items);

    if (page.items.length < PONDER_PAGE_LIMIT) {
      break;
    }

    offset += page.items.length;
  }

  return items;
}

export const ponderApi = {
  getContent(params?: PonderContentQuery) {
    return ponderGet<PonderContentResponse>("/content", params);
  },

  getContentById(id: string) {
    return ponderGet<{
      content: PonderContentItem;
      rounds: any[];
      ratings: PonderRatingChange[];
    }>(`/content/${id}`);
  },

  async getContentWindow(params?: PonderContentQuery) {
    const requestedLimit = Number(params?.limit ?? PONDER_PAGE_LIMIT);
    const safeRequestedLimit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.floor(requestedLimit))
      : PONDER_PAGE_LIMIT;
    const initialOffset = Number(params?.offset ?? 0);
    let offset = Number.isFinite(initialOffset) ? Math.max(0, Math.floor(initialOffset)) : 0;
    let total = 0;
    const items: PonderContentItem[] = [];

    while (items.length < safeRequestedLimit) {
      const remaining = safeRequestedLimit - items.length;
      const page = await this.getContent({
        ...params,
        limit: String(Math.min(PONDER_PAGE_LIMIT, remaining)),
        offset: String(offset),
      });

      items.push(...page.items);
      total = page.total;
      offset += page.items.length;

      if (page.items.length === 0 || offset >= page.total) {
        break;
      }
    }

    return {
      items,
      total,
      limit: safeRequestedLimit,
      offset: Number.isFinite(initialOffset) ? Math.max(0, Math.floor(initialOffset)) : 0,
    } satisfies PonderContentResponse;
  },

  getRounds(params?: { contentId?: string; state?: string; limit?: string; offset?: string }) {
    return ponderGet<PonderRoundsResponse>("/rounds", params);
  },

  async getAllContent(params?: Omit<PonderContentQuery, "limit" | "offset">) {
    return getAllPages(offset =>
      this.getContent({
        ...params,
        limit: String(PONDER_PAGE_LIMIT),
        offset: String(offset),
      }),
    );
  },

  getCategories(status?: string) {
    return ponderGet<{ items: PonderCategory[] }>("/categories", { status });
  },

  getCategoryPopularity() {
    return ponderGet<Record<string, number>>("/category-popularity");
  },

  getProfiles(addresses: string[]) {
    return ponderGet<Record<string, PonderProfile>>("/profiles", {
      addresses: addresses.join(","),
    });
  },

  getProfile(address: string) {
    return ponderGet<PonderProfileDetailResponse>(`/profile/${address}`);
  },

  getDiscoverSignals(address: string, params?: { watched?: string; followed?: string }) {
    return ponderGet<PonderDiscoverSignalsResponse>(`/discover-signals/${address}`, params);
  },

  getFeaturedToday(limit?: string) {
    return ponderGet<{ items: PonderFeaturedTodayItem[] }>("/featured-today", { limit });
  },

  getLeaderboard(type?: string, limit?: string) {
    return ponderGet<{ items: PonderProfile[]; type: string }>("/leaderboard", {
      type,
      limit,
    });
  },

  getTokenHolders(params?: { limit?: string; offset?: string }) {
    return ponderGet<PonderTokenHoldersResponse>("/token-holders", params);
  },

  async getAllTokenHolders() {
    return getAllPages(offset =>
      this.getTokenHolders({
        limit: String(PONDER_PAGE_LIMIT),
        offset: String(offset),
      }),
    );
  },

  getRewards(voter: string, limit?: string) {
    return ponderGet<{ items: PonderRewardClaim[] }>("/rewards", {
      voter,
      limit,
    });
  },

  getSubmissionStakes(submitter: string) {
    return ponderGet<PonderSubmissionStakes>("/submission-stakes", { submitter });
  },

  getVotingStakes(voter: string) {
    return ponderGet<PonderVotingStakes>("/voting-stakes", { voter });
  },

  getSubmitterRewards(submitter: string, limit?: string) {
    return ponderGet<{ items: PonderSubmitterRewardClaim[] }>("/submitter-rewards", {
      submitter,
      limit,
    });
  },

  getBalanceHistory(address: string, limit?: string) {
    return ponderGet<{ transfers: PonderTokenTransfer[]; address: string }>("/balance-history", {
      address,
      limit,
    });
  },

  getStats() {
    return ponderGet<{
      totalContent: number;
      totalVotes: number;
      totalRoundsSettled: number;
      totalRewardsClaimed: string;
      totalProfiles: number;
      totalVoterIds: number;
    }>("/stats");
  },

  getAccuracyLeaderboard(params?: {
    categoryId?: string;
    sortBy?: string;
    window?: string;
    minVotes?: string;
    limit?: string;
    offset?: string;
  }) {
    return ponderGet<PonderAccuracyLeaderboardResponse>("/accuracy-leaderboard", params);
  },

  getVoterAccuracy(address: string) {
    return ponderGet<{ stats: PonderVoterStats | null; categories: PonderVoterCategoryStats[] }>(
      `/voter-accuracy/${address}`,
    );
  },

  getVoterStatsBatch(voters: string[]) {
    return ponderGet<PonderVoterStatsBatch>("/voter-stats-batch", {
      voters: voters.join(","),
    });
  },

  getVotes(params?: {
    voter?: string;
    contentId?: string;
    roundId?: string;
    state?: string;
    limit?: string;
    offset?: string;
  }) {
    return ponderGet<PonderVotesResponse>("/votes", params);
  },

  async getVotesWindow(params?: {
    voter?: string;
    contentId?: string;
    roundId?: string;
    state?: string;
    limit?: string;
    offset?: string;
  }) {
    const requestedLimit = Number(params?.limit ?? PONDER_PAGE_LIMIT);
    const safeRequestedLimit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.floor(requestedLimit))
      : PONDER_PAGE_LIMIT;
    const initialOffset = Number(params?.offset ?? 0);
    let offset = Number.isFinite(initialOffset) ? Math.max(0, Math.floor(initialOffset)) : 0;
    let total = 0;
    let settledTotal = 0;
    const items: PonderVoteItem[] = [];

    while (items.length < safeRequestedLimit) {
      const remaining = safeRequestedLimit - items.length;
      const page = await this.getVotes({
        ...params,
        limit: String(Math.min(PONDER_PAGE_LIMIT, remaining)),
        offset: String(offset),
      });

      items.push(...page.items);
      total = page.total;
      settledTotal = page.settledTotal;
      offset += page.items.length;

      if (page.items.length === 0 || offset >= page.total) {
        break;
      }
    }

    return {
      items,
      limit: safeRequestedLimit,
      offset: Number.isFinite(initialOffset) ? Math.max(0, Math.floor(initialOffset)) : 0,
      settledTotal,
      total,
    } satisfies PonderVotesResponse;
  },

  async getAllVotes(params?: { voter?: string; contentId?: string; roundId?: string; state?: string }) {
    return getAllPages(offset =>
      this.getVotes({
        ...params,
        limit: String(PONDER_PAGE_LIMIT),
        offset: String(offset),
      }),
    );
  },

  getVoterStreak(voter: string) {
    return ponderGet<PonderVoterStreak>("/voter-streak", { voter });
  },
};
