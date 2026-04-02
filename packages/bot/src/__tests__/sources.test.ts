import deployedContracts from "@curyo/contracts/deployedContracts";
import { afterEach, describe, expect, it, vi } from "vitest";

const chain11142220 = (deployedContracts as Record<number, Record<string, { address: `0x${string}` }>>)[11142220];
const ORIGINAL_ENV = { ...process.env };

async function loadSources() {
  vi.resetModules();
  process.env = {
    ...ORIGINAL_ENV,
    RPC_URL: "https://rpc.example.com",
    CHAIN_ID: "11142220",
    PONDER_URL: "https://ponder.example.com",
    CREP_TOKEN_ADDRESS: chain11142220?.CuryoReputation?.address ?? "0x1111111111111111111111111111111111111111",
    CONTENT_REGISTRY_ADDRESS: chain11142220?.ContentRegistry?.address ?? "0x2222222222222222222222222222222222222222",
    VOTING_ENGINE_ADDRESS: chain11142220?.RoundVotingEngine?.address ?? "0x3333333333333333333333333333333333333333",
    VOTER_ID_NFT_ADDRESS: chain11142220?.VoterIdNFT?.address ?? "0x4444444444444444444444444444444444444444",
    CATEGORY_REGISTRY_ADDRESS: chain11142220?.CategoryRegistry?.address ?? "0x5555555555555555555555555555555555555555",
    RATE_PRIVATE_KEY: `0x${"11".repeat(32)}`,
    YOUTUBE_API_KEY: "youtube-key",
  };

  return import("../sources/index.js");
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("content sources", () => {
  it("stay aligned with the deployed source category IDs", async () => {
    const { getAllSources } = await loadSources();
    const categoryIdsBySource = Object.fromEntries(getAllSources().map(source => [source.name, source.categoryId]));

    expect(categoryIdsBySource).toEqual({
      youtube: 1n,
      twitch: 2n,
      "wikipedia-people": 5n,
      rawg: 6n,
      openlibrary: 7n,
      huggingface: 8n,
      tmdb: 4n,
      scryfall: 3n,
      coingecko: 9n,
    });
  });

  it("does not register duplicate source category IDs", async () => {
    const { getAllSources } = await loadSources();
    const categoryIds = getAllSources().map(source => source.categoryId.toString());
    expect(new Set(categoryIds).size).toBe(categoryIds.length);
  });
});
