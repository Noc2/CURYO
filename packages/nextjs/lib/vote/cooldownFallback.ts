import { type Abi, type AbiEvent, type Address } from "viem";

export interface VoteCooldownContractInfo {
  address: Address;
  abi: Abi;
  deployedOnBlock?: number;
}

export function pickVoteCooldownFallbackContract(
  verifiedContract: VoteCooldownContractInfo | undefined,
  configuredContract: VoteCooldownContractInfo | undefined,
) {
  return verifiedContract ?? configuredContract;
}

export function findVoteCommittedEvent(contract: Pick<VoteCooldownContractInfo, "abi"> | undefined) {
  if (!contract) return undefined;

  return contract.abi.find(
    (abiItem): abiItem is AbiEvent => abiItem.type === "event" && abiItem.name === "VoteCommitted",
  );
}
