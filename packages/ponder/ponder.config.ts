import { createConfig } from "ponder";
import { http } from "viem";

import { ContentRegistryAbi } from "./abis/ContentRegistryAbi";
import { RoundVotingEngineAbi } from "./abis/RoundVotingEngineAbi";
import { RoundRewardDistributorAbi } from "./abis/RoundRewardDistributorAbi";
import { CategoryRegistryAbi } from "./abis/CategoryRegistryAbi";
import { ProfileRegistryAbi } from "./abis/ProfileRegistryAbi";
import { FrontendRegistryAbi } from "./abis/FrontendRegistryAbi";
import { VoterIdNFTAbi } from "./abis/VoterIdNFTAbi";
import { CuryoReputationAbi } from "./abis/CuryoReputationAbi";

type PonderNetworkName = "celoSepolia" | "hardhat" | "celo";

const NETWORKS: Record<PonderNetworkName, { chainId: number; transport: ReturnType<typeof http>; pollingInterval: number }> = {
  celoSepolia: {
    chainId: 11142220,
    transport: http(process.env.PONDER_RPC_URL_11142220 ?? "https://forno.celo-sepolia.celo-testnet.org"),
    pollingInterval: 5_000,
  },
  hardhat: {
    chainId: 31337,
    transport: http(process.env.PONDER_RPC_URL_31337 ?? "http://127.0.0.1:8545"),
    pollingInterval: 1_000,
  },
  celo: {
    chainId: 42220,
    transport: http(process.env.PONDER_RPC_URL_42220 ?? "https://forno.celo.org"),
    pollingInterval: 5_000,
  },
};

function isPonderNetworkName(value: string | undefined): value is PonderNetworkName {
  return value === "celoSepolia" || value === "hardhat" || value === "celo";
}

const activeNetwork: PonderNetworkName = isPonderNetworkName(process.env.PONDER_NETWORK)
  ? process.env.PONDER_NETWORK
  : "celoSepolia";

const useCeloSepoliaFallbacks = activeNetwork === "celoSepolia";

function getAddress(key: string, fallback?: `0x${string}`): `0x${string}` {
  const value = process.env[key] ?? fallback;
  if (!value) {
    throw new Error(
      `Missing ${key}. Run \`yarn deploy --network <network>\` to sync Ponder addresses for ${activeNetwork}.`
    );
  }
  return value as `0x${string}`;
}

function getStartBlock(key: string, fallback?: string): number {
  const value = process.env[key] ?? fallback;
  if (!value) return 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
}

const addresses = {
  contentRegistry: getAddress(
    "PONDER_CONTENT_REGISTRY_ADDRESS",
    useCeloSepoliaFallbacks ? "0xD414e85c03336f3A0d38E9De5484f119798d6cEB" : undefined
  ),
  roundVotingEngine: getAddress(
    "PONDER_ROUND_VOTING_ENGINE_ADDRESS",
    useCeloSepoliaFallbacks ? "0x326BfA5E83f0208F9522b2A4445c06F9Af401EfD" : undefined
  ),
  roundRewardDistributor: getAddress(
    "PONDER_ROUND_REWARD_DISTRIBUTOR_ADDRESS",
    useCeloSepoliaFallbacks ? "0xc0b29e1ab446f92c60AcC3A7d14aC916a3C8406e" : undefined
  ),
  categoryRegistry: getAddress(
    "PONDER_CATEGORY_REGISTRY_ADDRESS",
    useCeloSepoliaFallbacks ? "0xce8E381c80948a36a15fa1BbE3fd7d2c2447837f" : undefined
  ),
  profileRegistry: getAddress(
    "PONDER_PROFILE_REGISTRY_ADDRESS",
    useCeloSepoliaFallbacks ? "0x9747f616355A0D09488CA313bA7610527f383281" : undefined
  ),
  frontendRegistry: getAddress(
    "PONDER_FRONTEND_REGISTRY_ADDRESS",
    useCeloSepoliaFallbacks ? "0x1Cc5A7FC98F19027d309b50b785D7dd3bA2487aB" : undefined
  ),
  voterIdNFT: getAddress(
    "PONDER_VOTER_ID_NFT_ADDRESS",
    useCeloSepoliaFallbacks ? "0xfE9a781216D615f7e68E35F6A3c64D59Cd0346AA" : undefined
  ),
  curyoReputation: getAddress(
    "PONDER_CREP_ADDRESS",
    useCeloSepoliaFallbacks ? "0x82ab8d0f060bA7eEE8611aB6fd1c1901db49C70E" : undefined
  ),
};

