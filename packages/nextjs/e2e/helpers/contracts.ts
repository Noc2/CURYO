/**
 * Contract addresses for local Anvil (chain 31337).
 *
 * Reads from the auto-generated deployedContracts.ts so addresses stay in sync
 * after redeploys.  The import uses a relative path because the E2E tests run
 * outside the Next.js bundler (no `~~/*` alias).
 */
import deployedContracts from "@curyo/contracts/deployedContracts";

const chain31337 = (deployedContracts as Record<number, any>)[31337];

export const CONTRACT_ADDRESSES = {
  CuryoReputation: chain31337.CuryoReputation.address,
  ContentRegistry: chain31337.ContentRegistry.address,
  RoundVotingEngine: chain31337.RoundVotingEngine.address,
  RoundRewardDistributor: chain31337.RoundRewardDistributor.address,
  FrontendRegistry: chain31337.FrontendRegistry.address,
  CategoryRegistry: chain31337.CategoryRegistry.address,
  VoterIdNFT: chain31337.VoterIdNFT.address,
  ParticipationPool: chain31337.ParticipationPool.address,
  HumanFaucet: chain31337.HumanFaucet.address,
} as const;
