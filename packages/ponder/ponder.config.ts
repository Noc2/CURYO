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
import {
  getSharedDeploymentAddress as getSharedArtifactAddress,
  getSharedDeploymentStartBlock as getSharedArtifactStartBlock,
} from "@curyo/contracts/deployments";

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
const activeChainId = NETWORKS[activeNetwork].chainId;

function readEnv(key: string): string | undefined {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
}

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

function resolveAddress(key: string, contractName: string): `0x${string}` {
  const sharedAddress = getSharedArtifactAddress(activeChainId, contractName);
  const envValue = readEnv(key);

  if (sharedAddress) {
    if (envValue) {
      if (isAddress(envValue)) {
        if (envValue.toLowerCase() !== sharedAddress.toLowerCase()) {
          console.warn(
            `[ponder config] Ignoring ${key}=${envValue} for chain ${activeChainId}; using ${contractName} from shared deployment artifacts (${sharedAddress}).`,
          );
        }
      } else {
        console.warn(
          `[ponder config] Ignoring invalid ${key} value for chain ${activeChainId}; using ${contractName} from shared deployment artifacts (${sharedAddress}).`,
        );
      }
    }

    return sharedAddress;
  }

  if (!envValue) {
    throw new Error(
      `Missing ${key}. Run \`yarn deploy --network <network>\` to sync Ponder addresses for ${activeNetwork}.`,
    );
  }

  if (!isAddress(envValue)) {
    throw new Error(`${key} must be a valid address.`);
  }

  return envValue as `0x${string}`;
}

function resolveStartBlock(key: string, contractName: string): number {
  const sharedStartBlock = getSharedArtifactStartBlock(activeChainId, contractName);
  const envValue = readEnv(key);

  if (sharedStartBlock !== undefined) {
    if (envValue) {
      const parsedEnvValue = Number(envValue);
      if (!Number.isFinite(parsedEnvValue) || !Number.isInteger(parsedEnvValue) || parsedEnvValue < 0) {
        console.warn(
          `[ponder config] Ignoring invalid ${key} value for chain ${activeChainId}; using ${contractName} start block from shared deployment artifacts (${sharedStartBlock}).`,
        );
      } else if (parsedEnvValue !== sharedStartBlock) {
        console.warn(
          `[ponder config] Ignoring ${key}=${envValue} for chain ${activeChainId}; using ${contractName} start block from shared deployment artifacts (${sharedStartBlock}).`,
        );
      }
    }

    return sharedStartBlock;
  }

  if (!envValue) return 0;

  const parsed = Number(envValue);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${key} must be a non-negative integer.`);
  }

  return Math.floor(parsed);
}

const addresses = {
  contentRegistry: resolveAddress("PONDER_CONTENT_REGISTRY_ADDRESS", "ContentRegistry"),
  roundVotingEngine: resolveAddress("PONDER_ROUND_VOTING_ENGINE_ADDRESS", "RoundVotingEngine"),
  roundRewardDistributor: resolveAddress("PONDER_ROUND_REWARD_DISTRIBUTOR_ADDRESS", "RoundRewardDistributor"),
  categoryRegistry: resolveAddress("PONDER_CATEGORY_REGISTRY_ADDRESS", "CategoryRegistry"),
  profileRegistry: resolveAddress("PONDER_PROFILE_REGISTRY_ADDRESS", "ProfileRegistry"),
  frontendRegistry: resolveAddress("PONDER_FRONTEND_REGISTRY_ADDRESS", "FrontendRegistry"),
  voterIdNFT: resolveAddress("PONDER_VOTER_ID_NFT_ADDRESS", "VoterIdNFT"),
  curyoReputation: resolveAddress("PONDER_CREP_ADDRESS", "CuryoReputation"),
};

const startBlocks = {
  contentRegistry: resolveStartBlock("PONDER_CONTENT_REGISTRY_START_BLOCK", "ContentRegistry"),
  roundVotingEngine: resolveStartBlock("PONDER_ROUND_VOTING_ENGINE_START_BLOCK", "RoundVotingEngine"),
  roundRewardDistributor: resolveStartBlock("PONDER_ROUND_REWARD_DISTRIBUTOR_START_BLOCK", "RoundRewardDistributor"),
  categoryRegistry: resolveStartBlock("PONDER_CATEGORY_REGISTRY_START_BLOCK", "CategoryRegistry"),
  profileRegistry: resolveStartBlock("PONDER_PROFILE_REGISTRY_START_BLOCK", "ProfileRegistry"),
  frontendRegistry: resolveStartBlock("PONDER_FRONTEND_REGISTRY_START_BLOCK", "FrontendRegistry"),
  voterIdNFT: resolveStartBlock("PONDER_VOTER_ID_NFT_START_BLOCK", "VoterIdNFT"),
  curyoReputation: resolveStartBlock("PONDER_CREP_START_BLOCK", "CuryoReputation"),
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
