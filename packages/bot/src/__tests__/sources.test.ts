import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import deployedContracts from "@curyo/contracts/deployedContracts";
import { afterEach, describe, expect, it, vi } from "vitest";

const chain31337 = (deployedContracts as Record<number, Record<string, { address: `0x${string}` }>>)[31337];
const ORIGINAL_ENV = { ...process.env };

async function loadSources() {
  vi.resetModules();
  process.env = {
    ...ORIGINAL_ENV,
    RPC_URL: "https://rpc.example.com",
    CHAIN_ID: "31337",
    PONDER_URL: "https://ponder.example.com",
    CREP_TOKEN_ADDRESS: chain31337?.CuryoReputation?.address ?? "0x1111111111111111111111111111111111111111",
    CONTENT_REGISTRY_ADDRESS: chain31337?.ContentRegistry?.address ?? "0x2222222222222222222222222222222222222222",
    VOTING_ENGINE_ADDRESS: chain31337?.RoundVotingEngine?.address ?? "0x3333333333333333333333333333333333333333",
    VOTER_ID_NFT_ADDRESS: chain31337?.VoterIdNFT?.address ?? "0x4444444444444444444444444444444444444444",
    CATEGORY_REGISTRY_ADDRESS: chain31337?.CategoryRegistry?.address ?? "0x5555555555555555555555555555555555555555",
    RATE_PRIVATE_KEY: `0x${"11".repeat(32)}`,
    YOUTUBE_API_KEY: "youtube-key",
  };

  return import("../sources/index.js");
}

function readDeployedCategoryCatalog() {
  const deployScriptPath = fileURLToPath(new URL("../../../foundry/script/DeployCuryo.s.sol", import.meta.url));
  const deployScript = readFileSync(deployScriptPath, "utf8");

  return [...deployScript.matchAll(/registry\.addCategory\("([^"]+)"/g)].map((match, index) => ({
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
      youtube: { categoryId: 4n, categoryName: "Media" },
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
      { categoryId: 4n, categoryName: "Media" },
    ]);
  });

  it("keeps submit categories present in deployed review categories", async () => {
    const { getSubmitCategoryCatalog } = await import("../sourceCatalog.js");
    const deployedCategories = readDeployedCategoryCatalog();
    const deployedById = new Map(deployedCategories.map(entry => [entry.categoryId.toString(), entry.categoryName]));

    for (const entry of getSubmitCategoryCatalog()) {
      expect(deployedById.get(entry.categoryId.toString())).toBe(entry.categoryName);
    }
  });
});
