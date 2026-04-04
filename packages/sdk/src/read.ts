import { CuryoApiError, CuryoSdkError } from "./errors";
import type { CuryoClientConfig } from "./types";

type QueryValue = string | number | boolean | undefined;
type JsonRecord = Record<string, unknown>;

export interface CuryoOpenRoundSummary {
  roundId: string;
  voteCount: number;
  revealedCount: number;
  totalStake: string;
  upPool: string;
  downPool: string;
  upCount?: number;
  downCount?: number;
  referenceRatingBps?: number;
  ratingBps?: number;
  conservativeRatingBps?: number;
  confidenceMass?: string;
  effectiveEvidence?: string;
  settledRounds?: number;
  lowSince?: string;
  startTime: string | null;
  estimatedSettlementTime: string | null;
  [key: string]: unknown;
}

export interface CuryoContentItem {
  id: string;
  submitter: `0x${string}`;
  contentHash: string;
  url: string;
  title: string;
  description: string;
  tags: string;
  categoryId: string;
  status: number;
  rating: number;
  ratingBps?: number;
  conservativeRatingBps?: number;
  ratingConfidenceMass?: string;
  ratingEffectiveEvidence?: string;
  ratingSettledRounds?: number;
  ratingLowSince?: string;
  submitterStakeReturned: boolean;
  createdAt: string;
  lastActivityAt: string;
  totalVotes: number;
  totalRounds: number;
  openRound: CuryoOpenRoundSummary | null;
  [key: string]: unknown;
}

export interface CuryoProfileSubmissionItem {
  id: string;
  submitter: `0x${string}`;
  url: string;
  title: string;
  description: string;
  categoryId: string;
  categoryName: string | null;
  status: number;
  rating: number;
  ratingBps?: number;
  conservativeRatingBps?: number;
  ratingConfidenceMass?: string;
  ratingEffectiveEvidence?: string;
  ratingSettledRounds?: number;
  ratingLowSince?: string;
  createdAt: string;
  totalVotes: number;
  totalRounds: number;
  [key: string]: unknown;
}

export interface CuryoRoundItem {
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
  referenceRatingBps?: number;
  ratingBps?: number;
  conservativeRatingBps?: number;
  confidenceMass?: string;
  effectiveEvidence?: string;
  settledRounds?: number;
  lowSince?: string;
  upWins: boolean | null;
  losingPool: string | null;
  startTime: string | null;
  settledAt: string | null;
  title: string | null;
  description: string | null;
  url: string | null;
  submitter: `0x${string}` | null;
  categoryId: string | null;
  [key: string]: unknown;
}

export interface CuryoVoteItem {
  id: string;
  contentId: string;
  roundId: string;
  voter: `0x${string}`;
  commitHash: `0x${string}`;
  targetRound: string;
  drandChainHash: `0x${string}`;
  isUp: boolean | null;
  stake: string;
  epochIndex: number;
  revealed: boolean;
  committedAt: string;
  revealedAt: string | null;
  roundStartTime: string | null;
  roundState: number | null;
  roundUpWins: boolean | null;
  [key: string]: unknown;
}

export interface CuryoFrontendItem {
  address: `0x${string}`;
  eligible?: boolean;
  slashed?: boolean;
  stake?: string;
  accumulatedFees?: string;
  exitAvailableAt?: string | null;
  [key: string]: unknown;
}

export interface CuryoCategoryItem {
  id: string;
  name?: string;
  status?: number;
  totalVotes?: number;
  [key: string]: unknown;
}

export interface CuryoProfileItem {
  address: `0x${string}`;
  displayName?: string | null;
  bio?: string | null;
  avatar?: string | null;
  totalVotes?: number;
  totalContent?: number;
  totalRewardsClaimed?: string;
  [key: string]: unknown;
}

export interface CuryoGlobalStats {
  totalContent?: number;
  totalVotes?: number;
  totalRoundsSettled?: number;
  totalRewardsClaimed?: string;
  totalProfiles?: number;
  totalVoterIds?: number;
  [key: string]: unknown;
}

export interface CuryoPaginatedResponse<T> {
  items: T[];
  total?: number | null;
  settledTotal?: number;
  limit?: number;
  offset?: number;
  hasMore?: boolean;
}

export interface CuryoContentDetailsResponse {
  content: CuryoContentItem;
  rounds: CuryoRoundItem[];
  ratings: JsonRecord[];
  matchCount?: number;
}

export interface CuryoProfileResponse {
  profile: CuryoProfileItem | null;
  summary: {
    totalVotes: number;
    totalContent: number;
    totalRewardsClaimed: string | number;
  };
  recentVotes: CuryoVoteItem[];
  recentRewards: JsonRecord[];
  recentSubmissions: CuryoProfileSubmissionItem[];
}