const startBlocks = {
  contentRegistry: getStartBlock(
    "PONDER_CONTENT_REGISTRY_START_BLOCK",
    useCeloSepoliaFallbacks ? "18500238" : undefined
  ),
  roundVotingEngine: getStartBlock(
    "PONDER_ROUND_VOTING_ENGINE_START_BLOCK",
    useCeloSepoliaFallbacks ? "18500238" : undefined
  ),
  roundRewardDistributor: getStartBlock(
    "PONDER_ROUND_REWARD_DISTRIBUTOR_START_BLOCK",
    useCeloSepoliaFallbacks ? "18500238" : undefined
  ),
  categoryRegistry: getStartBlock(
    "PONDER_CATEGORY_REGISTRY_START_BLOCK",
    useCeloSepoliaFallbacks ? "18500238" : undefined
  ),
  profileRegistry: getStartBlock(
    "PONDER_PROFILE_REGISTRY_START_BLOCK",
    useCeloSepoliaFallbacks ? "18500238" : undefined
  ),
  frontendRegistry: getStartBlock(
    "PONDER_FRONTEND_REGISTRY_START_BLOCK",
    useCeloSepoliaFallbacks ? "18500238" : undefined
  ),
  voterIdNFT: getStartBlock(
    "PONDER_VOTER_ID_NFT_START_BLOCK",
    useCeloSepoliaFallbacks ? "18500238" : undefined
  ),
  curyoReputation: getStartBlock(
    "PONDER_CREP_START_BLOCK",
    useCeloSepoliaFallbacks ? "18500238" : undefined
  ),
};

function contractOnActiveNetwork(address: `0x${string}`, startBlock: number) {
  return {
    [activeNetwork]: {
      address,
      startBlock,
    },
  };
}

export default createConfig({
  networks: {
    [activeNetwork]: NETWORKS[activeNetwork],
  },

  contracts: {
    ContentRegistry: {
      abi: ContentRegistryAbi,
      network: contractOnActiveNetwork(addresses.contentRegistry, startBlocks.contentRegistry),
    },
    RoundVotingEngine: {
      abi: RoundVotingEngineAbi,
      network: contractOnActiveNetwork(addresses.roundVotingEngine, startBlocks.roundVotingEngine),
    },
    RoundRewardDistributor: {
      abi: RoundRewardDistributorAbi,
      network: contractOnActiveNetwork(addresses.roundRewardDistributor, startBlocks.roundRewardDistributor),
    },
    CategoryRegistry: {
      abi: CategoryRegistryAbi,
      network: contractOnActiveNetwork(addresses.categoryRegistry, startBlocks.categoryRegistry),
    },
    ProfileRegistry: {
      abi: ProfileRegistryAbi,
      network: contractOnActiveNetwork(addresses.profileRegistry, startBlocks.profileRegistry),
    },
    FrontendRegistry: {
      abi: FrontendRegistryAbi,
      network: contractOnActiveNetwork(addresses.frontendRegistry, startBlocks.frontendRegistry),
    },
    VoterIdNFT: {
      abi: VoterIdNFTAbi,
      network: contractOnActiveNetwork(addresses.voterIdNFT, startBlocks.voterIdNFT),
    },
    CuryoReputation: {
      abi: CuryoReputationAbi,
      network: contractOnActiveNetwork(addresses.curyoReputation, startBlocks.curyoReputation),
    },
  },
});
