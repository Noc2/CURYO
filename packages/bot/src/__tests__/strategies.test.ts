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
    youtubeApiKey: undefined,
  },
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { getStrategy } from "../strategies/index.js";
import { youtubeStrategy } from "../strategies/youtube.js";

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

describe("getStrategy", () => {
  it("returns youtubeStrategy for YouTube URLs", () => {
    const strategy = getStrategy("https://www.youtube.com/watch?v=abc123");
    expect(strategy).not.toBeNull();
    expect(strategy!.name).toBe("youtube");
  });

  it("returns null for unknown URLs", () => {
    expect(getStrategy("https://example.com")).toBeNull();
    expect(getStrategy("https://github.com/vercel/ai")).toBeNull();
  });
});
