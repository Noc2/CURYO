import { createConfig } from "ponder";
import { isAddress } from "viem";
import { http } from "viem";

import {
  CategoryRegistryAbi,
  ContentRegistryAbi,
  CuryoReputationAbi,
  FrontendRegistryAbi,
  ProfileRegistryAbi,
  RoundRewardDistributorAbi,
  RoundVotingEngineAbi,
  VoterIdNFTAbi,
} from "@curyo/contracts/abis";

type PonderNetworkName = "celoSepolia" | "hardhat" | "celo";

const isProduction = process.env.NODE_ENV === "production";

const NETWORKS: Record<
  PonderNetworkName,
  {
    chainId: number;
    defaultRpcUrl: string;
    pollingInterval: number;
  }
> = {
  celoSepolia: {
    chainId: 11142220,
    defaultRpcUrl: "https://forno.celo-sepolia.celo-testnet.org",
    pollingInterval: 5_000,
  },
  hardhat: {
    chainId: 31337,
    defaultRpcUrl: "http://127.0.0.1:8545",
    pollingInterval: 1_000,
  },
  celo: {
    chainId: 42220,
    defaultRpcUrl: "https://forno.celo.org",
    pollingInterval: 5_000,
  },
};

function isPonderNetworkName(value: string | undefined): value is PonderNetworkName {
  return value === "celoSepolia" || value === "hardhat" || value === "celo";
}

function getActiveNetwork(): PonderNetworkName {
  const value = process.env.PONDER_NETWORK;

  if (!value) {
    if (isProduction) {
      throw new Error("Missing PONDER_NETWORK. Set it to hardhat, celoSepolia, or celo.");
    }

    return "hardhat";
  }

  if (!isPonderNetworkName(value)) {
    throw new Error(`Unsupported PONDER_NETWORK "${value}". Use hardhat, celoSepolia, or celo.`);
  }

  return value;
}

const activeNetwork = getActiveNetwork();

function getRpcUrl(network: PonderNetworkName): string {
  const { chainId, defaultRpcUrl } = NETWORKS[network];
  const key = `PONDER_RPC_URL_${chainId}`;
  const value = process.env[key] ?? (!isProduction ? defaultRpcUrl : undefined);

  if (!value) {
    throw new Error(`Missing ${key} for ${network}.`);
  }

  try {
    const url = new URL(value);
    const isLocalhost =
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "::1";

    if (isProduction && isLocalhost) {
      throw new Error(`${key} must not point to localhost in production.`);
    }
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }

    throw new Error(`${key} must be a valid URL.`);
  }

  return value;
}

function getAddress(key: string): `0x${string}` {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing ${key}. Run \`yarn deploy --network <network>\` to sync Ponder addresses for ${activeNetwork}.`);
  }

  if (!isAddress(value)) {
    throw new Error(`${key} must be a valid address.`);
  }

  return value as `0x${string}`;
}

function getStartBlock(key: string): number {
  const value = process.env[key];
  if (!value) return 0;

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${key} must be a non-negative integer.`);
  }

  return Math.floor(parsed);
}

const addresses = {
  contentRegistry: getAddress("PONDER_CONTENT_REGISTRY_ADDRESS"),
  roundVotingEngine: getAddress("PONDER_ROUND_VOTING_ENGINE_ADDRESS"),
  roundRewardDistributor: getAddress("PONDER_ROUND_REWARD_DISTRIBUTOR_ADDRESS"),
  categoryRegistry: getAddress("PONDER_CATEGORY_REGISTRY_ADDRESS"),
  profileRegistry: getAddress("PONDER_PROFILE_REGISTRY_ADDRESS"),
  frontendRegistry: getAddress("PONDER_FRONTEND_REGISTRY_ADDRESS"),
  voterIdNFT: getAddress("PONDER_VOTER_ID_NFT_ADDRESS"),
  curyoReputation: getAddress("PONDER_CREP_ADDRESS"),
};

const startBlocks = {
  contentRegistry: getStartBlock("PONDER_CONTENT_REGISTRY_START_BLOCK"),
  roundVotingEngine: getStartBlock("PONDER_ROUND_VOTING_ENGINE_START_BLOCK"),
  roundRewardDistributor: getStartBlock("PONDER_ROUND_REWARD_DISTRIBUTOR_START_BLOCK"),
  categoryRegistry: getStartBlock("PONDER_CATEGORY_REGISTRY_START_BLOCK"),
  profileRegistry: getStartBlock("PONDER_PROFILE_REGISTRY_START_BLOCK"),
  frontendRegistry: getStartBlock("PONDER_FRONTEND_REGISTRY_START_BLOCK"),
  voterIdNFT: getStartBlock("PONDER_VOTER_ID_NFT_START_BLOCK"),
  curyoReputation: getStartBlock("PONDER_CREP_START_BLOCK"),
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
    [activeNetwork]: {
      chainId: NETWORKS[activeNetwork].chainId,
      transport: http(getRpcUrl(activeNetwork)),
      pollingInterval: NETWORKS[activeNetwork].pollingInterval,
    },
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
