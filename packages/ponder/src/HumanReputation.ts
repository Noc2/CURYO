import { getSharedDeploymentAddress } from "@curyo/contracts/deployments";
import { ponder } from "ponder:registry";
import { tokenHolder, tokenTransfer } from "ponder:schema";
import { isAddress } from "viem";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const PONDER_NETWORK_CHAIN_IDS: Record<string, number> = {
  hardhat: 31337,
  celoSepolia: 11142220,
  celo: 42220,
};

const INDEXED_CONTRACT_NAMES = [
  "ContentRegistry",
  "RoundVotingEngine",
  "RoundRewardDistributor",
  "CategoryRegistry",
  "ProfileRegistry",
  "FrontendRegistry",
  "VoterIdNFT",
  "HumanReputation",
  "HumanFaucet",
  "ParticipationPool",
  "QuestionRewardPoolEscrow",
  "FeedbackBonusEscrow",
] as const;

function addExcludedAddress(addresses: Set<string>, address: string | undefined) {
  if (address && isAddress(address)) {
    addresses.add(address.toLowerCase());
  }
}

function buildExcludedAddresses() {
  const addresses = new Set<string>();
  const networkName = process.env.PONDER_NETWORK || "hardhat";
  const chainId = PONDER_NETWORK_CHAIN_IDS[networkName];

  if (chainId !== undefined) {
    for (const contractName of INDEXED_CONTRACT_NAMES) {
      addExcludedAddress(addresses, getSharedDeploymentAddress(chainId, contractName));
    }
  }

  addExcludedAddress(addresses, process.env.PONDER_DEPLOYER_ADDRESS?.trim());

  return addresses;
}

const excludedAddresses = buildExcludedAddresses();

ponder.on("HumanReputation:Transfer", async ({ event, context }) => {
  const { from, to, value } = event.args;

  // Record every transfer for balance history
  await context.db
    .insert(tokenTransfer)
    .values({
      id: `${event.transaction.hash}-${event.log.logIndex}`,
      from: from,
      to: to,
      amount: value,
      blockNumber: event.block.number,
      timestamp: event.block.timestamp,
    })
    .onConflictDoNothing();

  // Track token holders (skip burns and known contracts)
  if (to === ZERO_ADDRESS) return;
  if (excludedAddresses.has(to.toLowerCase())) return;

  await context.db
    .insert(tokenHolder)
    .values({
      address: to,
      firstSeenAt: event.block.timestamp,
    })
    .onConflictDoNothing();
});
