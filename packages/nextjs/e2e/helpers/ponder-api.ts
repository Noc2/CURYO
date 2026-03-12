/**
 * Ponder REST API helpers for data verification in E2E tests.
 * Ponder runs at localhost:42069 by default.
 */

const PONDER_URL = "http://localhost:42069";

/**
 * Fetch with automatic retry on 429 (Too Many Requests).
 * Ponder rate-limits rapid requests during heavy E2E test runs.
 */
async function fetchWithRetry(url: string, maxRetries = 3): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url);
    if (res.status !== 429 || attempt === maxRetries) return res;
    const delay = 1000 * (attempt + 1); // 1s, 2s, 3s backoff
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  return fetch(url); // unreachable, but satisfies TS
}

export type ContentItem = {
  id: string;
  categoryId: string;
  url: string;
  title: string;
  imageUrl?: string;
  description?: string;
  status: number;
  rating: string;
  totalVotes: string;
  submitter: string;
  submitterStakeReturned: boolean;
  createdAt: number;
  updatedAt: number;
};

export type ContentRound = {
  id: string;
  contentId: string;
  roundId: string;
  state: number; // 0=Open, 1=Settled, 2=Cancelled, 3=Tied, 4=RevealFailed
  voteCount: string;
  upPool: string;
  downPool: string;
  upCount: string;
  downCount: string;
  upWins: boolean;
  createdAt: number;
};

export type VoteItem = {
  id: string;
  voter: string;
  contentId: string;
  roundId: string;
  stake: string;
  isUp: boolean;
  votedAt: number;
};

export type RatingChangeItem = {
  id: string;
  contentId: string;
  oldRating: number;
  newRating: number;
  timestamp: string;
};

/**
 * Fetch a single content item with its rounds and ratings.
 */
export async function getContentById(
  id: string | number,
  baseURL = PONDER_URL,
): Promise<{ content: ContentItem; rounds: ContentRound[]; ratings: RatingChangeItem[] }> {
  const res = await fetchWithRetry(`${baseURL}/content/${id}`);
  if (!res.ok) throw new Error(`GET /content/${id} returned ${res.status}`);
  return res.json();
}

/**
 * Fetch content list with optional filters.
 */
export async function getContentList(
  params: { status?: string; sortBy?: string; limit?: number; categoryId?: string } = {},
  baseURL = PONDER_URL,
): Promise<{ items: ContentItem[]; total: number }> {
  const searchParams = new URLSearchParams();
  if (params.status) searchParams.set("status", params.status);
  if (params.sortBy) searchParams.set("sortBy", params.sortBy);
  if (params.limit) searchParams.set("limit", String(params.limit));
  if (params.categoryId) searchParams.set("categoryId", params.categoryId);

  const res = await fetchWithRetry(`${baseURL}/content?${searchParams}`);
  if (!res.ok) throw new Error(`GET /content returned ${res.status}`);
  return res.json();
}

/**
 * Fetch revealed votes, optionally filtered by voter or content.
 */
export async function getVotes(
  params: { voter?: string; contentId?: string } = {},
  baseURL = PONDER_URL,
): Promise<{ items: VoteItem[] }> {
  const searchParams = new URLSearchParams();
  if (params.voter) searchParams.set("voter", params.voter);
  if (params.contentId) searchParams.set("contentId", params.contentId);

  const res = await fetchWithRetry(`${baseURL}/votes?${searchParams}`);
  if (!res.ok) throw new Error(`GET /votes returned ${res.status}`);
  return res.json();
}

/**
 * Fetch global stats.
 */
export async function getStats(
  baseURL = PONDER_URL,
): Promise<{ totalContent: number; totalVotes: number; totalRoundsSettled: number }> {
  const res = await fetchWithRetry(`${baseURL}/stats`);
  if (!res.ok) throw new Error(`GET /stats returned ${res.status}`);
  return res.json();
}

/**
 * Generic Ponder GET request — fetches any endpoint and returns parsed JSON.
 */
export async function ponderGet(path: string, baseURL = PONDER_URL): Promise<any> {
  const res = await fetchWithRetry(`${baseURL}${path}`);
  if (!res.ok) throw new Error(`GET ${path} returned ${res.status}`);
  return res.json();
}

// ============================================================
// CATEGORIES
// ============================================================

export type CategoryItem = {
  id: string;
  name: string;
  domain: string;
  status: number; // 0=Pending, 1=Approved, 2=Rejected
  submitter: string;
  proposalId: string | null;
  totalVotes: number;
  totalContent: number;
  createdAt: string;
};

/**
 * Fetch categories, optionally filtered by status.
 * Status: 0=Pending, 1=Approved (default), 2=Rejected, "all" for all.
 */
export async function getCategories(status?: string, baseURL = PONDER_URL): Promise<{ items: CategoryItem[] }> {
  const params = new URLSearchParams();
  if (status !== undefined) params.set("status", status);
  const res = await fetchWithRetry(`${baseURL}/categories?${params}`);
  if (!res.ok) throw new Error(`GET /categories returned ${res.status}`);
  return res.json();
}

// ============================================================
// FRONTENDS
// ============================================================

export type FrontendItem = {
  address: string;
  operator: string;
  stakedAmount: string;
  approved: boolean;
  slashed: boolean;
  totalFeesCredited: string;
  totalFeesClaimed: string;
  registeredAt: string;
};

/**
 * Fetch all registered frontends.
 */
export async function getFrontends(baseURL = PONDER_URL): Promise<{ items: FrontendItem[] }> {
  const res = await fetchWithRetry(`${baseURL}/frontends`);
  if (!res.ok) throw new Error(`GET /frontends returned ${res.status}`);
  return res.json();
}

/**
 * Fetch a single frontend by address.
 */
export async function getFrontend(address: string, baseURL = PONDER_URL): Promise<{ frontend: FrontendItem }> {
  const res = await fetchWithRetry(`${baseURL}/frontend/${address}`);
  if (!res.ok) throw new Error(`GET /frontend/${address} returned ${res.status}`);
  return res.json();
}

// ============================================================
// SUBMITTER REWARDS
// ============================================================

export type SubmitterRewardItem = {
  id: string;
  contentId: string;
  roundId: string;
  submitter: string;
  crepAmount: string;
  claimedAt: string;
};

/**
 * Fetch submitter reward claims by submitter address.
 */
export async function getSubmitterRewards(
  submitter: string,
  baseURL = PONDER_URL,
): Promise<{ items: SubmitterRewardItem[] }> {
  const res = await fetchWithRetry(`${baseURL}/submitter-rewards?submitter=${submitter}`);
  if (!res.ok) throw new Error(`GET /submitter-rewards returned ${res.status}`);
  return res.json();
}

// ============================================================
// VOTER IDS
// ============================================================

export type VoterIdItem = {
  tokenId: string;
  holder: string;
  nullifier: string;
  mintedAt: string;
  revoked: boolean;
};

/**
 * Fetch voter IDs, optionally filtered by holder address.
 */
export async function getVoterIds(holder?: string, baseURL = PONDER_URL): Promise<{ items: VoterIdItem[] }> {
  const params = new URLSearchParams();
  if (holder) params.set("holder", holder);
  const res = await fetchWithRetry(`${baseURL}/voter-ids?${params}`);
  if (!res.ok) throw new Error(`GET /voter-ids returned ${res.status}`);
  return res.json();
}
