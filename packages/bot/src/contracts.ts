import { config } from "./config.js";
import { CuryoReputationAbi } from "./abis/CuryoReputationAbi.js";
import { ContentRegistryAbi } from "./abis/ContentRegistryAbi.js";
import { RoundVotingEngineAbi } from "./abis/RoundVotingEngineAbi.js";
import { VoterIdNFTAbi } from "./abis/VoterIdNFTAbi.js";

export { CuryoReputationAbi, ContentRegistryAbi, RoundVotingEngineAbi, VoterIdNFTAbi };

export const contractConfig = {
  token: { address: config.contracts.crepToken, abi: CuryoReputationAbi },
  registry: { address: config.contracts.contentRegistry, abi: ContentRegistryAbi },
  votingEngine: { address: config.contracts.votingEngine, abi: RoundVotingEngineAbi },
  voterIdNFT: { address: config.contracts.voterIdNFT, abi: VoterIdNFTAbi },
} as const;
