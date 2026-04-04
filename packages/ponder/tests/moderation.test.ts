import { describe, expect, it } from "vitest";
import {
  buildAsciiWordBoundaryPattern,
  buildSubdomainLikePattern,
  hostMatchesBlockedDomain,
} from "../src/api/moderationPatterns.js";

describe("content moderation helpers", () => {
  it("buildAsciiWordBoundaryPattern matches blocked words without substring false positives", () => {
    const pattern = new RegExp(buildAsciiWordBoundaryPattern(["nsfw", "onlyfans"]), "i");

    expect(pattern.test("This is NSFW artwork")).toBe(true);
    expect(pattern.test("creator links to OnlyFans")).toBe(true);
    expect(pattern.test("snowyfans convention")).toBe(false);
    expect(pattern.test("Essex")).toBe(false);
  });

  it("hostMatchesBlockedDomain matches exact hosts and subdomains", () => {
    expect(hostMatchesBlockedDomain("xhamster.com", "xhamster.com")).toBe(true);
    expect(hostMatchesBlockedDomain("www.xhamster.com", "xhamster.com")).toBe(true);
    expect(hostMatchesBlockedDomain("subdomain.stripchat.com", "stripchat.com")).toBe(true);
    expect(hostMatchesBlockedDomain("notxhamster.com", "xhamster.com")).toBe(false);
  });

  it("buildSubdomainLikePattern produces the SQL LIKE suffix pattern", () => {
    expect(buildSubdomainLikePattern("xhamster.com")).toBe("%.xhamster.com");
  });
});
