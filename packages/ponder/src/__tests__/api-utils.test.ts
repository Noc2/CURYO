import { describe, it, expect } from "vitest";
import { safeBigInt, safeLimit, safeOffset, isValidAddress, getUrlLookupCandidates } from "../api/utils.js";

describe("safeBigInt", () => {
  it("parses valid positive integer", () => {
    expect(safeBigInt("123")).toBe(123n);
  });

  it("parses zero", () => {
    expect(safeBigInt("0")).toBe(0n);
  });

  it("parses negative integer", () => {
    expect(safeBigInt("-42")).toBe(-42n);
  });

  it("parses very large numbers", () => {
    expect(safeBigInt("999999999999999999999")).toBe(999999999999999999999n);
  });

  it("returns null for non-numeric string", () => {
    expect(safeBigInt("abc")).toBeNull();
  });

  it("parses empty string as 0n", () => {
    // BigInt("") returns 0n in JavaScript
    expect(safeBigInt("")).toBe(0n);
  });

  it("returns null for float", () => {
    expect(safeBigInt("1.5")).toBeNull();
  });
});

describe("safeLimit", () => {
  it("returns parsed value when valid and within max", () => {
    expect(safeLimit("25", 50, 200)).toBe(25);
  });

  it("returns default when undefined", () => {
    expect(safeLimit(undefined, 50, 200)).toBe(50);
  });

  it("clamps to max", () => {
    expect(safeLimit("500", 50, 200)).toBe(200);
  });

  it("returns default for NaN", () => {
    expect(safeLimit("abc", 50, 200)).toBe(50);
  });

  it("returns default for zero", () => {
    expect(safeLimit("0", 50, 200)).toBe(50);
  });

  it("returns default for negative", () => {
    expect(safeLimit("-5", 50, 200)).toBe(50);
  });
});

describe("safeOffset", () => {
  it("returns parsed value when valid", () => {
    expect(safeOffset("10")).toBe(10);
  });

  it("returns 0 for undefined", () => {
    expect(safeOffset(undefined)).toBe(0);
  });

  it("returns 0 for negative", () => {
    expect(safeOffset("-5")).toBe(0);
  });

  it("returns 0 for NaN", () => {
    expect(safeOffset("abc")).toBe(0);
  });
});

describe("isValidAddress", () => {
  it("accepts valid checksummed address", () => {
    expect(isValidAddress("0x5B38Da6a701c568545dCfcB03FcB875f56beddC4")).toBe(true);
  });

  it("accepts lowercase address", () => {
    expect(isValidAddress("0x5b38da6a701c568545dcfcb03fcb875f56beddc4")).toBe(true);
  });

  it("rejects wrong length (too short)", () => {
    expect(isValidAddress("0x5B38Da6a701c568545dCfcB03FcB875f56bedd")).toBe(false);
  });

  it("rejects wrong length (too long)", () => {
    expect(isValidAddress("0x5B38Da6a701c568545dCfcB03FcB875f56beddC4aa")).toBe(false);
  });

  it("rejects missing 0x prefix", () => {
    expect(isValidAddress("5B38Da6a701c568545dCfcB03FcB875f56beddC4")).toBe(false);
  });

  it("rejects non-hex characters", () => {
    expect(isValidAddress("0xZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ")).toBe(false);
  });
});

describe("getUrlLookupCandidates", () => {
  it("returns exact and normalized candidates for valid http urls", () => {
    expect(getUrlLookupCandidates("https://Example.com:443/path?q=1#frag")).toEqual(
      expect.arrayContaining([
        "https://Example.com:443/path?q=1#frag",
        "https://example.com/path?q=1",
      ]),
    );
  });

  it("adds trailing slash variants for root urls", () => {
    expect(getUrlLookupCandidates("https://example.com")).toEqual(
      expect.arrayContaining([
        "https://example.com",
        "https://example.com/",
      ]),
    );
  });

  it("rejects blank values", () => {
    expect(getUrlLookupCandidates("   ")).toBeNull();
  });

  it("rejects non-http protocols", () => {
    expect(getUrlLookupCandidates("ftp://example.com")).toBeNull();
  });

  it("rejects invalid urls", () => {
    expect(getUrlLookupCandidates("not a url")).toBeNull();
  });
});
