import {
  type VoteCooldownContractInfo,
  findVoteCommittedEvent,
  pickVoteCooldownFallbackContract,
} from "./cooldownFallback";
import assert from "node:assert/strict";
import test from "node:test";
import { type Abi } from "viem";

const voteCommittedAbi = [
  {
    type: "event",
    name: "VoteCommitted",
    inputs: [
      { name: "contentId", type: "uint256", indexed: true },
      { name: "voter", type: "address", indexed: true },
    ],
  },
] as const satisfies Abi;

const configuredContract: VoteCooldownContractInfo = {
  address: "0x0000000000000000000000000000000000000001",
  abi: voteCommittedAbi,
  deployedOnBlock: 123,
};

const verifiedContract: VoteCooldownContractInfo = {
  address: "0x0000000000000000000000000000000000000002",
  abi: voteCommittedAbi,
  deployedOnBlock: 456,
};

test("vote cooldown fallback uses configured metadata when verified contract info is unavailable", () => {
  assert.equal(pickVoteCooldownFallbackContract(undefined, configuredContract), configuredContract);
});

test("vote cooldown fallback prefers verified contract info when deployment probing succeeds", () => {
  assert.equal(pickVoteCooldownFallbackContract(verifiedContract, configuredContract), verifiedContract);
});

test("findVoteCommittedEvent returns the event needed for cooldown log queries", () => {
  const event = findVoteCommittedEvent(configuredContract);

  assert.equal(event?.type, "event");
  assert.equal(event?.name, "VoteCommitted");
});
