import { describe, expect, it } from "vitest";
import {
  getCurrentSeasonWindow,
  parseAccuracyLeaderboardWindow,
  resolveAccuracyLeaderboardWindow,
  sortAccuracyLeaderboardItems,
} from "../api/leaderboard-utils.js";

describe("parseAccuracyLeaderboardWindow", () => {
  it("defaults to all when omitted", () => {
    expect(parseAccuracyLeaderboardWindow(undefined)).toBe("all");
  });

  it("accepts supported windows", () => {
    expect(parseAccuracyLeaderboardWindow("7d")).toBe("7d");
    expect(parseAccuracyLeaderboardWindow("30d")).toBe("30d");
    expect(parseAccuracyLeaderboardWindow("365d")).toBe("365d");
    expect(parseAccuracyLeaderboardWindow("season")).toBe("season");
  });

  it("rejects unsupported windows", () => {
    expect(parseAccuracyLeaderboardWindow("week")).toBeNull();
  });
});

describe("resolveAccuracyLeaderboardWindow", () => {
  it("returns unbounded all-time windows", () => {
    expect(resolveAccuracyLeaderboardWindow("all", new Date("2026-03-10T12:00:00Z"))).toEqual({
      window: "all",
      startsAt: null,
      endsAt: null,
    });
  });

  it("returns rolling 7d bounds", () => {
    expect(resolveAccuracyLeaderboardWindow("7d", new Date("2026-03-10T12:00:00Z"))).toEqual({
      window: "7d",
      startsAt: 1_772_539_200n,
      endsAt: 1_773_144_000n,
    });
  });

  it("returns weekly season bounds starting on monday UTC", () => {
    const bounds = resolveAccuracyLeaderboardWindow("season", new Date("2026-03-11T15:30:00Z"));
    expect(bounds).toEqual({
      window: "season",
      startsAt: 1_773_014_400n,
      endsAt: 1_773_619_200n,
    });
  });

  it("exposes the underlying current season helper", () => {
    const { start, end } = getCurrentSeasonWindow(new Date("2026-03-15T23:00:00Z"));
    expect(start.toISOString()).toBe("2026-03-09T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-03-16T00:00:00.000Z");
  });
});

describe("sortAccuracyLeaderboardItems", () => {
  const items = [
    {
      voter: "0xbbb",
      totalSettledVotes: 10,
      totalWins: 8,
      totalStakeWon: 20n,
      winRate: 0.8,
    },
    {
      voter: "0xaaa",
      totalSettledVotes: 12,
      totalWins: 8,
      totalStakeWon: 10n,
      winRate: 8 / 12,
    },
    {
      voter: "0xccc",
      totalSettledVotes: 7,
      totalWins: 7,
      totalStakeWon: 8n,
      winRate: 1,
    },
  ];

  it("sorts by settled vote volume when requested", () => {
    expect(sortAccuracyLeaderboardItems(items, "settledVotes").map(item => item.voter)).toEqual([
      "0xaaa",
      "0xbbb",
      "0xccc",
    ]);
  });

  it("sorts by win rate with deterministic tie-breakers", () => {
    expect(sortAccuracyLeaderboardItems(items, "winRate").map(item => item.voter)).toEqual([
      "0xccc",
      "0xbbb",
      "0xaaa",
    ]);
  });

  it("sorts by stake won before falling back to accuracy", () => {
    expect(sortAccuracyLeaderboardItems(items, "stakeWon").map(item => item.voter)).toEqual([
      "0xbbb",
      "0xaaa",
      "0xccc",
    ]);
  });
});
