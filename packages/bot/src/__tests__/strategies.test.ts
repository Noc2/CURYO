import { describe, it, expect, vi } from "vitest";

// Mock config module to avoid env var validation during import
vi.mock("../config.js", () => ({
  config: {
    rpcUrl: "http://localhost:8545",
    chainId: 31337,
    contracts: {
      crepToken: "0x0000000000000000000000000000000000000001",
      contentRegistry: "0x0000000000000000000000000000000000000002",
      votingEngine: "0x0000000000000000000000000000000000000003",
      voterIdNFT: "0x0000000000000000000000000000000000000004",
      categoryRegistry: "0x0000000000000000000000000000000000000005",
    },
    ponderUrl: "http://localhost:42069",
    tmdbApiKey: "test-key",
    youtubeApiKey: undefined,
    rawgApiKey: undefined,
  },
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { getStrategy } from "../strategies/index.js";
import { youtubeStrategy } from "../strategies/youtube.js";
import { wikipediaStrategy } from "../strategies/wikipedia.js";
import { tmdbStrategy } from "../strategies/tmdb.js";

describe("youtubeStrategy.canRate", () => {
  it("accepts youtube.com watch URLs", () => {
    expect(youtubeStrategy.canRate("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(true);
  });

  it("accepts youtu.be short URLs", () => {
    expect(youtubeStrategy.canRate("https://youtu.be/dQw4w9WgXcQ")).toBe(true);
  });

  it("rejects non-YouTube URLs", () => {
    expect(youtubeStrategy.canRate("https://vimeo.com/123456")).toBe(false);
    expect(youtubeStrategy.canRate("https://example.com")).toBe(false);
  });
});

describe("wikipediaStrategy.canRate", () => {
  it("accepts en.wikipedia.org articles", () => {
    expect(wikipediaStrategy.canRate("https://en.wikipedia.org/wiki/Solidity")).toBe(true);
  });

  it("accepts other language wikis", () => {
    expect(wikipediaStrategy.canRate("https://de.wikipedia.org/wiki/Ethereum")).toBe(true);
  });

  it("rejects non-Wikipedia URLs", () => {
    expect(wikipediaStrategy.canRate("https://wikimedia.org/something")).toBe(false);
    expect(wikipediaStrategy.canRate("https://example.com")).toBe(false);
  });
});

describe("tmdbStrategy.canRate", () => {
  it("accepts themoviedb.org movie URLs", () => {
    expect(tmdbStrategy.canRate("https://www.themoviedb.org/movie/550")).toBe(true);
  });

  it("rejects non-TMDB URLs", () => {
    expect(tmdbStrategy.canRate("https://imdb.com/title/tt0137523")).toBe(false);
  });
});

describe("getStrategy", () => {
  it("returns youtubeStrategy for YouTube URLs", () => {
    const strategy = getStrategy("https://www.youtube.com/watch?v=abc123");
    expect(strategy).not.toBeNull();
    expect(strategy!.name).toBe("youtube");
  });

  it("returns wikipediaStrategy for Wikipedia URLs", () => {
    const strategy = getStrategy("https://en.wikipedia.org/wiki/Test");
    expect(strategy).not.toBeNull();
    expect(strategy!.name).toBe("wikipedia");
  });

  it("returns tmdbStrategy for TMDB URLs", () => {
    const strategy = getStrategy("https://www.themoviedb.org/movie/550");
    expect(strategy).not.toBeNull();
    expect(strategy!.name).toBe("tmdb");
  });

  it("returns null for unknown URLs", () => {
    expect(getStrategy("https://example.com")).toBeNull();
  });
});
