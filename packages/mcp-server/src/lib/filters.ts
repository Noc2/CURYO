export const CONTENT_STATUS_VALUES = ["all", "active", "dormant", "cancelled"] as const;
export type ContentStatus = (typeof CONTENT_STATUS_VALUES)[number];

export const CONTENT_SORT_VALUES = ["newest", "oldest", "highest_rated", "lowest_rated", "most_votes"] as const;
export type ContentSort = (typeof CONTENT_SORT_VALUES)[number];

export const ROUND_STATE_VALUES = ["all", "open", "settled", "cancelled", "tied"] as const;
export type RoundState = (typeof ROUND_STATE_VALUES)[number];

const CONTENT_STATUS_TO_API: Record<ContentStatus, string | undefined> = {
  all: "all",
  active: "0",
  dormant: "1",
  cancelled: "2",
};

const ROUND_STATE_TO_API: Record<RoundState, string | undefined> = {
  all: undefined,
  open: "0",
  settled: "1",
  cancelled: "2",
  tied: "3",
};

export function toContentStatusParam(status: ContentStatus | undefined): string {
  return CONTENT_STATUS_TO_API[status ?? "active"] ?? "0";
}

export function toRoundStateParam(state: RoundState | undefined): string | undefined {
  return ROUND_STATE_TO_API[state ?? "all"];
}

export function clampToolLimit(value: number | undefined, fallback = 10, max = 20): number {
  if (value === undefined) return fallback;
  return Math.min(Math.max(value, 1), max);
}

export function clampToolOffset(value: number | undefined, fallback = 0, max = 1_000): number {
  if (value === undefined) return fallback;
  return Math.min(Math.max(value, 0), max);
}
