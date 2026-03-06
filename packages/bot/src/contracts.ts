import { config } from "./config.js";
import { ContentRegistryAbi, CuryoReputationAbi, RoundVotingEngineAbi, VoterIdNFTAbi } from "@curyo/contracts/abis";

export { CuryoReputationAbi, ContentRegistryAbi, RoundVotingEngineAbi, VoterIdNFTAbi };

export const contractConfig = {
  token: { address: config.contracts.crepToken, abi: CuryoReputationAbi },
  registry: { address: config.contracts.contentRegistry, abi: ContentRegistryAbi },
  votingEngine: { address: config.contracts.votingEngine, abi: RoundVotingEngineAbi },
  voterIdNFT: { address: config.contracts.voterIdNFT, abi: VoterIdNFTAbi },
} as const;
