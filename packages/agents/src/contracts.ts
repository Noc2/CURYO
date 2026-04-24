import { config, getContractEnvName, type BotContractKey } from "./config.js";
import {
  ContentRegistryAbi,
  HumanReputationAbi,
  ProtocolConfigAbi,
  QuestionRewardPoolEscrowAbi,
  RoundRewardDistributorAbi,
  RoundVotingEngineAbi,
  VoterIdNFTAbi,
} from "@curyo/contracts/abis";

function requireContractAddress(contractKey: BotContractKey): `0x${string}` {
  const address = config.contracts[contractKey];
  if (!address) {
    throw new Error(`${getContractEnvName(contractKey)} is required`);
  }

  return address;
}

export const contractConfig = {
  get token() {
    return { address: requireContractAddress("hrepToken"), abi: HumanReputationAbi };
  },
  get registry() {
    return { address: requireContractAddress("contentRegistry"), abi: ContentRegistryAbi };
  },
  get protocolConfigAbi() {
    return ProtocolConfigAbi;
  },
  get questionRewardPoolEscrow() {
    return { address: requireContractAddress("questionRewardPoolEscrow"), abi: QuestionRewardPoolEscrowAbi };
  },
  get votingEngine() {
    return { address: requireContractAddress("votingEngine"), abi: RoundVotingEngineAbi };
  },
  get distributor() {
    return { address: requireContractAddress("roundRewardDistributor"), abi: RoundRewardDistributorAbi };
  },
  get voterIdNFT() {
    return { address: requireContractAddress("voterIdNFT"), abi: VoterIdNFTAbi };
  },
} as const;
