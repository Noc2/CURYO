import { describe, it, expect } from "vitest";
import { getRevertReason, isExpectedRevert } from "../keeper.js";

describe("isExpectedRevert", () => {
  const benign = [
    "RoundNotOpen",
    "EpochNotEnded",
    "NotEnoughVotes",
    "UnrevealedPastEpochVotes",
    "AlreadyRevealed",
    "AlreadyCancelled",
    "ThresholdReached",
  ];

  for (const phrase of benign) {
    it(`returns true for "${phrase}"`, () => {
      expect(isExpectedRevert(phrase)).toBe(true);
    });
  }

  it("returns true case-insensitively", () => {
    expect(isExpectedRevert("roundnotopen")).toBe(true);
    expect(isExpectedRevert("ALREADYREVEALED")).toBe(true);
  });

  it("returns true when phrase is embedded in longer message", () => {
    expect(isExpectedRevert("execution reverted: RoundNotOpen()")).toBe(true);
  });

  it("returns false for unknown errors", () => {
    expect(isExpectedRevert("OutOfGas")).toBe(false);
    expect(isExpectedRevert("InsufficientFunds")).toBe(false);
    expect(isExpectedRevert("")).toBe(false);
  });
});

describe("getRevertReason", () => {
  it("falls back to shortMessage for BaseError-like objects", () => {
    // getRevertReason checks instanceof BaseError — plain objects won't match,
    // so it falls through to the generic path
    const err = { shortMessage: "some short message" };
    expect(getRevertReason(err)).toBe("some short message");
  });

  it("handles non-Error objects", () => {
    expect(getRevertReason("plain string error")).toBe("plain string error");
    expect(getRevertReason(42)).toBe("42");
    expect(getRevertReason(null)).toBe("null");
  });

  it("extracts message from Error-like objects", () => {
    const err = { message: "custom error message" };
    expect(getRevertReason(err)).toBe("custom error message");
  });

  it("prefers shortMessage over message", () => {
    const err = { shortMessage: "short", message: "long message" };
    expect(getRevertReason(err)).toBe("short");
  });
});
