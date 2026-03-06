import { describe, expect, it } from "vitest";
import { clampToolLimit, clampToolOffset, toContentStatusParam, toRoundStateParam } from "../lib/filters.js";

describe("toContentStatusParam", () => {
  it("maps status values to Ponder API params", () => {
    expect(toContentStatusParam(undefined)).toBe("0");
    expect(toContentStatusParam("all")).toBe("all");
    expect(toContentStatusParam("dormant")).toBe("1");
  });
});

describe("toRoundStateParam", () => {
  it("maps round states to Ponder API params", () => {
    expect(toRoundStateParam(undefined)).toBeUndefined();
    expect(toRoundStateParam("open")).toBe("0");
    expect(toRoundStateParam("tied")).toBe("3");
  });
});

describe("tool pagination clamps", () => {
  it("clamps limit into the MCP-safe range", () => {
    expect(clampToolLimit(undefined)).toBe(10);
    expect(clampToolLimit(50)).toBe(20);
    expect(clampToolLimit(0)).toBe(1);
  });

  it("clamps offset into the MCP-safe range", () => {
    expect(clampToolOffset(undefined)).toBe(0);
    expect(clampToolOffset(-10)).toBe(0);
    expect(clampToolOffset(5_000)).toBe(1_000);
  });
});
