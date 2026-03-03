const PONDER_URL = process.env.NEXT_PUBLIC_PONDER_URL || "http://localhost:42069";

let cachedAvailability: boolean | null = null;
let cacheExpiry = 0;

const HEALTH_CHECK_TIMEOUT = 2000;
const CACHE_DURATION = 30_000;

export async function isPonderAvailable(): Promise<boolean> {
  if (cachedAvailability !== null && Date.now() < cacheExpiry) {
    return cachedAvailability;
  }

  try {
    const res = await fetch(`${PONDER_URL}/health`, {
      signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT),
    });
    cachedAvailability = res.ok;
  } catch {
    cachedAvailability = false;
  }
  cacheExpiry = Date.now() + CACHE_DURATION;
  return cachedAvailability;
}

export function invalidatePonderCache() {
  cachedAvailability = null;
  cacheExpiry = 0;
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
  goal: string;
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
  createdAt: string;
  updatedAt: string;
  totalVotes: number;
  totalContent: number;
  totalRewardsClaimed: string;
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
  roundState: number | null;
}

export type PonderVoterStatsBatch = Record<string, PonderVoterStats>;

export const ponderApi = {
  getContent(params?: { categoryId?: string; status?: string; sortBy?: string; limit?: string; offset?: string }) {
    return ponderGet<PonderContentResponse>("/content", params);
  },

  getContentById(id: string) {
    return ponderGet<{
      content: PonderContentItem;
      rounds: any[];
      ratings: any[];
    }>(`/content/${id}`);
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
    return ponderGet<{
      profile: PonderProfile;
      recentVotes: any[];
      recentRewards: any[];
    }>(`/profile/${address}`);
  },

  getLeaderboard(type?: string, limit?: string) {
    return ponderGet<{ items: PonderProfile[]; type: string }>("/leaderboard", {
      type,
      limit,
    });
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
    minVotes?: string;
    limit?: string;
    offset?: string;
  }) {
    return ponderGet<{ items: PonderAccuracyLeaderboardItem[]; categoryId?: string }>("/accuracy-leaderboard", params);
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
    return ponderGet<{ items: PonderVoteItem[] }>("/votes", params);
  },
};
