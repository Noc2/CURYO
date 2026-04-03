import { describe, expect, it } from "vitest";
import { formatSubmitUsage, parseSubmitCommandArgs } from "../submitOptions.js";

describe("submit options", () => {
  it("parses category, source, and max submission overrides", () => {
    expect(parseSubmitCommandArgs(["--category", "Movies", "--source", "tmdb", "--max-submissions", "5"])).toEqual({
      options: {
        category: "Movies",
        source: "tmdb",
        maxSubmissions: 5,
      },
    });
  });

  it("supports submit help without requiring runtime config", () => {
    expect(parseSubmitCommandArgs(["--help"])).toEqual({
      help: true,
      options: {},
    });
    expect(formatSubmitUsage()).toContain("--category <id|name>");
    expect(formatSubmitUsage()).toContain("Available categories:");
    expect(formatSubmitUsage()).toContain("1  YouTube");
    expect(formatSubmitUsage()).toContain("11 GitHub Repos");
    expect(formatSubmitUsage()).toContain("wikipedia-people");
    expect(formatSubmitUsage()).toContain("requires YOUTUBE_API_KEY");
    expect(formatSubmitUsage()).toContain("requires GITHUB_TOKEN");
    expect(formatSubmitUsage()).toContain("Deployed categories without automated submit support yet:");
    expect(formatSubmitUsage()).toContain("10 Tweets");
  });

  it("rejects malformed submit options", () => {
    expect(() => parseSubmitCommandArgs(["--max-submissions", "0"])).toThrow(
      "--max-submissions must be a positive integer",
    );
    expect(() => parseSubmitCommandArgs(["--category"])).toThrow("Missing value for --category");
    expect(() => parseSubmitCommandArgs(["movies"])).toThrow("Unexpected positional argument: movies");
    expect(() => parseSubmitCommandArgs(["--unknown"])).toThrow("Unknown option: --unknown");
  });
});
