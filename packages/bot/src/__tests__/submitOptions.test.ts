import { describe, expect, it } from "vitest";
import { formatSubmitUsage, parseSubmitCommandArgs } from "../submitOptions.js";

describe("submit options", () => {
  it("parses category, source, and max submission overrides", () => {
    expect(parseSubmitCommandArgs(["--category", "Media", "--source", "youtube", "--max-submissions", "5"])).toEqual({
      options: {
        category: "Media",
        source: "youtube",
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
    expect(formatSubmitUsage()).toContain("4  Media");
    expect(formatSubmitUsage()).toContain("youtube");
    expect(formatSubmitUsage()).toContain("requires YOUTUBE_API_KEY");
    expect(formatSubmitUsage()).not.toContain("Additional source adapters without automated submit support yet:");
    expect(formatSubmitUsage()).not.toContain("Text");
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
