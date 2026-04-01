import deployedContracts from "@curyo/contracts/deployedContracts";
import { afterEach, describe, expect, it, vi } from "vitest";

const chain42220 = (deployedContracts as Record<number, Record<string, { address: `0x${string}`; deployedOnBlock?: number }>>)[
  42220
];
const chain11142220 = (deployedContracts as Record<number, Record<string, { address: `0x${string}`; deployedOnBlock?: number }>>)[
  11142220
];
const expectedChain42220StartBlock = Math.min(
  ...Object.values(chain42220)
    .map(contract => contract.deployedOnBlock)
    .filter((value): value is number => Number.isInteger(value) && value >= 0),
);
const expectedContentRegistry42220StartBlock = chain42220.ContentRegistry.deployedOnBlock ?? expectedChain42220StartBlock;
const expectedChainStartBlock = Math.min(
  ...Object.values(chain11142220)
    .map(contract => contract.deployedOnBlock)
    .filter((value): value is number => Number.isInteger(value) && value >= 0),
);
const expectedContentRegistryStartBlock = chain11142220.ContentRegistry.deployedOnBlock ?? expectedChainStartBlock;
const ORIGINAL_ENV = { ...process.env };
const VALID_ENV = {
  PONDER_NETWORK: "celoSepolia",
  PONDER_RPC_URL_11142220: "https://forno.celo-sepolia.celo-testnet.org",
  PONDER_CONTENT_REGISTRY_ADDRESS: chain11142220?.ContentRegistry?.address ?? "0x1111111111111111111111111111111111111111",
  PONDER_ROUND_VOTING_ENGINE_ADDRESS:
    chain11142220?.RoundVotingEngine?.address ?? "0x2222222222222222222222222222222222222222",
  PONDER_ROUND_REWARD_DISTRIBUTOR_ADDRESS:
    chain11142220?.RoundRewardDistributor?.address ?? "0x3333333333333333333333333333333333333333",
  PONDER_CATEGORY_REGISTRY_ADDRESS: chain11142220?.CategoryRegistry?.address ?? "0x4444444444444444444444444444444444444444",
  PONDER_PROFILE_REGISTRY_ADDRESS: chain11142220?.ProfileRegistry?.address ?? "0x5555555555555555555555555555555555555555",
  PONDER_FRONTEND_REGISTRY_ADDRESS:
    chain11142220?.FrontendRegistry?.address ?? "0x6666666666666666666666666666666666666666",
  PONDER_VOTER_ID_NFT_ADDRESS: chain11142220?.VoterIdNFT?.address ?? "0x7777777777777777777777777777777777777777",
  PONDER_CREP_ADDRESS: chain11142220?.CuryoReputation?.address ?? "0x8888888888888888888888888888888888888888",
  PONDER_CONTENT_REGISTRY_START_BLOCK: String(expectedContentRegistryStartBlock),
};

async function loadPonderConfig(overrides: Record<string, string | undefined> = {}, removals: string[] = []) {
  vi.resetModules();
  process.env = {
    ...ORIGINAL_ENV,
    ...VALID_ENV,
    ...overrides,
  };

  for (const key of removals) {
    delete process.env[key];
  }

  return import("./ponder.config.ts");
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("ponder config", () => {
  it("derives supported-chain addresses and start blocks from shared deployment artifacts", async () => {
    const { default: config } = await loadPonderConfig(
      {},
      [
        "PONDER_CONTENT_REGISTRY_ADDRESS",
        "PONDER_ROUND_VOTING_ENGINE_ADDRESS",
        "PONDER_ROUND_REWARD_DISTRIBUTOR_ADDRESS",
        "PONDER_CATEGORY_REGISTRY_ADDRESS",
        "PONDER_PROFILE_REGISTRY_ADDRESS",
        "PONDER_FRONTEND_REGISTRY_ADDRESS",
        "PONDER_VOTER_ID_NFT_ADDRESS",
        "PONDER_CREP_ADDRESS",
        "PONDER_CONTENT_REGISTRY_START_BLOCK",
      ],
    );

    const loadedConfig = config as any;

    expect(loadedConfig.contracts.ContentRegistry.network.celoSepolia.address).toBe(chain11142220.ContentRegistry.address);
    expect(loadedConfig.contracts.RoundVotingEngine.network.celoSepolia.address).toBe(
      chain11142220.RoundVotingEngine.address,
    );
    expect(loadedConfig.contracts.CuryoReputation.network.celoSepolia.address).toBe(chain11142220.CuryoReputation.address);
    expect(loadedConfig.contracts.ContentRegistry.network.celoSepolia.startBlock).toBe(
      expectedContentRegistryStartBlock,
    );
  });

  it("derives Celo mainnet addresses and start blocks from shared deployment artifacts", async () => {
    const { default: config } = await loadPonderConfig(
      {
        PONDER_NETWORK: "celo",
        PONDER_RPC_URL_42220: "https://forno.celo.org",
      },
      [
        "PONDER_CONTENT_REGISTRY_ADDRESS",
        "PONDER_ROUND_VOTING_ENGINE_ADDRESS",
        "PONDER_ROUND_REWARD_DISTRIBUTOR_ADDRESS",
        "PONDER_CATEGORY_REGISTRY_ADDRESS",
        "PONDER_PROFILE_REGISTRY_ADDRESS",
        "PONDER_FRONTEND_REGISTRY_ADDRESS",
        "PONDER_VOTER_ID_NFT_ADDRESS",
        "PONDER_CREP_ADDRESS",
        "PONDER_HUMAN_FAUCET_ADDRESS",
        "PONDER_PARTICIPATION_POOL_ADDRESS",
        "PONDER_CONTENT_REGISTRY_START_BLOCK",
      ],
    );

    const loadedConfig = config as any;

    expect(loadedConfig.contracts.ContentRegistry.network.celo.address).toBe(chain42220.ContentRegistry.address);
    expect(loadedConfig.contracts.RoundVotingEngine.network.celo.address).toBe(chain42220.RoundVotingEngine.address);
    expect(loadedConfig.contracts.CuryoReputation.network.celo.address).toBe(chain42220.CuryoReputation.address);
    expect(loadedConfig.contracts.HumanFaucet.network.celo.address).toBe(chain42220.HumanFaucet.address);
    expect(loadedConfig.contracts.ContentRegistry.network.celo.startBlock).toBe(expectedContentRegistry42220StartBlock);
  });

  it("ignores stale Ponder env overrides when shared deployment artifacts exist", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { default: config } = await loadPonderConfig({
      PONDER_CONTENT_REGISTRY_ADDRESS: "0x1111111111111111111111111111111111111111",
      PONDER_CONTENT_REGISTRY_START_BLOCK: "1",
    });

    const loadedConfig = config as any;

    expect(loadedConfig.contracts.ContentRegistry.network.celoSepolia.address).toBe(chain11142220.ContentRegistry.address);
    expect(loadedConfig.contracts.ContentRegistry.network.celoSepolia.startBlock).toBe(
      expectedContentRegistryStartBlock,
    );
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Ignoring PONDER_CONTENT_REGISTRY_ADDRESS"));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Ignoring PONDER_CONTENT_REGISTRY_START_BLOCK"));
  });
});
