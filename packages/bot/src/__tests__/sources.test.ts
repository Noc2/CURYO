import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
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

function readDeployedCategoryCatalog() {
  const deployScriptPath = fileURLToPath(new URL("../../../foundry/script/DeployCuryo.s.sol", import.meta.url));
  const deployScript = readFileSync(deployScriptPath, "utf8");

  return [...deployScript.matchAll(/registry\.addApprovedCategory\("([^"]+)"/g)].map((match, index) => ({
    categoryId: BigInt(index + 1),
    categoryName: match[1],
  }));
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("content sources", () => {
  it("stay aligned with the deployed source category IDs", async () => {
    const { getAllSources } = await loadSources();
    const categoryMetadataBySource = Object.fromEntries(
      getAllSources().map(source => [source.name, { categoryId: source.categoryId, categoryName: source.categoryName }]),
    );

    expect(categoryMetadataBySource).toEqual({
      youtube: { categoryId: 8n, categoryName: "Media and Images" },
      twitch: { categoryId: 8n, categoryName: "Media and Images" },
      scryfall: { categoryId: 1n, categoryName: "Products" },
      tmdb: { categoryId: 8n, categoryName: "Media and Images" },
      "wikipedia-people": { categoryId: 10n, categoryName: "General Opinion" },
      rawg: { categoryId: 1n, categoryName: "Products" },
      openlibrary: { categoryId: 8n, categoryName: "Media and Images" },
      huggingface: { categoryId: 6n, categoryName: "AI Answers" },
      coingecko: { categoryId: 1n, categoryName: "Products" },
      github: { categoryId: 7n, categoryName: "Documentation and Developer Help" },
    });
  });

  it("deduplicates the submit category catalog", async () => {
    const { getSubmitCategoryCatalog } = await import("../sourceCatalog.js");

    expect(
      getSubmitCategoryCatalog().map(entry => ({
        categoryId: entry.categoryId,
        categoryName: entry.categoryName,
      })),
    ).toEqual([
      { categoryId: 8n, categoryName: "Media and Images" },
      { categoryId: 1n, categoryName: "Products" },
      { categoryId: 10n, categoryName: "General Opinion" },
      { categoryId: 6n, categoryName: "AI Answers" },
      { categoryId: 7n, categoryName: "Documentation and Developer Help" },
    ]);
  });

  it("tracks submit coverage against deployed review categories", async () => {
    const { getCategoryCoverageCatalog, getSubmitCategoryCatalog } = await import("../sourceCatalog.js");
    const coverageCatalog = getCategoryCoverageCatalog();
    const deployedCategories = readDeployedCategoryCatalog();
    const deployedById = new Map(deployedCategories.map(entry => [entry.categoryId.toString(), entry.categoryName]));

    for (const entry of getSubmitCategoryCatalog()) {
      expect(deployedById.get(entry.categoryId.toString())).toBe(entry.categoryName);
    }

    expect(
      coverageCatalog
        .filter(entry => !entry.supportsSubmit)
        .map(entry => entry.sourceName),
    ).toEqual(["twitter", "spotify", "npm", "pypi"]);
  });
});
