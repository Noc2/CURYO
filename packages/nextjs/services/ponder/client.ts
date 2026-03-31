import type { RoundState } from "@curyo/contracts/protocol";

const isProduction = process.env.NODE_ENV === "production";
const allowLocalE2EProductionBuild = process.env.NEXT_PUBLIC_CURYO_E2E_PRODUCTION_BUILD === "true";
const NEXT_PUBLIC_PONDER_URL = process.env.NEXT_PUBLIC_PONDER_URL?.trim() || undefined;
const DEV_PONDER_URL = "http://localhost:42069";

function isLocalhostHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export function resolvePonderUrl(
  rawValue: string | undefined,
  production: boolean,
  allowLocalhostInProduction = false,
): string | null {
  const normalizedRawValue = rawValue?.trim() || undefined;
  const resolvedValue = normalizedRawValue ?? (!production ? DEV_PONDER_URL : undefined);

  if (!resolvedValue) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(resolvedValue);
  } catch {
    throw new Error("NEXT_PUBLIC_PONDER_URL must be a valid URL.");
  }

  if (production && !allowLocalhostInProduction && isLocalhostHostname(url.hostname)) {
    return null;
  }

  return url.toString().replace(/\/$/, "");
}

function getConfiguredPonderUrl(): string | null {
  return resolvePonderUrl(NEXT_PUBLIC_PONDER_URL, isProduction, allowLocalE2EProductionBuild);
}

export function isPonderConfigured(): boolean {
  return getConfiguredPonderUrl() !== null;
}

function getRequiredPonderUrl(): string {
  const url = getConfiguredPonderUrl();
  if (!url) {
    throw new Error("NEXT_PUBLIC_PONDER_URL is required in production.");
  }

  return url;
}

let cachedAvailability: boolean | null = null;
let cacheExpiry = 0;
let availabilityPromise: Promise<boolean> | null = null;

const HEALTH_CHECK_TIMEOUT = 2000;
const PONDER_REQUEST_TIMEOUT = 10_000;
const CACHE_DURATION = 30_000;

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export async function fetchPonderJson<T>(
  url: string | URL,
  timeoutMs = PONDER_REQUEST_TIMEOUT,
  fetchImpl: typeof fetch = fetch,
): Promise<T> {
  let response: Response;

  try {
    response = await fetchImpl(url.toString(), {
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error(`Ponder request timed out after ${timeoutMs}ms`);
    }

    const message = error instanceof Error ? error.message : "Unknown fetch error";
    throw new Error(`Ponder request failed: ${message}`);
  }

  if (!response.ok) {
    throw new Error(`Ponder request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export async function isPonderAvailable(): Promise<boolean> {
  const ponderUrl = getConfiguredPonderUrl();
  if (!ponderUrl) {
    return false;
  }

  if (cachedAvailability !== null && Date.now() < cacheExpiry) {
    return cachedAvailability;
  }

  if (availabilityPromise) {
    return availabilityPromise;
  }

  availabilityPromise = (async () => {
    try {
      const res = await fetch(`${ponderUrl}/health`, {
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
  const url = new URL(`${getRequiredPonderUrl()}${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        url.searchParams.set(key, value);
      }
    }
  }
  return fetchPonderJson<T>(url);
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
  totalVotes: number;
  totalRounds: number;
  openRound: PonderContentOpenRoundSummary | null;
}

export interface PonderContentResponse {
  items: PonderContentItem[];
  total: number | null;
  limit: number;
  offset: number;
  hasMore: boolean;
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

export interface PonderContentOpenRoundSummary {
  roundId: string;
  voteCount: number;
  revealedCount: number;
  totalStake: string;
  upPool: string;
  downPool: string;
  upCount?: number;
  downCount?: number;
  startTime: string | null;
  estimatedSettlementTime: string | null;
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

export interface PonderFrontend {
  address: string;
  operator: string;
  stakedAmount: string;
  eligible: boolean;
  slashed: boolean;
  exitAvailableAt: string | null;
  totalFeesCredited: string;
  totalFeesClaimed: string;
  registeredAt: string;
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

async function getAllPages<TItem>(fetchPage: (offset: number) => Promise<{ items: TItem[]; hasMore?: boolean }>): Promise<TItem[]> {
  const items: TItem[] = [];
  let offset = 0;

  while (true) {
    const page = await fetchPage(offset);
    items.push(...page.items);

    if (page.hasMore === false || page.items.length < PONDER_PAGE_LIMIT) {
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
    let total: number | null = null;
    const items: PonderContentItem[] = [];
    let hasMore = false;

    while (items.length < safeRequestedLimit) {
      const remaining = safeRequestedLimit - items.length;
      const page = await this.getContent({
        ...params,
        limit: String(Math.min(PONDER_PAGE_LIMIT, remaining)),
        offset: String(offset),
      });

      items.push(...page.items);
      total = page.total;
      hasMore = page.hasMore;
      offset += page.items.length;

      if (page.items.length === 0 || !page.hasMore) {
        break;
      }
    }

    return {
      items,
      total,
      limit: safeRequestedLimit,
      offset: Number.isFinite(initialOffset) ? Math.max(0, Math.floor(initialOffset)) : 0,
      hasMore,
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

  getFrontend(address: string) {
    return ponderGet<{ frontend: PonderFrontend }>(`/frontend/${address}`);
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
