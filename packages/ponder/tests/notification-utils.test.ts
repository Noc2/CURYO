import { describe, expect, it } from "vitest";
import { canRoundSettleSoon } from "../src/api/notification-utils.js";

describe("canRoundSettleSoon", () => {
  it("rejects open rounds below the settlement vote threshold", () => {
    expect(canRoundSettleSoon(2)).toBe(false);
  });

  it("accepts open rounds once the settlement vote threshold is met", () => {
    expect(canRoundSettleSoon(3)).toBe(true);
    expect(canRoundSettleSoon(4)).toBe(true);
  });

  it("uses the round-specific minimum voter threshold when provided", () => {
    expect(canRoundSettleSoon(3, 5)).toBe(false);
    expect(canRoundSettleSoon(5, 5)).toBe(true);
  });
});