export interface SearchContentParams {
  status?: string;
  categoryId?: string;
  search?: string;
  submitter?: string;
  sortBy?: "newest" | "oldest" | "highest_rated" | "lowest_rated" | "most_votes";
  limit?: number;
  offset?: number;
}

export interface SearchVotesParams {
  voter?: string;
  contentId?: string;
  roundId?: string;
  state?: string;
  limit?: number;
  offset?: number;
}

export interface SearchRoundsParams {
  contentId?: string;
  state?: string;
  limit?: number;
  offset?: number;
}

export interface ListFrontendsParams {
  status?: "all" | "active" | "eligible" | "slashed" | "exiting" | "inactive" | "pending";
  limit?: number;
  offset?: number;
}

export interface ListCategoriesParams {
  status?: string;
  limit?: number;
  offset?: number;
}

export interface CuryoReadClient {
  searchContent(params?: SearchContentParams): Promise<CuryoPaginatedResponse<CuryoContentItem>>;
  getContent(contentId: string | bigint): Promise<CuryoContentDetailsResponse>;
  getContentByUrl(url: string): Promise<CuryoContentDetailsResponse>;
  getCategories(params?: ListCategoriesParams): Promise<{ items: CuryoCategoryItem[] }>;
  getProfile(address: string): Promise<CuryoProfileResponse>;
  getProfiles(addresses: string[]): Promise<Record<string, CuryoProfileItem>>;
  getVoterAccuracy(address: string): Promise<JsonRecord>;
  getStats(): Promise<CuryoGlobalStats>;
  searchVotes(params?: SearchVotesParams): Promise<CuryoPaginatedResponse<CuryoVoteItem>>;
  searchRounds(params?: SearchRoundsParams): Promise<CuryoPaginatedResponse<CuryoRoundItem>>;
  listFrontends(params?: ListFrontendsParams): Promise<{ items: CuryoFrontendItem[] }>;
  getFrontend(address: string): Promise<{ frontend: CuryoFrontendItem }>;
}

export function createCuryoReadClient(config: Pick<CuryoClientConfig, "apiBaseUrl" | "fetchImpl" | "timeoutMs">): CuryoReadClient {
  return {
    searchContent: params => request<CuryoPaginatedResponse<CuryoContentItem>>(config, "/content", params),
    getContent: contentId => request<CuryoContentDetailsResponse>(config, `/content/${contentId}`),
    getContentByUrl: url => request<CuryoContentDetailsResponse>(config, "/content/by-url", { url }),
    getCategories: params => request<{ items: CuryoCategoryItem[] }>(config, "/categories", params),
    getProfile: address => request<CuryoProfileResponse>(config, `/profile/${address}`),
    getProfiles: addresses => request<Record<string, CuryoProfileItem>>(config, "/profiles", { addresses: addresses.join(",") }),
    getVoterAccuracy: address => request<JsonRecord>(config, `/voter-accuracy/${address}`),
    getStats: () => request<CuryoGlobalStats>(config, "/stats"),
    searchVotes: params => request<CuryoPaginatedResponse<CuryoVoteItem>>(config, "/votes", params),
    searchRounds: params => request<CuryoPaginatedResponse<CuryoRoundItem>>(config, "/rounds", params),
    listFrontends: params => request<{ items: CuryoFrontendItem[] }>(config, "/frontends", params),
    getFrontend: address => request<{ frontend: CuryoFrontendItem }>(config, `/frontend/${address}`),
  };
}

async function request<T>(config: Pick<CuryoClientConfig, "apiBaseUrl" | "fetchImpl" | "timeoutMs">, path: string, params?: object): Promise<T> {
  const baseUrl = config.apiBaseUrl;
  if (!baseUrl) {
    throw new CuryoSdkError("apiBaseUrl is required for read operations");
  }

  const url = new URL(path, `${baseUrl}/`);

  for (const [key, value] of Object.entries((params ?? {}) as Record<string, QueryValue>)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), config.timeoutMs);

  let response: Response;
  try {
    response = await config.fetchImpl(url, {
      headers: {
        accept: "application/json",
      },
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new CuryoApiError(`Curyo request timed out after ${config.timeoutMs}ms`, 504);
    }

    const message = error instanceof Error ? error.message : "Unknown fetch error";
    throw new CuryoApiError(`Curyo request failed: ${message}`, 502);
  } finally {
    clearTimeout(timeoutHandle);
  }

  const body = await response.text();
  const parsed = body.length === 0 ? null : parseJson(body);

  if (!response.ok) {
    const message =
      isJsonRecord(parsed) && typeof parsed.error === "string"
        ? parsed.error
        : `Curyo request failed with status ${response.status}`;
    throw new CuryoApiError(message, response.status);
  }

  return parsed as T;
}

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown parse error";
    throw new CuryoApiError(`Curyo returned invalid JSON: ${message}`, 502);
  }
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
