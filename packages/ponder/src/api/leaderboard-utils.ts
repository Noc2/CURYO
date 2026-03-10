const DAY_MS = 24 * 60 * 60 * 1000;

export type AccuracyLeaderboardWindow = "all" | "7d" | "30d" | "365d" | "season";
export type AccuracyLeaderboardSortBy = "winRate" | "wins" | "stakeWon" | "settledVotes";

export interface AccuracyLeaderboardWindowBounds {
  window: AccuracyLeaderboardWindow;
  startsAt: bigint | null;
  endsAt: bigint | null;
}

export interface SortableAccuracyLeaderboardItem {
  voter: string;
  totalSettledVotes: number;
  totalWins: number;
  totalStakeWon: bigint | string | number;
  winRate: number;
}

export function getCurrentSeasonWindow(now = new Date()) {
  const currentUtcDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = currentUtcDate.getUTCDay();
  const distanceFromMonday = day === 0 ? 6 : day - 1;
  currentUtcDate.setUTCDate(currentUtcDate.getUTCDate() - distanceFromMonday);
  currentUtcDate.setUTCHours(0, 0, 0, 0);

  const end = new Date(currentUtcDate.getTime() + 7 * DAY_MS);
  return { start: currentUtcDate, end };
}

export function parseAccuracyLeaderboardWindow(value: string | undefined): AccuracyLeaderboardWindow | null {
  if (!value) return "all";

  switch (value) {
    case "all":
    case "7d":
    case "30d":
    case "365d":
    case "season":
      return value;
    default:
      return null;
  }
}

export function resolveAccuracyLeaderboardWindow(
  value: string | undefined,
  now = new Date(),
): AccuracyLeaderboardWindowBounds | null {
  const window = parseAccuracyLeaderboardWindow(value);
  if (window === null) return null;
  if (window === "all") {
    return {
      window,
      startsAt: null,
      endsAt: null,
    };
  }

  const end = new Date(now);
  let start: Date;
  switch (window) {
    case "7d":
      start = new Date(end.getTime() - 7 * DAY_MS);
      break;
    case "30d":
      start = new Date(end.getTime() - 30 * DAY_MS);
      break;
    case "365d":
      start = new Date(end.getTime() - 365 * DAY_MS);
      break;
    case "season": {
      const seasonWindow = getCurrentSeasonWindow(now);
      start = seasonWindow.start;
      end.setTime(seasonWindow.end.getTime());
      break;
    }
    default:
      return null;
  }

  return {
    window,
    startsAt: BigInt(Math.floor(start.getTime() / 1000)),
    endsAt: BigInt(Math.floor(end.getTime() / 1000)),
  };
}

function toComparableBigInt(value: bigint | string | number): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  return BigInt(value);
}

export function sortAccuracyLeaderboardItems<T extends SortableAccuracyLeaderboardItem>(
  items: readonly T[],
  sortBy: AccuracyLeaderboardSortBy,
): T[] {
  return [...items].sort((a, b) => {
    if (sortBy === "settledVotes" && b.totalSettledVotes !== a.totalSettledVotes) {
      return b.totalSettledVotes - a.totalSettledVotes;
    }

    if (sortBy === "wins" && b.totalWins !== a.totalWins) {
      return b.totalWins - a.totalWins;
    }

    if (sortBy === "stakeWon") {
      const stakeDiff = toComparableBigInt(b.totalStakeWon) - toComparableBigInt(a.totalStakeWon);
      if (stakeDiff !== 0n) return stakeDiff > 0n ? 1 : -1;
    }

    if (b.winRate !== a.winRate) return b.winRate - a.winRate;
    if (b.totalWins !== a.totalWins) return b.totalWins - a.totalWins;
    if (b.totalSettledVotes !== a.totalSettledVotes) return b.totalSettledVotes - a.totalSettledVotes;

    const stakeDiff = toComparableBigInt(b.totalStakeWon) - toComparableBigInt(a.totalStakeWon);
    if (stakeDiff !== 0n) return stakeDiff > 0n ? 1 : -1;

    return a.voter.localeCompare(b.voter);
  });
}
