import { describe, expect, it } from "vitest";
import { deriveEffectiveVoterStreak, normalizeUtcDateKey, projectStoredVoterStreak } from "../src/streak-utils.js";

describe("normalizeUtcDateKey", () => {
  it("accepts compact UTC date keys", () => {
    expect(normalizeUtcDateKey("20260327")).toBe("20260327");
  });

  it("rejects malformed date keys", () => {
    expect(normalizeUtcDateKey("2026-03-27")).toBeNull();
    expect(normalizeUtcDateKey("2026/03/27")).toBeNull();
    expect(normalizeUtcDateKey("abc")).toBeNull();
  });
});

describe("projectStoredVoterStreak", () => {
  it("expires stale stored streaks after a missed UTC day", () => {
    expect(
      projectStoredVoterStreak(
        {
          currentDailyStreak: 4,
          bestDailyStreak: 9,
          totalActiveDays: 14,
          lastActiveDate: "20260323",
          lastMilestoneDay: 0,
        },
        new Date("2026-03-27T10:00:00Z"),
      ),
    ).toEqual({
      currentDailyStreak: 0,
      bestDailyStreak: 9,
      totalActiveDays: 14,
      lastActiveDate: "20260323",
      lastMilestoneDay: 0,
    });
  });
});

describe("deriveEffectiveVoterStreak", () => {
  it("counts consecutive UTC activity days into the current streak", () => {
    expect(
      deriveEffectiveVoterStreak(["20260325", "20260326"], null, new Date("2026-03-27T08:00:00Z")),
    ).toEqual({
      currentDailyStreak: 2,
      bestDailyStreak: 2,
      totalActiveDays: 2,
      lastActiveDate: "20260326",
      lastMilestoneDay: 0,
    });
  });
});
