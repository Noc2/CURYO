import type { Address, Hex } from "viem";

// Proposal states from IGovernor
export enum ProposalState {
  Pending = 0,
  Active = 1,
  Canceled = 2,
  Defeated = 3,
  Succeeded = 4,
  Queued = 5,
  Expired = 6,
  Executed = 7,
}

export type ProposalAction = {
  target: Address;
  targetName: string;
  functionName: string;
  summary: string;
  value: bigint;
  calldata: Hex;
};

export type Proposal = {
  id: string;
  proposalId: bigint;
  proposer: Address;
  description: string;
  descriptionHash: Hex;
  state: ProposalState;
  forVotes: bigint;
  againstVotes: bigint;
  abstainVotes: bigint;
  startBlock: bigint;
  endBlock: bigint;
  eta: bigint;
  needsQueuing: boolean;
  hasVoted: boolean;
  targets: Address[];
  values: bigint[];
  calldatas: Hex[];
  actions: ProposalAction[];
};
